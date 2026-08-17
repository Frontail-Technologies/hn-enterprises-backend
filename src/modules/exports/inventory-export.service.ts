import ExcelJS from "exceljs";
import { format } from "date-fns";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@db";
import { customers, materials, plumbers, projects } from "@db/schema";
import { computeStockStatus, materialsService } from "@modules/materials/materials.service";
import { buildExportFilename } from "./workbook-helpers";
import { dateOf, numOf, textOf, writeFlatRegisterSheet, type FlatColumn } from "./flat-register";
import type {
  InventoryConsumptionExportQuery,
  InventoryPbgConsumptionExportQuery,
  InventoryPbgIssueExportQuery,
  InventoryPlumberBalanceExportQuery,
  InventoryPurchaseExportQuery,
  InventoryStockExportQuery,
  InventoryStoreIssueExportQuery,
  InventoryTotalIssueExportQuery,
} from "./exports.types";

/**
 * Excel exports for the Inventory & Material module's 8 operational registers.
 * Reuses materialsService for every actual number (listEffectiveTransactions,
 * plumberBalances, stockBalances, computeStockStatus) rather than recomputing
 * ledger logic here - this module is purely presentation (columns, styling,
 * filenames) over data the service layer already produces.
 */

const SOURCE_LABELS: Record<string, string> = { purchase: "Purchase", pbg: "PBG" };
function sourceLabel(source: string | null) {
  return source ? (SOURCE_LABELS[source] ?? source) : null;
}

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  low_stock: "Low Stock",
  out_of_stock: "Out of Stock",
};

/** "August-2026" when `from`/`to` span exactly one calendar month, else undefined
 * (an all-time export, or a range that isn't a clean single month). */
function monthLabelFromRange(from: string | undefined, to: string | undefined): string | undefined {
  if (!from || !to) return undefined;
  const fromDate = new Date(`${from}T00:00:00Z`);
  const toDate = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) return undefined;
  if (fromDate.getUTCDate() !== 1) return undefined;
  const sameMonth = fromDate.getUTCFullYear() === toDate.getUTCFullYear() && fromDate.getUTCMonth() === toDate.getUTCMonth();
  const lastDayOfMonth = new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth() + 1, 0)).getUTCDate();
  if (!sameMonth || toDate.getUTCDate() !== lastDayOfMonth) return undefined;
  return format(fromDate, "MMMM-yyyy");
}

// Project names are free text and can run long - capped so a filter never produces
// an "excessively long" filename (§11).
const MAX_FILENAME_PROJECT_LENGTH = 24;

async function resolveProjectName(projectId: string | undefined): Promise<string | undefined> {
  if (!projectId) return undefined;
  if (projectId === "unassigned") return "Central-Unassigned";
  const db = getDb();
  const [project] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project?.name) return undefined;
  return project.name.length > MAX_FILENAME_PROJECT_LENGTH
    ? project.name.slice(0, MAX_FILENAME_PROJECT_LENGTH).trim()
    : project.name;
}

function newWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HN Enterprises";
  return workbook;
}

// ---------------------------------------------------------------------------
// 1. Stock Sheet
// ---------------------------------------------------------------------------

export const inventoryExportService = {
  async stockSheet(query: InventoryStockExportQuery) {
    const db = getDb();
    const materialRows = await db.select().from(materials).orderBy(materials.name);

    // "All Projects + All Sources" -> materials.currentBalance (the authoritative
    // global store balance). Either filter set -> the same project/source-aware
    // derived-balance calculation the web Stock Sheet uses (§4) - never a
    // date-range movement sum mislabeled as a balance.
    const isFiltered = Boolean(query.projectId || query.source);
    const derivedBalances = isFiltered
      ? await materialsService.stockBalances({ projectId: query.projectId, source: query.source })
      : [];
    const balanceByMaterialId = new Map(derivedBalances.map((row) => [row.materialId, row.balance]));

    type Row = (typeof materialRows)[number];
    const columns: FlatColumn<Row>[] = [
      { header: "S.No.", type: "num", width: 8, get: (_row, rowNumber) => rowNumber },
      { header: "Item Name", type: "text", width: 30, get: (row) => textOf(row.name) },
      { header: "Category", type: "text", width: 20, get: (row) => textOf(row.category) },
      { header: "Unit", type: "text", width: 10, get: (row) => textOf(row.unit) },
      {
        header: "Current Balance",
        type: "num",
        width: 16,
        get: (row) => numOf(isFiltered ? balanceByMaterialId.get(row.id) ?? 0 : row.currentBalance),
      },
      { header: "Reorder Level", type: "num", width: 14, get: (row) => numOf(row.reorderLevel) },
      {
        header: "Status",
        type: "text",
        width: 14,
        // Status is derived from whichever balance is actually displayed in the
        // "Current Balance" column just above - unfiltered, that's the global
        // balance; filtered, it's the same derived balance, so Status never claims
        // a material is low/out of stock (or not) based on a number the reader
        // can't see (§1 fix - previously always used the global balance even when
        // the displayed balance was a filtered slice).
        get: (row) =>
          textOf(
            STATUS_LABELS[
              computeStockStatus(
                isFiltered ? balanceByMaterialId.get(row.id) ?? 0 : Number(row.currentBalance),
                Number(row.reorderLevel),
              )
            ],
          ),
      },
    ];

    const workbook = newWorkbook();
    const sheet = workbook.addWorksheet("Stock Sheet", { pageSetup: { orientation: "landscape" } });
    writeFlatRegisterSheet(sheet, columns, materialRows, { frozenCols: 1 });

    const projectName = await resolveProjectName(query.projectId);
    const filename = buildExportFilename(["Stock-Sheet", projectName]);
    return { workbook, filename };
  },

  // -------------------------------------------------------------------------
  // 2. Purchase Register
  // -------------------------------------------------------------------------
  async purchaseRegister(query: InventoryPurchaseExportQuery) {
    const rows = await materialsService.listEffectiveTransactions({
      type: "purchase",
      projectId: query.projectId,
      from: query.from,
      to: query.to,
    });
    const { materialById, projectById } = await loadLookups(rows);

    type Row = (typeof rows)[number];
    const columns: FlatColumn<Row>[] = [
      { header: "S.No.", type: "num", width: 8, get: (_row, rowNumber) => rowNumber },
      { header: "Date", type: "date", width: 13, get: (row) => dateOf(row.transactionDate) },
      { header: "Material", type: "text", width: 26, get: (row) => textOf(materialById.get(row.materialId)?.name) },
      { header: "Category", type: "text", width: 18, get: (row) => textOf(materialById.get(row.materialId)?.category) },
      { header: "Unit", type: "text", width: 10, get: (row) => textOf(materialById.get(row.materialId)?.unit) },
      { header: "Vendor", type: "text", width: 22, get: (row) => textOf(row.vendorName) },
      { header: "Invoice / Reference No.", type: "text", width: 20, get: (row) => textOf(row.referenceNo) },
      { header: "Quantity", type: "num", width: 12, get: (row) => numOf(row.quantity) },
      { header: "Rate", type: "money", width: 12, get: (row) => numOf(row.rate) },
      { header: "Bill Amount", type: "money", width: 14, get: (row) => numOf(row.billAmount) },
      { header: "Project", type: "text", width: 22, get: (row) => textOf(projectById.get(row.projectId ?? "")?.name) },
      { header: "Remarks", type: "text", width: 30, get: (row) => textOf(row.remarks) },
    ];

    const workbook = newWorkbook();
    const sheet = workbook.addWorksheet("Purchase Register", { pageSetup: { orientation: "landscape" } });
    writeFlatRegisterSheet(sheet, columns, rows, { frozenCols: 2 });

    const projectName = await resolveProjectName(query.projectId);
    const monthLabel = monthLabelFromRange(query.from, query.to);
    const filename = buildExportFilename(["Purchase-Register", monthLabel, projectName]);
    return { workbook, filename };
  },

  // -------------------------------------------------------------------------
  // 3. PBG Issue
  // -------------------------------------------------------------------------
  async pbgIssue(query: InventoryPbgIssueExportQuery) {
    const rows = await materialsService.listEffectiveTransactions({
      type: "pbg_issue",
      projectId: query.projectId,
      from: query.from,
      to: query.to,
    });
    const { materialById, projectById } = await loadLookups(rows);

    type Row = (typeof rows)[number];
    const columns: FlatColumn<Row>[] = [
      { header: "S.No.", type: "num", width: 8, get: (_row, rowNumber) => rowNumber },
      { header: "Date", type: "date", width: 13, get: (row) => dateOf(row.transactionDate) },
      { header: "Material", type: "text", width: 26, get: (row) => textOf(materialById.get(row.materialId)?.name) },
      { header: "Unit", type: "text", width: 10, get: (row) => textOf(materialById.get(row.materialId)?.unit) },
      { header: "SIV / Reference No.", type: "text", width: 18, get: (row) => textOf(row.referenceNo) },
      { header: "Quantity", type: "num", width: 12, get: (row) => numOf(row.quantity) },
      { header: "Project", type: "text", width: 22, get: (row) => textOf(projectById.get(row.projectId ?? "")?.name) },
      { header: "Supervisor", type: "text", width: 18, get: (row) => textOf(row.supervisorName) },
      { header: "Vehicle No.", type: "text", width: 14, get: (row) => textOf(row.vehicleNo) },
      { header: "Vehicle Qty", type: "num", width: 12, get: (row) => numOf(row.vehicleQty) },
      { header: "Vendor", type: "text", width: 20, get: (row) => textOf(row.vendorName) },
      { header: "Remarks", type: "text", width: 30, get: (row) => textOf(row.remarks) },
    ];

    const workbook = newWorkbook();
    const sheet = workbook.addWorksheet("PBG Issue", { pageSetup: { orientation: "landscape" } });
    writeFlatRegisterSheet(sheet, columns, rows, { frozenCols: 2 });

    const projectName = await resolveProjectName(query.projectId);
    const monthLabel = monthLabelFromRange(query.from, query.to);
    const filename = buildExportFilename(["PBG-Issue", monthLabel, projectName]);
    return { workbook, filename };
  },

  // -------------------------------------------------------------------------
  // 4. Store Issue Book
  // -------------------------------------------------------------------------
  async storeIssueBook(query: InventoryStoreIssueExportQuery) {
    const rows = await materialsService.listEffectiveTransactions({
      type: "issue",
      projectId: query.projectId,
      source: query.source,
      plumberId: query.plumberId,
      from: query.from,
      to: query.to,
    });
    const { materialById, projectById, plumberById } = await loadLookups(rows);

    type Row = (typeof rows)[number];
    const columns: FlatColumn<Row>[] = [
      { header: "S.No.", type: "num", width: 8, get: (_row, rowNumber) => rowNumber },
      { header: "Date", type: "date", width: 13, get: (row) => dateOf(row.transactionDate) },
      { header: "Slip / Reference No.", type: "text", width: 18, get: (row) => textOf(row.referenceNo) },
      { header: "Material", type: "text", width: 26, get: (row) => textOf(materialById.get(row.materialId)?.name) },
      { header: "Unit", type: "text", width: 10, get: (row) => textOf(materialById.get(row.materialId)?.unit) },
      { header: "Quantity", type: "num", width: 12, get: (row) => numOf(row.quantity) },
      { header: "Source", type: "text", width: 12, get: (row) => textOf(sourceLabel(row.source)) },
      { header: "Project", type: "text", width: 22, get: (row) => textOf(projectById.get(row.projectId ?? "")?.name) },
      { header: "Plumber", type: "text", width: 20, get: (row) => textOf(plumberById.get(row.plumberId ?? "")?.name) },
      { header: "Supervisor", type: "text", width: 18, get: (row) => textOf(row.supervisorName) },
      { header: "Address / Site", type: "text", width: 26, get: (row) => textOf(row.address) },
    ];

    const workbook = newWorkbook();
    const sheet = workbook.addWorksheet("Store Issue Book", { pageSetup: { orientation: "landscape" } });
    writeFlatRegisterSheet(sheet, columns, rows, { frozenCols: 2 });

    const projectName = await resolveProjectName(query.projectId);
    const monthLabel = monthLabelFromRange(query.from, query.to);
    const filename = buildExportFilename(["Store-Issue-Book", monthLabel, projectName]);
    return { workbook, filename };
  },

  // -------------------------------------------------------------------------
  // 5. Consumption Log / Plumber Consumption
  // -------------------------------------------------------------------------
  async consumptionLog(query: InventoryConsumptionExportQuery) {
    const db = getDb();
    // Both consumption types are real, posted, ledger consumption events (§8) - never
    // derived from Customer GI/MDPE/etc. JSON fields, which are separate and unrelated
    // to the material ledger.
    const [consumptionRows, pbgConsumptionRows] = await Promise.all([
      materialsService.listEffectiveTransactions({
        type: "consumption",
        projectId: query.projectId,
        source: query.source,
        plumberId: query.plumberId,
        from: query.from,
        to: query.to,
      }),
      materialsService.listEffectiveTransactions({
        type: "pbg_consumption",
        projectId: query.projectId,
        source: query.source,
        plumberId: query.plumberId,
        from: query.from,
        to: query.to,
      }),
    ]);
    const rows = [...consumptionRows, ...pbgConsumptionRows].sort((a, b) => a.transactionDate.getTime() - b.transactionDate.getTime());

    const { materialById, projectById, plumberById } = await loadLookups(rows);
    const customerIds = Array.from(new Set(rows.map((row) => row.customerId).filter((id): id is string => Boolean(id))));
    const customerById = new Map(
      customerIds.length
        ? (
            await db
              .select({ id: customers.id, trBpNumber: customers.trBpNumber, customerName: customers.customerName, fullAddress: customers.fullAddress })
              .from(customers)
              .where(inArray(customers.id, customerIds))
          ).map((c) => [c.id, c])
        : [],
    );

    type Row = (typeof rows)[number];
    const columns: FlatColumn<Row>[] = [
      { header: "S.No.", type: "num", width: 8, get: (_row, rowNumber) => rowNumber },
      { header: "Date", type: "date", width: 13, get: (row) => dateOf(row.transactionDate) },
      { header: "TR / BP No.", type: "text", width: 14, get: (row) => textOf(customerById.get(row.customerId ?? "")?.trBpNumber) },
      { header: "Customer Name", type: "text", width: 24, get: (row) => textOf(customerById.get(row.customerId ?? "")?.customerName) },
      { header: "Full Address / Site", type: "text", width: 30, get: (row) => textOf(customerById.get(row.customerId ?? "")?.fullAddress ?? row.address) },
      { header: "Project", type: "text", width: 22, get: (row) => textOf(projectById.get(row.projectId ?? "")?.name) },
      { header: "Supervisor", type: "text", width: 18, get: (row) => textOf(row.supervisorName) },
      { header: "Plumber", type: "text", width: 18, get: (row) => textOf(plumberById.get(row.plumberId ?? "")?.name) },
      { header: "Material", type: "text", width: 26, get: (row) => textOf(materialById.get(row.materialId)?.name) },
      { header: "Unit", type: "text", width: 10, get: (row) => textOf(materialById.get(row.materialId)?.unit) },
      { header: "Quantity", type: "num", width: 12, get: (row) => numOf(row.quantity) },
      { header: "Source", type: "text", width: 12, get: (row) => textOf(sourceLabel(row.source)) },
      { header: "Report No.", type: "text", width: 16, get: (row) => textOf(row.reportNo) },
      { header: "Reference No.", type: "text", width: 16, get: (row) => textOf(row.referenceNo) },
    ];

    const workbook = newWorkbook();
    const sheet = workbook.addWorksheet("Consumption Log", { pageSetup: { orientation: "landscape" } });
    writeFlatRegisterSheet(sheet, columns, rows, { frozenCols: 2 });

    const projectName = await resolveProjectName(query.projectId);
    const monthLabel = monthLabelFromRange(query.from, query.to);
    const filename = buildExportFilename(["Plumber-Consumption", monthLabel, projectName]);
    return { workbook, filename };
  },

  // -------------------------------------------------------------------------
  // 6. PBG Consumption
  // -------------------------------------------------------------------------
  async pbgConsumption(query: InventoryPbgConsumptionExportQuery) {
    const db = getDb();
    const rows = await materialsService.listEffectiveTransactions({
      type: "pbg_consumption",
      projectId: query.projectId,
      plumberId: query.plumberId,
      materialId: query.materialId,
      from: query.from,
      to: query.to,
    });
    const { materialById, projectById, plumberById } = await loadLookups(rows);
    const customerIds = Array.from(new Set(rows.map((row) => row.customerId).filter((id): id is string => Boolean(id))));
    const customerById = new Map(
      customerIds.length
        ? (
            await db
              .select({ id: customers.id, trBpNumber: customers.trBpNumber, customerName: customers.customerName })
              .from(customers)
              .where(inArray(customers.id, customerIds))
          ).map((c) => [c.id, c])
        : [],
    );

    type Row = (typeof rows)[number];
    const columns: FlatColumn<Row>[] = [
      { header: "S.No.", type: "num", width: 8, get: (_row, rowNumber) => rowNumber },
      { header: "Date", type: "date", width: 13, get: (row) => dateOf(row.transactionDate) },
      { header: "RA Bill / Reference No.", type: "text", width: 18, get: (row) => textOf(row.referenceNo) },
      { header: "Project", type: "text", width: 22, get: (row) => textOf(projectById.get(row.projectId ?? "")?.name) },
      // Historical rows recorded before Customer/Plumber capture existed on this
      // form stay genuinely blank here rather than fabricated (§2) - textOf(undefined)
      // is null, not a guessed value.
      { header: "TR / BP No.", type: "text", width: 14, get: (row) => textOf(customerById.get(row.customerId ?? "")?.trBpNumber) },
      { header: "Customer Name", type: "text", width: 24, get: (row) => textOf(customerById.get(row.customerId ?? "")?.customerName) },
      { header: "Plumber", type: "text", width: 18, get: (row) => textOf(plumberById.get(row.plumberId ?? "")?.name) },
      { header: "Supervisor", type: "text", width: 18, get: (row) => textOf(row.supervisorName) },
      { header: "Material", type: "text", width: 26, get: (row) => textOf(materialById.get(row.materialId)?.name) },
      { header: "Unit", type: "text", width: 10, get: (row) => textOf(materialById.get(row.materialId)?.unit) },
      { header: "Quantity", type: "num", width: 12, get: (row) => numOf(row.quantity) },
      // Always "PBG" by definition of the type - shown for legibility/consistency
      // with the other registers rather than because it varies here.
      { header: "Source", type: "text", width: 12, get: (row) => textOf(sourceLabel(row.source)) },
      { header: "Remarks", type: "text", width: 30, get: (row) => textOf(row.remarks) },
    ];

    const workbook = newWorkbook();
    const sheet = workbook.addWorksheet("PBG Consumption", { pageSetup: { orientation: "landscape" } });
    writeFlatRegisterSheet(sheet, columns, rows, { frozenCols: 2 });

    const projectName = await resolveProjectName(query.projectId);
    const monthLabel = monthLabelFromRange(query.from, query.to);
    const filename = buildExportFilename(["PBG-Consumption", monthLabel, projectName]);
    return { workbook, filename };
  },

  // -------------------------------------------------------------------------
  // 7. Total Issue (aggregate: one row per material)
  // -------------------------------------------------------------------------
  async totalIssue(query: InventoryTotalIssueExportQuery) {
    const rows = await materialsService.listEffectiveTransactions({
      type: "issue",
      projectId: query.projectId,
      source: query.source,
      from: query.from,
      to: query.to,
    });
    const { materialById } = await loadLookups(rows);

    type Agg = { materialId: string; totalIssued: number; transactionCount: number; lastIssueDate: Date };
    const grouped = new Map<string, Agg>();
    for (const row of rows) {
      const quantity = Number(row.quantity);
      const existing = grouped.get(row.materialId);
      if (existing) {
        existing.totalIssued += quantity;
        existing.transactionCount += 1;
        if (row.transactionDate > existing.lastIssueDate) existing.lastIssueDate = row.transactionDate;
      } else {
        grouped.set(row.materialId, {
          materialId: row.materialId,
          totalIssued: quantity,
          transactionCount: 1,
          lastIssueDate: row.transactionDate,
        });
      }
    }
    const aggregatedRows = Array.from(grouped.values()).sort((a, b) => b.totalIssued - a.totalIssued);

    type Row = (typeof aggregatedRows)[number];
    const columns: FlatColumn<Row>[] = [
      { header: "S.No.", type: "num", width: 8, get: (_row, rowNumber) => rowNumber },
      { header: "Material", type: "text", width: 28, get: (row) => textOf(materialById.get(row.materialId)?.name) },
      { header: "Category", type: "text", width: 18, get: (row) => textOf(materialById.get(row.materialId)?.category) },
      { header: "Unit", type: "text", width: 10, get: (row) => textOf(materialById.get(row.materialId)?.unit) },
      { header: "Total Issued Quantity", type: "num", width: 16, get: (row) => numOf(row.totalIssued) },
      { header: "Transaction Count", type: "num", width: 14, get: (row) => numOf(row.transactionCount) },
      { header: "Last Issue Date", type: "date", width: 14, get: (row) => dateOf(row.lastIssueDate) },
    ];

    const workbook = newWorkbook();
    const sheet = workbook.addWorksheet("Total Issue", { pageSetup: { orientation: "landscape" } });
    writeFlatRegisterSheet(sheet, columns, aggregatedRows, { frozenCols: 1 });

    const projectName = await resolveProjectName(query.projectId);
    // Date/month filtering IS meaningful here (§3) - "Total Issue" means quantity
    // issued during the selected period, unlike a point-in-time balance.
    const monthLabel = monthLabelFromRange(query.from, query.to);
    const filename = buildExportFilename(["Total-Issue", monthLabel, projectName]);
    return { workbook, filename };
  },

  // -------------------------------------------------------------------------
  // 8. Plumber Balance
  // -------------------------------------------------------------------------
  async plumberBalance(query: InventoryPlumberBalanceExportQuery) {
    // No from/to here, deliberately (§5): `issued - consumed - returned + adjusted`
    // is a running balance, not a period total - restricting the underlying
    // transactions to a date range would compute "movement within that range" and
    // mislabel it as the current balance (the exact bug already fixed on Stock
    // Sheet). PlumberBalanceQuery structurally has no from/to field, so this can't
    // silently regress even if a caller tried to pass one.
    const rows = await materialsService.plumberBalances({
      projectId: query.projectId,
      source: query.source,
      plumberId: query.plumberId,
      materialId: query.materialId,
    });
    const { materialById, projectById, plumberById } = await loadLookups(
      rows.map((row) => ({ materialId: row.materialId, projectId: row.projectId, plumberId: row.plumberId })),
    );

    type Row = (typeof rows)[number];
    const columns: FlatColumn<Row>[] = [
      { header: "S.No.", type: "num", width: 8, get: (_row, rowNumber) => rowNumber },
      { header: "Plumber", type: "text", width: 20, get: (row) => textOf(plumberById.get(row.plumberId)?.name) },
      { header: "Project", type: "text", width: 22, get: (row) => textOf(projectById.get(row.projectId ?? "")?.name) },
      { header: "Material", type: "text", width: 26, get: (row) => textOf(materialById.get(row.materialId)?.name) },
      { header: "Category", type: "text", width: 18, get: (row) => textOf(materialById.get(row.materialId)?.category) },
      { header: "Unit", type: "text", width: 10, get: (row) => textOf(materialById.get(row.materialId)?.unit) },
      { header: "Source", type: "text", width: 12, get: (row) => textOf(sourceLabel(row.source)) },
      { header: "Total Issued", type: "num", width: 14, get: (row) => numOf(row.issued) },
      { header: "Consumed", type: "num", width: 12, get: (row) => numOf(row.consumed) },
      { header: "Returned", type: "num", width: 12, get: (row) => numOf(row.returned) },
      { header: "Adjusted", type: "num", width: 12, get: (row) => numOf(row.adjusted) },
      { header: "Current Balance", type: "num", width: 16, get: (row) => numOf(row.balance) },
    ];

    const workbook = newWorkbook();
    const sheet = workbook.addWorksheet("Plumber Balance", { pageSetup: { orientation: "landscape" } });
    writeFlatRegisterSheet(sheet, columns, rows, { frozenCols: 1 });

    const projectName = await resolveProjectName(query.projectId);
    const filename = buildExportFilename(["Plumber-Balance", projectName]);
    return { workbook, filename };
  },
};

// ---------------------------------------------------------------------------
// Shared name-resolution lookups (material / project / plumber), built once per
// export from whichever rows actually came back - small ID -> row Maps, the same
// pattern customerExportService uses for user names.
// ---------------------------------------------------------------------------

async function loadLookups(rows: { materialId: string; projectId: string | null; plumberId?: string | null }[]) {
  const db = getDb();
  const [materialRows, projectRows, plumberRows] = await Promise.all([
    db.select({ id: materials.id, name: materials.name, category: materials.category, unit: materials.unit }).from(materials),
    db.select({ id: projects.id, name: projects.name }).from(projects),
    db.select({ id: plumbers.id, name: plumbers.name }).from(plumbers),
  ]);

  return {
    materialById: new Map(materialRows.map((row) => [row.id, row])),
    projectById: new Map(projectRows.map((row) => [row.id, row])),
    plumberById: new Map(plumberRows.map((row) => [row.id, row])),
  };
}

