import { sql } from "drizzle-orm";
import { getDb } from "@db";
import { customerStatCondition } from "@modules/customers/customer-completion";

const STAT_KEYS = [
  "survey-done",
  "gi-done",
  "gc-done",
  "conversion-done",
  "jmr-done",
  "gi-bill-done",
  "gc-bill-done",
  "conversion-bill-done",
  "total-pbg-assignment",
  "connection-remark",
] as const;

export const dashboardStatsService = {
  async getAdminCounts(projectId?: string, city?: string) {
    const db = getDb();

    const scope = [];
    if (projectId) scope.push(sql`project_id = ${projectId}`);
    if (city) scope.push(sql`city = ${city}`);
    const whereClause = scope.length > 0 ? sql`WHERE ${sql.join(scope, sql` AND `)}` : sql``;

    // Every count is built from the one central stat definition so the dashboard
    // cards, the customers list `statKey` filter and (future) mobile all agree.
    const filters = STAT_KEYS.map((key) => {
      const alias = sql.raw(key.replace(/-/g, "_"));
      const condition = customerStatCondition(key) ?? sql`FALSE`;
      return sql`COUNT(*) FILTER (WHERE ${condition}) AS ${alias}`;
    });

    const result = await db.execute<Record<string, string>>(sql`
      SELECT COUNT(*) AS total_customers, ${sql.join(filters, sql`, `)}
      FROM customers
      ${whereClause}
    `);

    const row = result[0];

    const counts: Record<string, number> = { "total-customers": Number(row.total_customers) };
    for (const key of STAT_KEYS) {
      counts[key] = Number(row[key.replace(/-/g, "_")]);
    }
    return counts;
  },
};
