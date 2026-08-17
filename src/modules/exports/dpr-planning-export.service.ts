import ExcelJS from "exceljs";
import { format, parseISO } from "date-fns";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@db";
import { customers, dprRecords, plumbers, projectSites, sitePlans } from "@db/schema";
import { customerStatCondition } from "@modules/customers/customer-completion";
import { applyDataStyle, applyHeaderStyle } from "./flat-register";
import { buildExportFilename } from "./workbook-helpers";
import type { DprPlanningExportQuery } from "./exports.types";

/**
 * Fixed activity checklist for the daily DPR/Planning summary (§ report spec).
 * `statKey` is only set where `customer-completion.ts`'s STAT_CONDITION_SQL - the
 * single canonical source already used by the admin dashboard and Customer Register
 * export (`customerExportService` filters by the same keys) - actually defines that
 * condition. Activities without a key have no authoritative backend definition yet
 * and are rendered with a blank count rather than a fabricated 0 (never guess).
 */
const ACTIVITIES: Array<{ label: string; statKey?: string }> = [
  { label: "Survey Done", statKey: "survey-done" },
  { label: "GI Done", statKey: "gi-done" },
  { label: "GC Done", statKey: "gc-done" },
  { label: "Laying" },
  { label: "Valve Chamber" },
  { label: "Pre Commissioning" },
  { label: "Conversion Done", statKey: "conversion-done" },
  { label: "JMR Done", statKey: "jmr-done" },
  { label: "Site Expenses Done" },
  { label: "Flushing / Testing" },
  { label: "Route Marker / Pole Marker" },
  { label: "Commissioning", statKey: "commissioning-done" },
];

type SiteBlock = { siteId: string; siteLabel: string; customerIds: string[] };

// A block's customer scope is "customers with a site plan or DPR filed at this
// site on this date" - the same activity the redesigned DPR/Planning page shows -
// not every customer ever assigned to the site.
async function resolveSiteBlocks(query: DprPlanningExportQuery): Promise<SiteBlock[]> {
  const db = getDb();
  const planConditions = [
    eq(sitePlans.date, query.date),
    query.projectId ? eq(sitePlans.projectId, query.projectId) : undefined,
    query.supervisorId ? eq(sitePlans.supervisorId, query.supervisorId) : undefined,
  ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));
  const dprConditions = [
    eq(dprRecords.date, query.date),
    query.projectId ? eq(dprRecords.projectId, query.projectId) : undefined,
    query.supervisorId ? eq(dprRecords.supervisorId, query.supervisorId) : undefined,
  ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

  const [plans, dprs] = await Promise.all([
    db.select({ siteId: sitePlans.siteId, customerId: sitePlans.customerId }).from(sitePlans).where(and(...planConditions)),
    db.select({ siteId: dprRecords.siteId, customerId: dprRecords.customerId }).from(dprRecords).where(and(...dprConditions)),
  ]);

  const bySite = new Map<string, Set<string>>();
  [...plans, ...dprs].forEach((row) => {
    const set = bySite.get(row.siteId) ?? new Set<string>();
    set.add(row.customerId);
    bySite.set(row.siteId, set);
  });
  if (!bySite.size) return [];

  const siteIds = Array.from(bySite.keys());
  const siteRows = await db
    .select({ id: projectSites.id, name: projectSites.name, address: projectSites.address })
    .from(projectSites)
    .where(inArray(projectSites.id, siteIds));
  const siteLabelById = new Map(siteRows.map((site) => [site.id, site.address || site.name]));

  return siteIds.map((siteId) => ({
    siteId,
    siteLabel: siteLabelById.get(siteId) ?? "Unknown site",
    customerIds: Array.from(bySite.get(siteId) ?? []),
  }));
}

type ActivityResult = { label: string; count: number | null; plumberNames: string[] };

async function computeActivityResults(customerIds: string[]): Promise<ActivityResult[]> {
  const db = getDb();
  const plumberRows = await db.select({ id: plumbers.id, name: plumbers.name }).from(plumbers);
  const plumberNameById = new Map(plumberRows.map((row) => [row.id, row.name]));

  const results: ActivityResult[] = [];
  for (const activity of ACTIVITIES) {
    const condition = activity.statKey ? customerStatCondition(activity.statKey) : undefined;
    if (!condition) {
      results.push({ label: activity.label, count: null, plumberNames: [] });
      continue;
    }

    const matches = await db
      .select({ id: customers.id, plumberId: customers.plumberId })
      .from(customers)
      .where(and(inArray(customers.id, customerIds), condition));

    const plumberNames = Array.from(
      new Set(
        matches
          .map((match) => (match.plumberId ? plumberNameById.get(match.plumberId) : undefined))
          .filter((name): name is string => Boolean(name)),
      ),
    );
    results.push({ label: activity.label, count: matches.length, plumberNames });
  }
  return results;
}

function applyCountCellStyle(cell: ExcelJS.Cell) {
  applyDataStyle(cell, "text");
  cell.alignment = { horizontal: "center", vertical: "middle" };
  cell.numFmt = "0";
}

function writeDprPlanningSheet(
  sheet: ExcelJS.Worksheet,
  dateLabel: string,
  blocks: Array<{ siteLabel: string; activities: ActivityResult[] }>,
) {
  sheet.getColumn(1).width = 30;
  sheet.getColumn(2).width = 16;
  sheet.getColumn(3).width = 34;

  let row = 1;
  sheet.mergeCells(row, 1, row, 3);
  const titleCell = sheet.getCell(row, 1);
  titleCell.value = "DPR / PLANNING";
  titleCell.font = { name: "Calibri", size: 14, bold: true, color: { argb: "FF1A1A1A" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(row).height = 26;
  row += 2;

  blocks.forEach((block) => {
    const metaRow = sheet.getRow(row);
    metaRow.getCell(1).value = `Date: ${dateLabel}`;
    metaRow.getCell(2).value = `Address / Site: ${block.siteLabel}`;
    metaRow.eachCell((cell) => {
      cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF1A1A1A" } };
      cell.alignment = { vertical: "middle" };
    });
    metaRow.height = 18;
    row += 1;

    const headerRow = sheet.getRow(row);
    ["Work / Activity", "Customer Count", "Plumber / Labour"].forEach((label, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = label;
      applyHeaderStyle(cell, true);
    });
    headerRow.height = 20;
    row += 1;

    block.activities.forEach((activity) => {
      const dataRow = sheet.getRow(row);

      const activityCell = dataRow.getCell(1);
      activityCell.value = activity.label;
      applyDataStyle(activityCell, "text");

      const countCell = dataRow.getCell(2);
      countCell.value = activity.count;
      applyCountCellStyle(countCell);

      const plumberCell = dataRow.getCell(3);
      plumberCell.value = activity.count === null ? "Not yet tracked" : activity.plumberNames.join(", ") || null;
      applyDataStyle(plumberCell, "text");
      if (activity.count === null) plumberCell.font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF6B7280" } };

      dataRow.height = 16;
      row += 1;
    });

    row += 1;
  });
}

export const dprPlanningExportService = {
  async build(query: DprPlanningExportQuery) {
    const siteBlocks = await resolveSiteBlocks(query);
    const blocks = await Promise.all(
      siteBlocks.map(async (block) => ({
        siteLabel: block.siteLabel,
        activities: await computeActivityResults(block.customerIds),
      })),
    );

    const dateLabel = format(parseISO(query.date), "dd-MM-yyyy");

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "HN Enterprises";
    const sheet = workbook.addWorksheet("DPR-PLANNING", {
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    writeDprPlanningSheet(sheet, dateLabel, blocks);

    const filename = buildExportFilename(["DPR-Planning", dateLabel]);
    return { workbook, filename };
  },
};
