import { sql, type SQL } from "drizzle-orm";
import type { getDb } from "@db";

export type Executor = Pick<ReturnType<typeof getDb>, "execute">;

export const RETENTION_DAYS = 30;

export const idList = (ids: string[]) => sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `);

/**
 * Generic recycle-bin snapshots for projects, materials, plumbers, staff,
 * bills, expenses and sites. Each bin row stores
 *   data = { row: <main row>, tables: { <table>: [rows] }, relink: { "<table>.<column>": [{ id, ref }] } }
 * - `tables`: rows the delete removes (cascade or explicit), restored in `tables` order.
 * - `relink`: rows the delete only detaches (ON DELETE SET NULL), linked back on restore.
 * In the SQL fragments below the main row is `m` and the saved/linked row is `x`.
 */
type TableSpec = { table: string; where: SQL };
type RelinkSpec = { table: string; column: string; where: SQL };
type EntitySpec = {
  table: string;
  /** Label shown in the bin (expression over `m`). */
  label: SQL;
  /** Extra condition on the main row (e.g. staff without a login only). */
  filter?: SQL;
  tables: TableSpec[];
  relink: RelinkSpec[];
};

const inProject = (table: string) => sql.raw(`(SELECT id FROM ${table} WHERE project_id = m.id)`);
const projectCustomers = inProject("customers");
const projectSites = inProject("project_sites");
const projectBills = inProject("bills");

const SPECS = {
  project: {
    table: "projects",
    label: sql`m.name || coalesce(' (' || nullif(m.code, '') || ')', '')`,
    tables: [
      { table: "project_sites", where: sql`x.project_id = m.id` },
      { table: "customers", where: sql`x.project_id = m.id` },
      ...["complaints", "customer_documents", "customer_lmc_pipe_records", "customer_notes", "work_progress_updates"].map((table) => ({
        table,
        where: sql`x.customer_id IN ${projectCustomers}`,
      })),
      { table: "site_plans", where: sql`x.project_id = m.id` },
      { table: "dpr_records", where: sql`x.project_id = m.id` },
      // Project-wise plans / DPRs (deleted with the project, restored with it).
      { table: "project_plans", where: sql`x.project_id = m.id` },
      { table: "project_dprs", where: sql`x.project_id = m.id` },
      { table: "bills", where: sql`x.project_id = m.id` },
      { table: "bill_payments", where: sql`x.bill_id IN ${projectBills}` },
      { table: "project_members", where: sql`x.project_id = m.id` },
      { table: "project_documents", where: sql`x.project_id = m.id` },
    ],
    relink: [
      ...["payments", "material_transactions", "activity_events", "audit_logs"].map((table) => ({ table, column: "project_id", where: sql`x.project_id = m.id` })),
      ...["payments", "material_transactions"].map((table) => ({ table, column: "site_id", where: sql`x.site_id IN ${projectSites}` })),
      ...["payments", "material_transactions", "activity_events"].map((table) => ({ table, column: "customer_id", where: sql`x.customer_id IN ${projectCustomers}` })),
      { table: "staff", column: "assigned_project_id", where: sql`x.assigned_project_id = m.id` },
    ],
  },
  project_site: {
    table: "project_sites",
    label: sql`m.name`,
    tables: [],
    relink: ["payments", "material_transactions", "project_documents"].map((table) => ({ table, column: "site_id", where: sql`x.site_id = m.id` })),
  },
  material: {
    table: "materials",
    label: sql`m.name`,
    tables: [{ table: "material_transactions", where: sql`x.material_id = m.id` }],
    relink: [],
  },
  plumber: {
    table: "plumbers",
    label: sql`m.name`,
    tables: [{ table: "project_members", where: sql`x.plumber_id = m.id` }],
    relink: ["customers", "material_transactions", "payments"].map((table) => ({ table, column: "plumber_id", where: sql`x.plumber_id = m.id` })),
  },
  staff: {
    table: "staff",
    label: sql`coalesce(nullif(m.name, ''), 'Staff')`,
    filter: sql`m.user_id IS NULL`,
    tables: [],
    relink: [],
  },
  bill: {
    table: "bills",
    label: sql`m.bill_number`,
    tables: [{ table: "bill_payments", where: sql`x.bill_id = m.id` }],
    relink: [],
  },
  payment: {
    table: "payments",
    label: sql`initcap(replace(m.category::text, '_', ' ')) || ' - ' || m.amount::text || ' - ' || to_char(m.payment_date AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY')`,
    tables: [],
    relink: [{ table: "material_transactions", column: "payment_id", where: sql`x.payment_id = m.id` }],
  },
} satisfies Record<string, EntitySpec>;

export type GenericEntityType = keyof typeof SPECS;
export const GENERIC_ENTITY_TYPES = Object.keys(SPECS) as GenericEntityType[];
export const isGenericEntityType = (type: string): type is GenericEntityType => type in SPECS;

/**
 * Copy rows - and everything their delete removes or detaches - into the
 * recycle bin, one bin item per row. Call inside the delete's transaction,
 * right before deleting.
 */
export async function snapshotRecords(tx: Executor, entityType: GenericEntityType, ids: string[], userId: string) {
  if (!ids.length) return;
  const spec: EntitySpec = SPECS[entityType];
  const tables = spec.tables.map(
    ({ table, where }) => sql`${table}::text, coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM ${sql.raw(table)} x WHERE ${where}), '[]'::jsonb)`,
  );
  const relink = spec.relink.map(
    ({ table, column, where }) =>
      sql`${`${table}.${column}`}::text, coalesce((SELECT jsonb_agg(jsonb_build_object('id', x.id, 'ref', x.${sql.raw(column)})) FROM ${sql.raw(table)} x WHERE ${where}), '[]'::jsonb)`,
  );
  await tx.execute(sql`
    INSERT INTO deleted_records (entity_type, entity_id, label, data, deleted_by, expires_at)
    SELECT ${entityType}, m.id, ${spec.label},
           jsonb_build_object(
             'row', to_jsonb(m),
             'tables', jsonb_build_object(${tables.length ? sql.join(tables, sql`, `) : sql``}),
             'relink', jsonb_build_object(${relink.length ? sql.join(relink, sql`, `) : sql``})
           ),
           ${userId}::uuid, now() + make_interval(days => ${RETENTION_DAYS})
    FROM ${sql.raw(spec.table)} m
    WHERE m.id IN (${idList(ids)}) ${spec.filter ? sql`AND ${spec.filter}` : sql``}
  `);
}

// ---------------------------------------------------------------- restore

type ForeignKey = { table: string; column: string; refTable: string; refColumn: string; refType: string; setNull: boolean };
let foreignKeys: Promise<ForeignKey[]> | null = null;

/** Single-column foreign keys of the public schema (read from Postgres, cached). */
function loadForeignKeys(tx: Executor) {
  foreignKeys ??= tx
    .execute<ForeignKey>(sql`
      SELECT cl.relname AS "table", a.attname AS "column", cf.relname AS "refTable", af.attname AS "refColumn",
             format_type(af.atttypid, af.atttypmod) AS "refType", c.confdeltype = 'n' AS "setNull"
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid
      JOIN pg_class cf ON cf.oid = c.confrelid
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      JOIN pg_attribute af ON af.attrelid = c.confrelid AND af.attnum = c.confkey[1]
      WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 1 AND cl.relnamespace = 'public'::regnamespace
    `)
    .then((rows) => rows.map((row) => ({ ...row })))
    .catch((error) => {
      foreignKeys = null;
      throw error;
    });
  return foreignKeys;
}

/**
 * Insert saved rows back as they were (same ids). A reference to something
 * that no longer exists is cleared when the column allows it (SET NULL FKs,
 * e.g. a deleted user or plumber); otherwise the row is skipped (e.g. a team
 * member whose user account is gone). Returns the number of rows inserted.
 */
async function insertRows(tx: Executor, table: string, rows: SQL, fks: ForeignKey[]) {
  const own = fks.filter((fk) => fk.table === table);
  const exists = (fk: ForeignKey) => {
    const value = sql`(x->>${fk.column})`;
    const inTable = sql`EXISTS (SELECT 1 FROM ${sql.raw(fk.refTable)} z WHERE z.${sql.raw(fk.refColumn)} = ${value}::${sql.raw(fk.refType)})`;
    // A row may point at another row of the same batch (e.g. a reversal entry).
    const inBatch = fk.refTable === table ? sql` OR ${value} IN (SELECT y->>${fk.refColumn} FROM jsonb_array_elements(${rows}) y)` : sql``;
    return sql`(${value} IS NULL OR ${inTable}${inBatch})`;
  };
  const cleared = own.filter((fk) => fk.setNull).map((fk) => sql`${fk.column}::text, CASE WHEN ${exists(fk)} THEN x->${fk.column} ELSE 'null'::jsonb END`);
  const required = own.filter((fk) => !fk.setNull).map(exists);
  const result = await tx.execute(sql`
    INSERT INTO ${sql.raw(table)}
    SELECT * FROM jsonb_populate_recordset(NULL::${sql.raw(table)}, (
      SELECT coalesce(jsonb_agg(x || jsonb_build_object(${cleared.length ? sql.join(cleared, sql`, `) : sql``})), '[]'::jsonb)
      FROM jsonb_array_elements(${rows}) x
      ${required.length ? sql`WHERE ${sql.join(required, sql` AND `)}` : sql``}
    ))
    ON CONFLICT DO NOTHING
    RETURNING 1
  `);
  return result.length;
}

/** Put detached rows back on the restored record (only where nothing else was linked since). */
async function relinkRows(tx: Executor, table: string, column: string, links: SQL, fks: ForeignKey[]) {
  const fk = fks.find((key) => key.table === table && key.column === column);
  if (!fk) return;
  const type = sql.raw(fk.refType);
  await tx.execute(sql`
    UPDATE ${sql.raw(table)} t SET ${sql.raw(column)} = r.ref::${type}
    FROM jsonb_to_recordset(${links}) AS r(id text, ref text)
    WHERE t.id = r.id::uuid AND t.${sql.raw(column)} IS NULL
      AND EXISTS (SELECT 1 FROM ${sql.raw(fk.refTable)} z WHERE z.${sql.raw(fk.refColumn)} = r.ref::${type})
  `);
}

const TYPE_NAMES: Record<GenericEntityType, string> = {
  project: "project",
  project_site: "site",
  material: "material",
  plumber: "plumber",
  staff: "staff member",
  bill: "bill",
  payment: "expense",
};

/**
 * Reasons a restore must be refused: a parent it needs was deleted, or a
 * unique value (code, name, number) is now used by another record.
 * `r` is the saved main row; `t` the saved tables.
 */
function conflictChecks(type: GenericEntityType, label: string): { when: SQL; message: string }[] {
  const r = (field: string) => sql`(src.data->'row'->>${field})`;
  const quoted = `"${label}"`;
  switch (type) {
    case "project":
      return [
        { when: sql`EXISTS (SELECT 1 FROM projects WHERE normalized_code = ${r("normalized_code")})`, message: `Another project now uses the code of ${quoted}, so it cannot be restored` },
        {
          when: sql`EXISTS (SELECT 1 FROM projects WHERE normalized_name = ${r("normalized_name")} AND normalized_city = ${r("normalized_city")})`,
          message: `Another project in the same city now has the name of ${quoted}, so it cannot be restored`,
        },
        {
          when: sql`EXISTS (SELECT 1 FROM customers c JOIN jsonb_array_elements(src.data->'tables'->'customers') s ON c.normalized_tr_bp_number = s->>'normalized_tr_bp_number')`,
          message: `Some customers of ${quoted} have BR/TR numbers that are now used by other customers, so it cannot be restored`,
        },
        {
          when: sql`EXISTS (SELECT 1 FROM bills b JOIN jsonb_array_elements(src.data->'tables'->'bills') s ON b.normalized_bill_number = s->>'normalized_bill_number')`,
          message: `Some bills of ${quoted} have bill numbers that are now used by other bills, so it cannot be restored`,
        },
      ];
    case "project_site":
      return [
        { when: sql`NOT EXISTS (SELECT 1 FROM projects WHERE id = ${r("project_id")}::uuid)`, message: `The project of ${quoted} was deleted, so it cannot be restored` },
        {
          when: sql`EXISTS (SELECT 1 FROM project_sites WHERE project_id = ${r("project_id")}::uuid AND (normalized_name = ${r("normalized_name")} OR normalized_code = ${r("normalized_code")}))`,
          message: `Another site of this project now has the name or code of ${quoted}, so it cannot be restored`,
        },
      ];
    case "material":
      return [{ when: sql`EXISTS (SELECT 1 FROM materials WHERE normalized_name = ${r("normalized_name")})`, message: `Another material is now named ${quoted}, so it cannot be restored` }];
    case "plumber":
      return [
        {
          when: sql`EXISTS (SELECT 1 FROM plumbers WHERE category::text = ${r("category")} AND normalized_name = ${r("normalized_name")})`,
          message: `Another plumber/labour is now named ${quoted}, so it cannot be restored`,
        },
      ];
    case "bill":
      return [
        { when: sql`NOT EXISTS (SELECT 1 FROM projects WHERE id = ${r("project_id")}::uuid)`, message: `The project of bill ${quoted} was deleted, so it cannot be restored` },
        { when: sql`EXISTS (SELECT 1 FROM bills WHERE normalized_bill_number = ${r("normalized_bill_number")})`, message: `Another bill now has the number ${quoted}, so it cannot be restored` },
      ];
    case "staff":
    case "payment":
      return [];
  }
}

/** Restore a generic bin item (see SPECS). Run inside a transaction; the bin row must be locked. */
export async function restoreGeneric(tx: Executor, recordId: string, record: { entityType: GenericEntityType; entityId: string; label: string }) {
  const spec: EntitySpec = SPECS[record.entityType];
  const source = sql`(SELECT data FROM deleted_records WHERE id = ${recordId}::uuid)`;

  const [already] = await tx.execute<{ found: boolean }>(
    sql`SELECT EXISTS (SELECT 1 FROM ${sql.raw(spec.table)} WHERE id = ${record.entityId}::uuid) AS found`,
  );
  if (already?.found) throw new Error(`"${record.label}" already exists - it was restored before`);

  const checks = conflictChecks(record.entityType, record.label);
  if (checks.length) {
    const [hits] = await tx.execute<Record<string, boolean>>(sql`
      SELECT ${sql.join(checks.map((check, index) => sql`${check.when} AS ${sql.raw(`c${index}`)}`), sql`, `)}
      FROM (SELECT ${source} AS data) src
    `);
    const failed = checks.find((_, index) => hits?.[`c${index}`]);
    if (failed) throw new Error(failed.message);
  }

  const fks = await loadForeignKeys(tx);
  const inserted = await insertRows(tx, spec.table, sql`jsonb_build_array(${source}->'row')`, fks);
  if (!inserted) throw new Error(`Something this ${TYPE_NAMES[record.entityType]} belongs to was deleted, so "${record.label}" cannot be restored`);

  for (const { table } of spec.tables) {
    await insertRows(tx, table, sql`coalesce(${source}->'tables'->${table}, '[]'::jsonb)`, fks);
  }
  for (const { table, column } of spec.relink) {
    await relinkRows(tx, table, column, sql`coalesce(${source}->'relink'->${`${table}.${column}`}, '[]'::jsonb)`, fks);
  }
  await tx.execute(sql`DELETE FROM deleted_records WHERE id = ${recordId}::uuid`);
  return { label: record.label, entityId: record.entityId };
}
