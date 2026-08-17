import path from "node:path";
import ExcelJS from "exceljs";

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "src/modules/exports/templates/attendance-wages-template.xlsx",
);

export async function loadTemplateWorkbook() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(TEMPLATE_PATH);
  return workbook;
}

const WEEKDAY_NAMES = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const MONTH_NAMES = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

/** 1-indexed column number -> Excel column letters (1 -> "A", 27 -> "AA"). */
export function columnLetter(colNumber: number): string {
  let n = colNumber;
  let letters = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

export type MonthDay = {
  /** UTC-midnight instant for this calendar day - exceljs serializes Date cells via getTime(),
   * so this must be built with Date.UTC (never the local-timezone constructor), or the written
   * cell silently shifts a day whenever the server's local timezone isn't UTC. */
  date: Date;
  dayOfMonth: number;
  weekdayName: string;
  /** yyyy-MM-dd, matching the `attendance.date` column's stored format. */
  dateKey: string;
  isSunday: boolean;
};

export type MonthPeriod = {
  month: number;
  year: number;
  daysInMonth: number;
  monthName: string;
  monthShortYear: string;
  periodLabel: string;
  days: MonthDay[];
};

export function resolveMonthPeriod(month: number, year: number): MonthPeriod {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthName = MONTH_NAMES[month - 1]!;
  const yy = String(year).slice(-2);

  const days: MonthDay[] = Array.from({ length: daysInMonth }, (_, index) => {
    const dayOfMonth = index + 1;
    const date = new Date(Date.UTC(year, month - 1, dayOfMonth));
    const weekday = date.getUTCDay();
    return {
      date,
      dayOfMonth,
      weekdayName: WEEKDAY_NAMES[weekday]!,
      dateKey: `${year}-${pad2(month)}-${pad2(dayOfMonth)}`,
      isSunday: weekday === 0,
    };
  });

  const fromLabel = `01-${pad2(month)}-${year}`;
  const toLabel = `${pad2(daysInMonth)}-${pad2(month)}-${year}`;

  return {
    month,
    year,
    daysInMonth,
    monthName,
    monthShortYear: `${monthName}-${yy}`,
    periodLabel: `For the Period   ${monthName}-${yy}              From  ${fromLabel} to ${toLabel}`,
    days,
  };
}

/**
 * Copies visual style only (not value/merge state) from one cell to another.
 * Assigns a whole new `.style` object rather than individual property setters
 * (`target.border = ...` etc): those setters mutate `target.style` in place,
 * and duplicateRow-cloned rows share one style object by reference per
 * column, so an in-place mutation would bleed into every sibling row.
 */
export function copyCellStyle(source: ExcelJS.Cell, target: ExcelJS.Cell) {
  target.style = { ...source.style };
}

export function sanitizeFilenameSegment(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildExportFilename(parts: Array<string | undefined>) {
  return `${parts.filter(Boolean).map((part) => sanitizeFilenameSegment(part as string)).join("-")}.xlsx`;
}

export function parseMonthYear(monthRaw: string, yearRaw: string) {
  const month = Number(monthRaw);
  const year = Number(yearRaw);

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("month must be an integer between 1 and 12");
  }
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("year must be a valid 4-digit year");
  }

  return { month, year };
}

/** Drops the other register's sheet - the template ships both, but a given export must only contain its own. */
export function removeOtherSheet(workbook: ExcelJS.Workbook, otherSheetName: string) {
  workbook.removeWorksheet(otherSheetName);
}

/**
 * Removes every embedded image (e.g. the reference template's sample signature drawing)
 * from a sheet. exceljs has no public "remove image" API - `getImages()` is the only
 * documented accessor and it's read-only - so this reaches into the internal `_media`
 * list that backs it. Generated reports must never carry the reference's sample signature
 * forward, and there is no per-employee real signature data to draw instead.
 */
export function stripImages(sheet: ExcelJS.Worksheet) {
  (sheet as unknown as { _media: unknown[] })._media = [];
}

export function unmergeRanges(sheet: ExcelJS.Worksheet, ranges: string[]) {
  for (const range of ranges) {
    try {
      sheet.unMergeCells(range);
    } catch {
      // Not currently merged - nothing to do.
    }
  }
}

/**
 * Grows or shrinks the sheet's data-row block to exactly `targetCount` rows,
 * cloning the last template sample row's style for any newly needed rows.
 * Caller is responsible for unmerging any cross-row merges in the data
 * block first (duplicateRow does not handle those safely).
 */
export function setDataRowCount(
  sheet: ExcelJS.Worksheet,
  firstDataRow: number,
  templateSampleRowCount: number,
  targetCount: number,
) {
  const lastSampleRow = firstDataRow + templateSampleRowCount - 1;

  if (targetCount < templateSampleRowCount) {
    // exceljs's spliceRows only special-cases removing exactly one trailing
    // row; removing a multi-row suffix (our only real usage, since these
    // are always the sheet's last rows) silently leaves them untouched. So
    // unwanted trailing sample rows are blanked in place instead - the
    // caller shrinks the print area so they're excluded from print output.
    for (let rowNumber = firstDataRow + targetCount; rowNumber <= lastSampleRow; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      for (let col = 1; col <= sheet.columnCount; col += 1) {
        row.getCell(col).value = null;
      }
    }
  } else if (targetCount > templateSampleRowCount) {
    const extra = targetCount - templateSampleRowCount;
    // The last sample row (lastSampleRow) carries the table's "closing" (thicker) bottom
    // border, distinct from the thin interior grid lines on every row above it.
    // duplicateRow clones that closing style into every new row. Once we grow past the
    // template's row count, lastSampleRow is no longer the true last row either - so
    // every row from lastSampleRow up to (but excluding) the new true last row needs its
    // bottom border reset to the interior convention, borrowed from the row above it.
    const interiorRow = sheet.getRow(lastSampleRow - 1);
    sheet.duplicateRow(lastSampleRow, extra, true);

    for (let rowNumber = lastSampleRow; rowNumber < lastSampleRow + extra; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      for (let col = 1; col <= sheet.columnCount; col += 1) {
        const cell = row.getCell(col);
        // duplicateRow copies `cell.style` by reference (not a deep clone), so every
        // duplicated row shares one style object per column - mutating `.border`
        // directly (its setter mutates `.style` in place) would silently corrupt
        // that shared object and bleed into sibling rows, including the original
        // source row. Assigning a whole new `.style` object detaches this cell first.
        cell.style = { ...cell.style, border: { ...cell.border, bottom: interiorRow.getCell(col).border?.bottom } };
      }
    }
  }
}
