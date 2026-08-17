/**
 * Fixed cell coordinates for the WAGES-MAY sheet in
 * templates/attendance-wages-template.xlsx. Centralized here so the export
 * service never scatters raw row/column numbers.
 */
export const wageTemplateLayout = {
  sheetName: "WAGES-MAY",
  contractorCell: "A3",
  clientCell: "F3",
  periodCell: "A4",
  monthValueCell: "H4",
  yearValueCell: "K4",
  headerLastRow: 6,
  firstDataRow: 7,
  templateSampleRowCount: 6,
  columns: {
    slNo: 1,
    name: 2,
    category: 3,
    rate: 4,
    daysWorked: 5,
    basic: 6,
    total: 7,
    pf: 8,
    esic: 9,
    totalDeduction: 10,
    netPayment: 11,
    signature: 12,
  },
} as const;
