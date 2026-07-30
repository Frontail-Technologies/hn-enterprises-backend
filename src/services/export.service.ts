export type CsvColumn<T> = {
  header: string;
  getValue: (row: T) => unknown;
};

function escapeCsv(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export const exportService = {
  toCsv<T>(rows: T[], columns: CsvColumn<T>[]) {
    const header = columns.map((column) => escapeCsv(column.header)).join(",");
    const body = rows
      .map((row) => columns.map((column) => escapeCsv(column.getValue(row))).join(","))
      .join("\n");

    return [header, body].filter(Boolean).join("\n");
  },
};
