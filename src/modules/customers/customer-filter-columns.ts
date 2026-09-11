import { sql, type SQLWrapper } from "drizzle-orm";
import { customers } from "@db/schema";

/**
 * Server-backed Excel-style filter/distinct-values whitelist for CustomersList's
 * master sheet. Every EnterpriseDataGrid column currently renders a distinct-value
 * filter dropdown (there's no per-column opt-out), but the master sheet has 100+
 * columns and most of them are derived from nested JSONB sections (survey,
 * giMeasurements, valvesRegulators, fittingsAccessories, lmcPipelineWork,
 * mdpeFittings, commissioningConversion beyond the two below) or fully dynamic
 * customFields - reimplementing all of that business logic in SQL is a much
 * larger, riskier undertaking than this regression-closure batch, and several of
 * those values (e.g. kycVerified, lastPaymentDate, completion audit fields) are
 * computed client-side, not stored at all.
 *
 * This whitelist intentionally covers only columns that are BOTH (a) real,
 * directly queryable customers-table columns or simple JSONB scalar fields and
 * (b) passed through byte-for-byte by mapCustomer() with no display-label
 * transformation - so a value returned here always matches what the grid shows.
 * `status` and `projectName`/`siteArea` are deliberately excluded: status has a
 * frontend display-label mapping (STATUS_TO_FRONTEND) that would need a
 * duplicated, drift-prone mirror table on the backend, and projectName/siteArea
 * require a join that customers.list()'s relational query isn't set up for
 * without a larger rewrite. All are reported, not silently dropped.
 */
export const CUSTOMER_FILTER_COLUMNS = {
  customerName: customers.customerName,
  trBpNo: customers.trBpNumber,
  mobileNo: customers.mobileNumber,
  fullAddress: customers.fullAddress,
  city: customers.city,
  connectionType: customers.connectionType,
  houseType: customers.houseType,
  scheme: customers.scheme,
  plumberName: customers.plumberName,
  reportNoGi: customers.giReportNumber,
  reportNoGc: customers.gcReportNumber,
  reportNoConversion: customers.conversionReportNumber,
  paymentStatus: sql<string>`(${customers.billingCompletion}->>'paymentStatus')`,
  paymentMode: sql<string>`(${customers.billingCompletion}->>'paymentMode')`,
} as const;

export type CustomerFilterColumnKey = keyof typeof CUSTOMER_FILTER_COLUMNS;

export function isCustomerFilterColumnKey(key: string): key is CustomerFilterColumnKey {
  return Object.prototype.hasOwnProperty.call(CUSTOMER_FILTER_COLUMNS, key);
}

/**
 * The whitelist mixes plain PgColumns with raw JSONB-extraction SQL fragments
 * (paymentStatus/paymentMode), which don't share a single overload of
 * drizzle's inArray() - built by hand via sql.join() so both kinds work
 * identically.
 */
export function customerFilterColumnInArray(key: CustomerFilterColumnKey, values: string[]) {
  const expr = CUSTOMER_FILTER_COLUMNS[key] as SQLWrapper;
  return sql`${expr} in (${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )})`;
}
