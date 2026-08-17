import { wagesService } from "@modules/wages/wages.service";
import { attendanceTemplateLayout } from "./attendance-template-layout";
import { wageTemplateLayout as layout } from "./wage-template-layout";
import type { WageExportQuery } from "./exports.types";
import {
  buildExportFilename,
  loadTemplateWorkbook,
  parseMonthYear,
  removeOtherSheet,
  resolveMonthPeriod,
  setDataRowCount,
  stripImages,
} from "./workbook-helpers";

const CATEGORY_DISPLAY: Record<string, string> = {
  high_skilled: "HIGH SKILLED",
  skilled: "SKILLED",
  unskilled: "UNSKILLED",
};

export const wageExportService = {
  async build(query: WageExportQuery) {
    const { month, year } = parseMonthYear(query.month, query.year);
    const period = resolveMonthPeriod(month, year);
    const monthKey = `${year}-${String(month).padStart(2, "0")}`;

    const records = await wagesService.listForMonthWithPlumbers(monthKey);

    const workbook = await loadTemplateWorkbook();
    removeOtherSheet(workbook, attendanceTemplateLayout.sheetName);
    const sheet = workbook.getWorksheet(layout.sheetName);
    if (!sheet) throw new Error("Wage register template sheet is missing");
    stripImages(sheet);

    // Plumbers have no project/site relation in the current data model, so the
    // Contractor/Client letterhead fields have no authoritative source here.
    sheet.getCell(layout.contractorCell).value = "";
    sheet.getCell(layout.clientCell).value = "";
    sheet.getCell(layout.periodCell).value = period.periodLabel;
    sheet.getCell(layout.monthValueCell).value = period.monthName;
    sheet.getCell(layout.yearValueCell).value = period.year;

    setDataRowCount(sheet, layout.firstDataRow, layout.templateSampleRowCount, records.length);

    const { slNo, name, category, rate, daysWorked, basic, total, pf, esic, totalDeduction, netPayment } =
      layout.columns;

    records.forEach((record, index) => {
      const row = sheet.getRow(layout.firstDataRow + index);
      // No persistent "Sl. No. in Employee register" field exists on plumbers - a row
      // index is NOT that register number, so the cell is left blank rather than showing
      // a fake-looking serial. `index` is still used to place the row itself.
      row.getCell(slNo).value = null;
      row.getCell(name).value = record.plumberName;
      row.getCell(category).value = CATEGORY_DISPLAY[record.category] ?? record.category;
      row.getCell(rate).value = Number(record.wageRate);
      row.getCell(daysWorked).value = Number(record.daysWorked);
      row.getCell(basic).value = record.basic;
      row.getCell(total).value = record.total;
      row.getCell(pf).value = Number(record.pf);
      row.getCell(esic).value = Number(record.esic);
      row.getCell(totalDeduction).value = record.totalDeduction;
      row.getCell(netPayment).value = record.netPayment;
    });

    // Column L is the template's last column (Signature, layout.columns.signature = 12).
    const lastRow = layout.headerLastRow + records.length;
    sheet.pageSetup.printArea = `A1:L${Math.max(lastRow, layout.headerLastRow)}`;

    const filename = buildExportFilename(["Wages", period.monthShortYear]);

    return { workbook, filename };
  },
};
