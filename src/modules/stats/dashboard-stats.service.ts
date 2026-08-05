import { sql } from "drizzle-orm";
import { getDb } from "@db";

export const dashboardStatsService = {
  async getAdminCounts(projectId?: string, city?: string) {
    const db = getDb();
    
    // Base where clause based on scope
    const conditions = [];
    if (projectId) {
      conditions.push(sql`project_id = ${projectId}`);
    }
    if (city) {
      conditions.push(sql`city = ${city}`);
    }
    
    const whereClause = conditions.length > 0 
      ? sql`WHERE ${sql.join(conditions, sql` AND `)}` 
      : sql``;

    // Execute raw SQL to get all counts in a single query
    const result = await db.execute<{
      total_customers: string;
      survey_done: string;
      gi_done: string;
      gc_done: string;
      conversion_done: string;
      jmr_done: string;
      gi_bill_done: string;
      gc_bill_done: string;
      conversion_bill_done: string;
      total_pbg_assignment: string;
      connection_remark: string;
    }>(sql`
      SELECT 
        COUNT(*) as total_customers,
        COUNT(*) FILTER (WHERE survey->>'surveyDate' IS NOT NULL) as survey_done,
        COUNT(*) FILTER (WHERE commissioning_conversion->>'installationDate' IS NOT NULL) as gi_done,
        COUNT(*) FILTER (WHERE commissioning_conversion->>'commissioningDate' IS NOT NULL OR commissioning_conversion->>'meterNo' IS NOT NULL) as gc_done,
        COUNT(*) FILTER (WHERE commissioning_conversion->>'conversionDate' IS NOT NULL) as conversion_done,
        COUNT(*) FILTER (WHERE billing_completion->>'jmrDone' = 'true') as jmr_done,
        COUNT(*) FILTER (WHERE billing_completion->>'giBillDone' = 'true') as gi_bill_done,
        COUNT(*) FILTER (WHERE billing_completion->>'gcBillDone' = 'true') as gc_bill_done,
        COUNT(*) FILTER (WHERE billing_completion->>'conversionBillDone' = 'true') as conversion_bill_done,
        COUNT(*) FILTER (WHERE billing_completion->>'jmrSubmittedInPbg' = 'true') as total_pbg_assignment,
        COUNT(*) FILTER (
          WHERE status = 'on_hold' 
          OR survey->>'approvalStatus' IN ('Sent Back', 'Rejected')
          OR EXISTS (SELECT 1 FROM customer_lmc_pipe_records WHERE customer_id = customers.id AND laying_status = 'on_hold')
        ) as connection_remark
      FROM customers
      ${whereClause}
    `);

    const row = result[0];
    
    return {
      "total-customers": Number(row.total_customers),
      "survey-done": Number(row.survey_done),
      "gi-done": Number(row.gi_done),
      "gc-done": Number(row.gc_done),
      "conversion-done": Number(row.conversion_done),
      "jmr-done": Number(row.jmr_done),
      "gi-bill-done": Number(row.gi_bill_done),
      "gc-bill-done": Number(row.gc_bill_done),
      "conversion-bill-done": Number(row.conversion_bill_done),
      "total-pbg-assignment": Number(row.total_pbg_assignment),
      "connection-remark": Number(row.connection_remark)
    };
  }
};
