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
  date: Date;
  dayOfMonth: number;
  weekdayName: string;
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

export function removeOtherSheet(workbook: ExcelJS.Workbook, otherSheetName: string) {
  workbook.removeWorksheet(otherSheetName);
}

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

export function setDataRowCount(
  sheet: ExcelJS.Worksheet,
  firstDataRow: number,
  templateSampleRowCount: number,
  targetCount: number,
) {
  const lastSampleRow = firstDataRow + templateSampleRowCount - 1;

  if (targetCount < templateSampleRowCount) {
    for (let rowNumber = firstDataRow + targetCount; rowNumber <= lastSampleRow; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      for (let col = 1; col <= sheet.columnCount; col += 1) {
        row.getCell(col).value = null;
      }
    }
  } else if (targetCount > templateSampleRowCount) {
    const extra = targetCount - templateSampleRowCount;
    const interiorRow = sheet.getRow(lastSampleRow - 1);
    sheet.duplicateRow(lastSampleRow, extra, true);

    for (let rowNumber = lastSampleRow; rowNumber < lastSampleRow + extra; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      for (let col = 1; col <= sheet.columnCount; col += 1) {
        const cell = row.getCell(col);
        cell.style = { ...cell.style, border: { ...cell.border, bottom: interiorRow.getCell(col).border?.bottom } };
      }
    }
  }
}
