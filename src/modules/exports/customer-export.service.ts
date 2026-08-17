import ExcelJS from "exceljs";
import { and, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { getDb } from "@db";
import { customers, users } from "@db/schema";
import { customerStatCondition } from "@modules/customers/customer-completion";
import { resolveCustomerColumns } from "@modules/customers/customer-columns.service";
import type { CustomerStatus } from "@modules/customers/customers.types";
import { toSearchPattern } from "@utils";
import {
  CUSTOMER_COLUMN_GETTERS,
  writeCustomerRegisterSheet,
  type ColumnContext,
  type ColType,
  type CustomerColumnGetter,
  type CustomerExportRow,
} from "./customer-register-columns";
import { buildExportFilename } from "./workbook-helpers";
import type { CustomerRegisterQuery } from "./exports.types";

function buildWhere(query: CustomerRegisterQuery): SQL | undefined {
  const searchPattern = toSearchPattern(query.search);
  const conditions = [
    query.projectId ? eq(customers.projectId, query.projectId) : undefined,
    query.siteId ? eq(customers.siteId, query.siteId) : undefined,
    query.status ? eq(customers.status, query.status as CustomerStatus) : undefined,
    query.city ? eq(customers.city, query.city) : undefined,
    searchPattern
      ? or(
          ilike(customers.customerName, searchPattern),
          ilike(customers.trBpNumber, searchPattern),
          ilike(customers.mobileNumber, searchPattern),
        )
      : undefined,
    query.statKey ? customerStatCondition(query.statKey) : undefined,
  ].filter((condition): condition is SQL => Boolean(condition));

  return conditions.length ? and(...conditions) : undefined;
}

// A dynamic/custom field has no entry in CUSTOMER_COLUMN_GETTERS (that map only
// covers the static catalog) - its value always lives at customFields[key],
// exactly like the Web master sheet's `...customer.customFields` spread.
function customFieldGetter(key: string): CustomerColumnGetter {
  return (row) => {
    const value = row.customFields?.[key];
    return value === null || value === undefined || value === "" ? null : (value as ExcelJS.CellValue);
  };
}

export const customerExportService = {
  async build(query: CustomerRegisterQuery, currentUserId: string | null) {
    const db = getDb();
    const where = buildWhere(query);

    const [rows, userRows, resolvedColumns] = await Promise.all([
      db.query.customers.findMany({
        where,
        orderBy: (fields, { desc: d }) => [desc(fields.createdAt), d(fields.id)],
        with: { project: true, site: true, lmcPipeRecords: true, documents: true },
      }),
      db.select({ id: users.id, name: users.name }).from(users),
      resolveCustomerColumns(currentUserId),
    ]);

    const userNames = new Map(userRows.map((u) => [u.id, u.name]));
    const ctx: ColumnContext = {
      resolveUser: (id) => (id ? userNames.get(id) ?? id : null),
    };

    // Only visible columns export, in the exact saved order - the same
    // resolved config the Web table renders from (§ shared column config).
    const visibleColumns = resolvedColumns
      .filter((column) => column.visible)
      .map((column) => ({
        key: column.key,
        header: column.label,
        type: column.type as ColType,
        get: CUSTOMER_COLUMN_GETTERS[column.key] ?? customFieldGetter(column.key),
      }));

    const valueRows = (rows as CustomerExportRow[]).map((customer, rowIndex) =>
      visibleColumns.map((col) => col.get(customer, rowIndex + 1, ctx)),
    );

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "HN Enterprises";
    const sheet = workbook.addWorksheet("Customer Register", {
      pageSetup: { orientation: "landscape", fitToPage: false },
    });
    writeCustomerRegisterSheet(
      sheet,
      visibleColumns.map((col) => ({ header: col.header, type: col.type })),
      valueRows,
    );

    const projectName = rows[0]?.project?.name ?? undefined;
    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = buildExportFilename([
      "Customer-Register",
      query.projectId ? projectName : undefined,
      dateStamp,
    ]);

    return { workbook, filename };
  },
};
