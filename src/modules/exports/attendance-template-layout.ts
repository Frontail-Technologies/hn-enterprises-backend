/**
 * Fixed cell coordinates for the ATTENDANCE-MAY sheet in
 * templates/attendance-wages-template.xlsx. Centralized here so the export
 * service never scatters raw row/column numbers.
 */
export const attendanceTemplateLayout = {
  sheetName: "ATTENDANCE-MAY",
  contractorCell: "A3",
  clientCell: "O3",
  periodCell: "A4",
  monthValueCell: "Z4",
  yearValueCell: "AF4",
  headerLastRow: 6,
  firstDataRow: 7,
  templateSampleRowCount: 6,
  columns: {
    slNo: 1,
    name: 2,
    placeOfWork: 3,
    firstDay: 4,
    maxDayColumns: 31,
    summary: 35,
    signature: 36,
  },
} as const;
