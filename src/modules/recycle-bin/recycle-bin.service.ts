import { sql, type SQL } from "drizzle-orm";
import { getDb } from "@db";

type Executor = Pick<ReturnType<typeof getDb>, "execute">;

export const RETENTION_DAYS = 30;

/** Rows deleted together with a customer (ON DELETE CASCADE), restored as-is. */
const CUSTOMER_CHILD_TABLES = ["complaints", "customer_documents", "customer_lmc_pipe_records", "customer_notes", "work_progress_updates"] as const;
/** Rows that only lose their link to the customer (ON DELETE SET NULL), re-linked on restore. */
const CUSTOMER_LINKED_TABLES = ["activity_events", "material_transactions", "payments"] as const;

const idList = (ids: string[]) => sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `);

/**
 * Copy customers - and everything their delete removes or detaches - into the
 * recycle bin. Call inside the delete's transaction, right before deleting.
 */
export async function snapshotCustomers(tx: Executor, customerIds: string[], userId: string) {
  if (!customerIds.length) return;
  const children = CUSTOMER_CHILD_TABLES.map(
    (table) => sql`${table}::text, coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM ${sql.raw(table)} x WHERE x.customer_id = c.id), '[]'::jsonb)`,
  );
  const links = CUSTOMER_LINKED_TABLES.map(
    (table) => sql`${`${table}_ids`}::text, coalesce((SELECT jsonb_agg(x.id) FROM ${sql.raw(table)} x WHERE x.customer_id = c.id), '[]'::jsonb)`,
  );
  await tx.execute(sql`
    INSERT INTO deleted_records (entity_type, entity_id, label, data, deleted_by, expires_at)
    SELECT 'customer', c.id, coalesce(nullif(c.customer_name, ''), c.tr_bp_number),
           jsonb_build_object('customer', to_jsonb(c), ${sql.join([...children, ...links], sql`, `)}),
           ${userId}::uuid, now() + make_interval(days => ${RETENTION_DAYS})
    FROM customers c
    WHERE c.id IN (${idList(customerIds)})
  `);
}

export type RecycleBinItem = {
  id: string;
  entityType: string;
  entityId: string;
  label: string;
  trBpNumber: string | null;
  projectName: string | null;
  deletedAt: string;
  expiresAt: string;
  deletedByName: string | null;
  related: Record<string, number>;
};

async function purgeExpired(db: Executor) {
  await db.execute(sql`DELETE FROM deleted_records WHERE expires_at < now()`);
}

/** List (after dropping expired items); takes an executor so it can run inside a transaction. */
export async function listWith(db: Executor): Promise<RecycleBinItem[]> {
    await purgeExpired(db);
    const counts: SQL[] = CUSTOMER_CHILD_TABLES.map((table) => sql`${table}::text, jsonb_array_length(coalesce(d.data->${table}, '[]'::jsonb))`);
    const rows = await db.execute<Omit<RecycleBinItem, "related"> & { related: Record<string, number> }>(sql`
      SELECT d.id, d.entity_type AS "entityType", d.entity_id AS "entityId", d.label,
             d.data->'customer'->>'tr_bp_number' AS "trBpNumber",
             p.name AS "projectName", d.deleted_at AS "deletedAt", d.expires_at AS "expiresAt",
             u.name AS "deletedByName",
             jsonb_build_object(${sql.join(counts, sql`, `)}) AS related
      FROM deleted_records d
      LEFT JOIN users u ON u.id = d.deleted_by
      LEFT JOIN projects p ON p.id = (d.data->'customer'->>'project_id')::uuid
      ORDER BY d.deleted_at DESC
      LIMIT 2000
    `);
    return rows.map((row) => ({ ...row }));
}

/** Put a deleted customer back exactly as it was (same IDs), with its related rows and links. Run inside a transaction. */
export async function restoreWith(tx: Executor, recordId: string): Promise<{ label: string; entityId: string }> {
      const [record] = await tx.execute<{ id: string; entityType: string; entityId: string; label: string; projectId: string | null; siteId: string | null; trKey: string | null }>(sql`
        SELECT id, entity_type AS "entityType", entity_id AS "entityId", label,
               data->'customer'->>'project_id' AS "projectId", data->'customer'->>'site_id' AS "siteId",
               data->'customer'->>'normalized_tr_bp_number' AS "trKey"
        FROM deleted_records WHERE id = ${recordId}::uuid FOR UPDATE
      `);
      if (!record) throw new Error("This item is no longer in the recycle bin");
      if (record.entityType !== "customer") throw new Error("Only customers can be restored");

      const [conflicts] = await tx.execute<{ sameId: boolean; sameNumber: boolean; project: boolean; site: boolean }>(sql`
        SELECT EXISTS (SELECT 1 FROM customers WHERE id = ${record.entityId}::uuid) AS "sameId",
               EXISTS (SELECT 1 FROM customers WHERE normalized_tr_bp_number = ${record.trKey}) AS "sameNumber",
               EXISTS (SELECT 1 FROM projects WHERE id = ${record.projectId}::uuid) AS project,
               (${record.siteId}::uuid IS NULL OR EXISTS (SELECT 1 FROM project_sites WHERE id = ${record.siteId}::uuid)) AS site
      `);
      if (conflicts?.sameId) throw new Error(`"${record.label}" already exists - it was restored before`);
      if (conflicts?.sameNumber) throw new Error(`Another customer now has this BR/TR number, so "${record.label}" can't be restored`);
      if (!conflicts?.project) throw new Error(`The project of "${record.label}" was deleted, so it can't be restored`);
      if (!conflicts?.site) throw new Error(`The site of "${record.label}" was deleted, so it can't be restored`);

      const source = sql`(SELECT data FROM deleted_records WHERE id = ${recordId}::uuid)`;
      // A plumber/user referenced by the customer may have been deleted since:
      // clear those references in the same insert instead of failing the restore.
      const keepIfExists = (field: string, table: string) =>
        sql`${field}::text, CASE WHEN (j->>${field}) IS NOT NULL AND EXISTS (SELECT 1 FROM ${sql.raw(table)} WHERE id = (j->>${field})::uuid) THEN j->${field} ELSE 'null'::jsonb END`;
      await tx.execute(sql`
        WITH src AS (SELECT ${source}->'customer' AS j)
        INSERT INTO customers
        SELECT * FROM jsonb_populate_record(
          NULL::customers,
          (SELECT j || jsonb_build_object(${sql.join([keepIfExists("plumber_id", "plumbers"), keepIfExists("created_by", "users"), keepIfExists("updated_by", "users")], sql`, `)}) FROM src)
        )
      `);
      for (const table of CUSTOMER_CHILD_TABLES) {
        await tx.execute(sql`
          INSERT INTO ${sql.raw(table)}
          SELECT * FROM jsonb_populate_recordset(NULL::${sql.raw(table)}, coalesce(${source}->${table}, '[]'::jsonb))
        `);
      }
      for (const table of CUSTOMER_LINKED_TABLES) {
        await tx.execute(sql`
          UPDATE ${sql.raw(table)} SET customer_id = ${record.entityId}::uuid
          WHERE customer_id IS NULL
            AND id IN (SELECT jsonb_array_elements_text(coalesce(${source}->${`${table}_ids`}, '[]'::jsonb))::uuid)
        `);
      }
      await tx.execute(sql`DELETE FROM deleted_records WHERE id = ${recordId}::uuid`);
      return { label: record.label, entityId: record.entityId };
}

export const recycleBinService = {
  list: () => listWith(getDb()),

  restore: (recordId: string) => getDb().transaction((tx) => restoreWith(tx, recordId)),

  /** Empty the whole bin for good. */
  async purgeAll(): Promise<{ count: number }> {
    const db = getDb();
    const rows = await db.execute<{ id: string }>(sql`DELETE FROM deleted_records RETURNING id`);
    return { count: rows.length };
  },

  /** Remove an item from the bin for good. */
  async purge(recordId: string): Promise<{ label: string }> {
    const db = getDb();
    const [row] = await db.execute<{ label: string }>(sql`DELETE FROM deleted_records WHERE id = ${recordId}::uuid RETURNING label`);
    if (!row) throw new Error("This item is no longer in the recycle bin");
    return row;
  },
};
