import { and, eq, gte, inArray, lte } from "drizzle-orm";
import type ExcelJS from "exceljs";
import { getDb } from "@db";
import { attendance, projects, staff, users } from "@db/schema";
import type { AttendanceStatus } from "@modules/attendance/attendance.types";
import { attendanceTemplateLayout as layout } from "./attendance-template-layout";
import { wageTemplateLayout } from "./wage-template-layout";
import { attendanceDayValue, attendanceDisplayCode } from "./attendance-status-map";
import type { AttendanceExportQuery } from "./exports.types";
import {
  buildExportFilename,
  columnLetter,
  copyCellStyle,
  loadTemplateWorkbook,
  parseMonthYear,
  removeOtherSheet,
  resolveMonthPeriod,
  setDataRowCount,
  stripImages,
  unmergeRanges,
} from "./workbook-helpers";

/** Vertically-merged "weekly off" columns in the template - always unmerged first since
 * the template's own merge is fixed to May 2026's calendar; the correct merge (if any) for
 * the requested month is recomputed from scratch further down. */
const SUNDAY_MERGE_RANGES = ["F7:F12", "M7:M12", "T7:T12", "AA7:AA12"];

// The template's own HOLIDAY cells use a 90deg text rotation so the word fits the narrow
// day column instead of clipping; plain P/A/HD/L cells are not rotated. Since a real
// month's Sunday can land in any day column, this rotation must be applied wherever
// HOLIDAY actually ends up, and explicitly cleared for any other value.
const HOLIDAY_ALIGNMENT = { horizontal: "center", vertical: "middle", textRotation: 90 } as const;
const NORMAL_DAY_ALIGNMENT = { horizontal: "center", vertical: "middle" } as const;

// The template's own Sunday-column fill (light theme blue), read directly off its F7 cell.
// Applied to whichever column is the REAL Sunday for the requested month/year, and
// explicitly cleared everywhere else - the template bakes this fill onto fixed columns
// (F/M/T/AA) that only happen to be Sunday for its May-2026 sample.
// `bgColor.indexed` matches the reference template's raw XML exactly, but exceljs's own
// `Color` type only declares argb/theme - a typings gap, not a runtime one - hence the cast.
const SUNDAY_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { theme: 4, tint: 0.7999816888943144 },
  bgColor: { indexed: 64 },
} as unknown as ExcelJS.Fill;
const NO_FILL = { type: "pattern", pattern: "none" } as ExcelJS.Fill;

async function loadRoster(projectId?: string) {
  const db = getDb();
  const conditions = [eq(users.role, "supervisor")];
  if (projectId) conditions.push(eq(staff.assignedProjectId, projectId));

  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      // `projects.city` is the closest authoritative geographic field to the template's
      // "Place of work" (project.name is a contract/document code, not a location).
      placeOfWork: projects.city,
    })
    .from(users)
    .leftJoin(staff, eq(staff.userId, users.id))
    .leftJoin(projects, eq(staff.assignedProjectId, projects.id))
    .where(and(...conditions))
    .orderBy(users.name);

  return rows;
}

async function loadProjectHeader(projectId?: string) {
  if (!projectId) return { contractor: "", client: "" };
  const db = getDb();
  const [project] = await db
    .select({ contractor: projects.contractor, client: projects.client })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  return { contractor: project?.contractor ?? "", client: project?.client ?? "" };
}

async function loadAttendanceLookup(userIds: string[], from: string, to: string) {
  const lookup = new Map<string, Map<string, AttendanceStatus>>();
  if (!userIds.length) return lookup;

  const db = getDb();
  const rows = await db
    .select({ userId: attendance.userId, date: attendance.date, status: attendance.status })
    .from(attendance)
    .where(and(inArray(attendance.userId, userIds), gte(attendance.date, from), lte(attendance.date, to)));

  for (const row of rows) {
    const byDate = lookup.get(row.userId) ?? new Map<string, AttendanceStatus>();
    byDate.set(row.date, row.status);
    lookup.set(row.userId, byDate);
  }

  return lookup;
}

export const attendanceExportService = {
  async build(query: AttendanceExportQuery) {
    const { month, year } = parseMonthYear(query.month, query.year);
    const period = resolveMonthPeriod(month, year);
    const from = period.days[0]!.dateKey;
    const to = period.days[period.days.length - 1]!.dateKey;

    const [roster, header] = await Promise.all([
      loadRoster(query.projectId),
      loadProjectHeader(query.projectId),
    ]);
    const attendanceLookup = await loadAttendanceLookup(
      roster.map((person) => person.userId),
      from,
      to,
    );

    const workbook = await loadTemplateWorkbook();
    removeOtherSheet(workbook, wageTemplateLayout.sheetName);
    const sheet = workbook.getWorksheet(layout.sheetName);
    if (!sheet) throw new Error("Attendance template sheet is missing");
    stripImages(sheet);

    sheet.getCell(layout.contractorCell).value = header.contractor;
    sheet.getCell(layout.clientCell).value = header.client;
    sheet.getCell(layout.periodCell).value = period.periodLabel;
    sheet.getCell(layout.monthValueCell).value = period.monthName;
    sheet.getCell(layout.yearValueCell).value = period.year;

    unmergeRanges(sheet, SUNDAY_MERGE_RANGES);
    setDataRowCount(sheet, layout.firstDataRow, layout.templateSampleRowCount, roster.length);

    const { firstDay, maxDayColumns, summary, slNo, name, placeOfWork } = layout.columns;
    const lastPossibleDayCol = firstDay + maxDayColumns - 1;
    const anchorDayCol = lastPossibleDayCol - 1;
    const lastDataRow = layout.firstDataRow + roster.length - 1;

    // A Sunday column reproduces the reference's single merged "HOLIDAY" region only when
    // NOBODY in the roster has a real attendance record for that date - the moment any one
    // employee has an override, the column can no longer show one shared value, so it stays
    // unmerged and every employee shows their own real status (or their own HOLIDAY default).
    const sundayShouldMerge = new Array<boolean>(maxDayColumns).fill(false);
    for (let dayIndex = 0; dayIndex < maxDayColumns; dayIndex += 1) {
      const day = period.days[dayIndex];
      if (!day || !day.isSunday) continue;
      const hasOverride = roster.some((person) => attendanceLookup.get(person.userId)?.has(day.dateKey));
      sundayShouldMerge[dayIndex] = !hasOverride;
    }

    // Always walk the full fixed 31-column band (not just daysInMonth): the template's
    // day-6 row carries a shared formula (master F6, slaves through AG6) left over from
    // its 30-day May sample. Any short month (e.g. February) that stops early leaves
    // trailing slave cells pointing at a master we've already overwritten, which crashes
    // at write time - so out-of-range columns must be explicitly cleared, not skipped.
    for (let dayIndex = 0; dayIndex < maxDayColumns; dayIndex += 1) {
      const col = firstDay + dayIndex;
      const headerRow5 = sheet.getRow(layout.headerLastRow - 1).getCell(col);
      const headerRow6 = sheet.getRow(layout.headerLastRow).getCell(col);

      if (col === lastPossibleDayCol) {
        // 31st-day column: blank in the template for shorter months, so borrow the prior day's style.
        copyCellStyle(sheet.getRow(layout.headerLastRow - 1).getCell(anchorDayCol), headerRow5);
        copyCellStyle(sheet.getRow(layout.headerLastRow).getCell(anchorDayCol), headerRow6);
      }

      const day = period.days[dayIndex];
      if (day) {
        headerRow5.value = day.weekdayName;
        headerRow6.value = day.date;
        headerRow6.style = { ...headerRow6.style, fill: day.isSunday ? SUNDAY_FILL : NO_FILL };
      } else {
        headerRow5.value = null;
        headerRow6.value = null;
        headerRow6.style = { ...headerRow6.style, fill: NO_FILL };
      }
    }

    // Merge the "everyone's off" Sundays across the whole employee block first, before any
    // per-employee writes, and set the shared HOLIDAY value/style once on the master cell.
    if (roster.length > 0) {
      for (let dayIndex = 0; dayIndex < maxDayColumns; dayIndex += 1) {
        if (!sundayShouldMerge[dayIndex]) continue;
        const col = firstDay + dayIndex;
        const letter = columnLetter(col);
        sheet.mergeCells(`${letter}${layout.firstDataRow}:${letter}${lastDataRow}`);
        const master = sheet.getCell(`${letter}${layout.firstDataRow}`);
        master.value = "HOLIDAY";
        master.style = { ...master.style, alignment: HOLIDAY_ALIGNMENT, fill: SUNDAY_FILL };
      }
    }

    roster.forEach((person, index) => {
      const rowNumber = layout.firstDataRow + index;
      const row = sheet.getRow(rowNumber);
      const byDate = attendanceLookup.get(person.userId);
      let totalDays = 0;

      row.getCell(slNo).value = index + 1;
      row.getCell(name).value = person.name;
      row.getCell(placeOfWork).value = person.placeOfWork ?? "";

      for (let dayIndex = 0; dayIndex < maxDayColumns; dayIndex += 1) {
        const col = firstDay + dayIndex;
        const cell = row.getCell(col);

        if (col === lastPossibleDayCol) {
          copyCellStyle(row.getCell(anchorDayCol), cell);
        }

        const day = period.days[dayIndex];
        if (!day) {
          cell.value = null;
          continue;
        }

        // Merged Sunday columns already have their single HOLIDAY value set on the master
        // cell above - every cell in the merge range (including this one) shares that
        // value/style, so writing here again would just re-set the same master cell.
        if (sundayShouldMerge[dayIndex]) continue;

        const status = byDate?.get(day.dateKey);
        if (status) {
          cell.value = attendanceDisplayCode(status);
          cell.style = { ...cell.style, alignment: NORMAL_DAY_ALIGNMENT, fill: day.isSunday ? SUNDAY_FILL : NO_FILL };
          totalDays += attendanceDayValue(status);
        } else if (day.isSunday) {
          cell.value = "HOLIDAY";
          cell.style = { ...cell.style, alignment: HOLIDAY_ALIGNMENT, fill: SUNDAY_FILL };
        } else {
          cell.value = "";
          cell.style = { ...cell.style, alignment: NORMAL_DAY_ALIGNMENT, fill: NO_FILL };
        }
      }

      row.getCell(summary).value = totalDays;
    });

    const lastRow = layout.headerLastRow + roster.length;
    sheet.pageSetup.printArea = `A1:AJ${Math.max(lastRow, layout.headerLastRow)}`;

    const filename = buildExportFilename([
      "Attendance",
      header.client || undefined,
      period.monthShortYear,
    ]);

    return { workbook, filename };
  },
};
