import path from "node:path";
import type ExcelJS from "exceljs";
import ExcelJSImport from "exceljs";
import { CUSTOMER_COLUMN_CATALOG } from "@modules/customers/customer-columns.catalog";
import { writeCustomerRegisterSheet, type ColType } from "@modules/exports/customer-register-columns";

const previewColumns = CUSTOMER_COLUMN_CATALOG.map((entry) => ({ header: entry.label, type: entry.type }));

function sampleValue(type: ColType, rowIndex: number): ExcelJS.CellValue {
  switch (type) {
    case "num":
      return rowIndex === 1 ? 0 : 2;
    case "money":
      return rowIndex === 1 ? 0 : 1500;
    case "date":
      return new Date(Date.UTC(2026, 4, rowIndex + 9));
    case "bool":
      return rowIndex === 1;
    default:
      return `Sample value ${rowIndex}`;
  }
}

async function main() {
  const workbook = new ExcelJSImport.Workbook();
  workbook.creator = "HN Enterprises";
  const sheet = workbook.addWorksheet("Customer Register", {
    pageSetup: { orientation: "landscape", fitToPage: false },
  });

  const valueRows: ExcelJS.CellValue[][] = [1, 2].map((n) =>
    previewColumns.map((col) => sampleValue(col.type, n)),
  );
  writeCustomerRegisterSheet(sheet, previewColumns, valueRows);

  const outPath = path.join(process.cwd(), "..", "docs", "customer-register-template.xlsx");
  await workbook.xlsx.writeFile(outPath);
  console.log(`Wrote ${previewColumns.length}-column Customer Register template -> ${outPath}`);
}

await main();
process.exit(0);
