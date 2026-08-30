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

const SUNDAY_MERGE_RANGES = ["F7:F12", "M7:M12", "T7:T12", "AA7:AA12"];

const HOLIDAY_ALIGNMENT = { horizontal: "center", vertical: "middle", textRotation: 90 } as const;
const NORMAL_DAY_ALIGNMENT = { horizontal: "center", vertical: "middle" } as const;

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

    const sundayShouldMerge = new Array<boolean>(maxDayColumns).fill(false);
    for (let dayIndex = 0; dayIndex < maxDayColumns; dayIndex += 1) {
      const day = period.days[dayIndex];
      if (!day || !day.isSunday) continue;
      const hasOverride = roster.some((person) => attendanceLookup.get(person.userId)?.has(day.dateKey));
      sundayShouldMerge[dayIndex] = !hasOverride;
    }

    for (let dayIndex = 0; dayIndex < maxDayColumns; dayIndex += 1) {
      const col = firstDay + dayIndex;
      const headerRow5 = sheet.getRow(layout.headerLastRow - 1).getCell(col);
      const headerRow6 = sheet.getRow(layout.headerLastRow).getCell(col);

      if (col === lastPossibleDayCol) {
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
