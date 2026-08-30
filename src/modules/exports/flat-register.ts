import type ExcelJS from "exceljs";
import { columnLetter } from "./workbook-helpers";


export type ColType = "text" | "num" | "money" | "date" | "bool";

export type FlatColumn<T> = {
  header: string;
  type: ColType;
  width?: number;
  get: (row: T, rowNumber: number) => ExcelJS.CellValue;
};


export function numOf(v: unknown): number | string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : s; // keep genuinely non-numeric text visible
}

export function dateOf(v: unknown): Date | string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return v;
  const s = String(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d;
}

export function textOf(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v);
  return s === "" ? null : s;
}

export function boolOf(v: unknown): boolean | null {
  if (v === null || v === undefined) return null;
  return Boolean(v);
}


const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFF7900" },
};

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FF000000" } },
  left: { style: "thin", color: { argb: "FF000000" } },
  bottom: { style: "thin", color: { argb: "FF000000" } },
  right: { style: "thin", color: { argb: "FF000000" } },
};

const MONEY_FMT = "#,##0.00";
const NUMBER_FMT = "0.00";
const DATE_FMT = "dd-mmm-yyyy";

export function applyHeaderStyle(cell: ExcelJS.Cell, wrap: boolean) {
  cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  cell.fill = HEADER_FILL;
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: wrap };
  cell.border = THIN_BORDER;
}

export function applyDataStyle(cell: ExcelJS.Cell, type: ColType) {
  cell.font = { name: "Calibri", size: 10, color: { argb: "FF1A1A1A" } };
  cell.border = THIN_BORDER;
  cell.alignment = { horizontal: type === "text" ? "left" : "center", vertical: "middle" };
  if (type === "money") cell.numFmt = MONEY_FMT;
  else if (type === "num") cell.numFmt = NUMBER_FMT;
  else if (type === "date") cell.numFmt = DATE_FMT;
}


const MIN_WIDTH = 8;
const MAX_WIDTH = 55;
const WIDTH_PAD = 2;

function displayLength(value: ExcelJS.CellValue, type: ColType): number {
  if (value === null || value === undefined) return 0;
  if (value instanceof Date) return 11;
  if (type === "bool") return 5;
  if (type === "num" && typeof value === "number") return value.toFixed(2).length;
  if (type === "money" && typeof value === "number") {
    return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).length;
  }
  return String(value).length;
}

export type WriteFlatRegisterOptions = {
  frozenCols?: number;
  wrapHeader?: boolean;
  headerRowHeight?: number;
  dataRowHeight?: number;
};

export function writeValueMatrixSheet(
  sheet: ExcelJS.Worksheet,
  columns: { header: string; type: ColType; width?: number }[],
  valueRows: ExcelJS.CellValue[][],
  options: WriteFlatRegisterOptions = {},
) {
  const { frozenCols = 0, wrapHeader = true, headerRowHeight = wrapHeader ? 32 : 20, dataRowHeight = 16 } = options;
  const HEADER_ROW = 1;
  const FIRST_DATA_ROW = 2;

  columns.forEach((col, colIndex) => {
    if (col.width) {
      sheet.getColumn(colIndex + 1).width = col.width;
      return;
    }
    let widest = col.header.length;
    for (const row of valueRows) {
      const len = displayLength(row[colIndex], col.type);
      if (len > widest) widest = len;
    }
    sheet.getColumn(colIndex + 1).width = Math.min(Math.max(widest + WIDTH_PAD, MIN_WIDTH), MAX_WIDTH);
  });

  const headerRow = sheet.getRow(HEADER_ROW);
  headerRow.height = headerRowHeight;
  columns.forEach((col, colIndex) => {
    const cell = headerRow.getCell(colIndex + 1);
    cell.value = col.header;
    applyHeaderStyle(cell, wrapHeader);
  });

  valueRows.forEach((row, rowIndex) => {
    const sheetRow = sheet.getRow(FIRST_DATA_ROW + rowIndex);
    sheetRow.height = dataRowHeight;
    columns.forEach((col, colIndex) => {
      const cell = sheetRow.getCell(colIndex + 1);
      cell.value = row[colIndex] ?? null;
      applyDataStyle(cell, col.type);
    });
  });

  const lastCol = columnLetter(columns.length);
  sheet.autoFilter = `A${HEADER_ROW}:${lastCol}${HEADER_ROW}`;
  sheet.views = [{ state: "frozen", xSplit: frozenCols, ySplit: HEADER_ROW }];
}

export function writeFlatRegisterSheet<T>(
  sheet: ExcelJS.Worksheet,
  columns: FlatColumn<T>[],
  rows: T[],
  options: WriteFlatRegisterOptions = {},
) {
  const valueRows = rows.map((row, index) => columns.map((col) => col.get(row, index + 1)));
  writeValueMatrixSheet(sheet, columns, valueRows, options);
}
