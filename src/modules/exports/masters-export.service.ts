import ExcelJS from "exceljs";
import { holidaysService, masterValuesService } from "@modules/masters/masters.service";
import type { MasterValueCategory } from "@modules/masters/masters.types";
import { buildExportFilename } from "./workbook-helpers";
import { dateOf, textOf, writeFlatRegisterSheet, type FlatColumn } from "./flat-register";
import type { HolidaysExportQuery, MasterValuesExportQuery } from "./exports.types";

const STATUS_LABELS: Record<string, string> = { active: "Active", inactive: "Inactive" };
const HOLIDAY_TYPE_LABELS: Record<string, string> = {
  national: "National",
  restricted: "Restricted",
  company: "Company",
};

function newWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HN Enterprises";
  return workbook;
}

export const mastersExportService = {
  async masterValues(query: MasterValuesExportQuery) {
    const rows = await masterValuesService.list({
      category: query.category as MasterValueCategory,
      search: query.search,
    });

    type Row = (typeof rows)[number];
    const columns: FlatColumn<Row>[] = [
      { header: "S.No.", type: "num", width: 8, get: (_row, rowNumber) => rowNumber },
      { header: "Value", type: "text", width: 28, get: (row) => textOf(row.value) },
      { header: "Description", type: "text", width: 40, get: (row) => textOf(row.description) },
      { header: "Status", type: "text", width: 14, get: (row) => textOf(STATUS_LABELS[row.status] ?? row.status) },
    ];

    const workbook = newWorkbook();
    const sheet = workbook.addWorksheet("Master Values", { pageSetup: { orientation: "landscape" } });
    writeFlatRegisterSheet(sheet, columns, rows, { frozenCols: 1 });

    const filename = buildExportFilename([query.category.replace(/_/g, "-")]);
    return { workbook, filename };
  },

  async holidays(query: HolidaysExportQuery) {
    const rows = await holidaysService.list({ search: query.search });

    type Row = (typeof rows)[number];
    const columns: FlatColumn<Row>[] = [
      { header: "S.No.", type: "num", width: 8, get: (_row, rowNumber) => rowNumber },
      { header: "Holiday Name", type: "text", width: 28, get: (row) => textOf(row.name) },
      { header: "Date", type: "date", width: 16, get: (row) => dateOf(row.date) },
      { header: "Type", type: "text", width: 16, get: (row) => textOf(HOLIDAY_TYPE_LABELS[row.type] ?? row.type) },
      { header: "Status", type: "text", width: 14, get: (row) => textOf(STATUS_LABELS[row.status] ?? row.status) },
    ];

    const workbook = newWorkbook();
    const sheet = workbook.addWorksheet("Holidays", { pageSetup: { orientation: "landscape" } });
    writeFlatRegisterSheet(sheet, columns, rows, { frozenCols: 1 });

    const filename = buildExportFilename(["Holidays"]);
    return { workbook, filename };
  },
};
