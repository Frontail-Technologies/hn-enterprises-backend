import { count, eq, inArray } from "drizzle-orm";
import { getDb } from "@db";
import {
  complaints,
  customerDocuments,
  customerLmcPipeRecords,
  customerNotes,
  customers,
  dprRecords,
  materialTransactions,
  payments,
  sitePlans,
  workProgressUpdates,
} from "@db/schema";
import { auditService } from "@services";
import { EntityInUseError } from "@utils";
import { computeDeleteImpact } from "../deletion/deletion.service";
import type { DbHandle, DeleteImpactConfig, DeleteImpactDependencyConfig, DeleteImpactResult } from "../deletion/deletion.types";

/**
 * Audited FK graph for Customer deletion (§3).
 *
 * - customer_documents, customer_notes, customer_lmc_pipe_records, complaints,
 *   work_progress_updates: all `ON DELETE CASCADE` off customers.id and are pure
 *   customer-scoped records (photos, notes, pipe-laying records, support tickets,
 *   stage-progress log) -> delete with the customer.
 * - payments: DB-level `customerId` is nullable (`ON DELETE SET NULL`), so a raw
 *   delete would technically succeed - but that's exactly the "don't just make
 *   the FK error go away" trap. Payments are financial records; silently
 *   detaching them from the customer they were paid for loses traceability.
 *   Business policy here is stricter than the DB: block, don't detach (§3, §7).
 *   (Bills are project-linked only - they no longer reference a customer at all.)
 * - material_transactions: `ON DELETE SET NULL`, and unlike bills/payments this
 *   *is* the safe case - the ledger is append-only and already treats "no
 *   customer" as a normal, valid state (e.g. store issues). Detach.
 * - site_plans, dpr_records: `ON DELETE RESTRICT` (customerId is required, not
 *   nullable - a plan/DPR is filed per customer). These are field-work history
 *   comparable in importance to bills/payments - block, don't cascade or detach.
 */
function countOf(db: DbHandle) {
  return db.select({ value: count() });
}

async function scalarCount(query: Promise<{ value: number }[]>) {
  const [row] = await query;
  return row?.value ?? 0;
}

function customerDependencies(customerId: string): DeleteImpactDependencyConfig[] {
  return [
    {
      key: "customerDocuments",
      label: "Customer Documents",
      action: "delete",
      count: async (db) => scalarCount(countOf(db).from(customerDocuments).where(eq(customerDocuments.customerId, customerId))),
      preview: async (db) =>
        db
          .select({ id: customerDocuments.id, label: customerDocuments.fileName })
          .from(customerDocuments)
          .where(eq(customerDocuments.customerId, customerId))
          .limit(5),
    },
    {
      key: "customerNotes",
      label: "Customer Notes",
      action: "delete",
      count: async (db) => scalarCount(countOf(db).from(customerNotes).where(eq(customerNotes.customerId, customerId))),
    },
    {
      key: "customerLmcPipeRecords",
      label: "LMC Pipe Records",
      action: "delete",
      count: async (db) =>
        scalarCount(countOf(db).from(customerLmcPipeRecords).where(eq(customerLmcPipeRecords.customerId, customerId))),
    },
    {
      key: "complaints",
      label: "Complaints",
      action: "delete",
      count: async (db) => scalarCount(countOf(db).from(complaints).where(eq(complaints.customerId, customerId))),
      preview: async (db) =>
        db.select({ id: complaints.id, label: complaints.title }).from(complaints).where(eq(complaints.customerId, customerId)).limit(5),
    },
    {
      key: "workProgressUpdates",
      label: "Work Progress Updates",
      action: "delete",
      count: async (db) =>
        scalarCount(countOf(db).from(workProgressUpdates).where(eq(workProgressUpdates.customerId, customerId))),
    },
    {
      key: "payments",
      label: "Payments",
      action: "block",
      count: async (db) => scalarCount(countOf(db).from(payments).where(eq(payments.customerId, customerId))),
      blockReason: (n) => `${n} payment${n === 1 ? "" : "s"} reference this customer. Payment records are never deleted automatically.`,
    },
    {
      key: "materialTransactions",
      label: "Material Transactions",
      action: "detach",
      count: async (db) =>
        scalarCount(countOf(db).from(materialTransactions).where(eq(materialTransactions.customerId, customerId))),
    },
    {
      key: "sitePlans",
      label: "Site Plans",
      action: "block",
      count: async (db) => scalarCount(countOf(db).from(sitePlans).where(eq(sitePlans.customerId, customerId))),
      blockReason: (n) => `${n} site plan${n === 1 ? "" : "s"} reference this customer. Field planning history is never deleted automatically.`,
    },
    {
      key: "dprRecords",
      label: "DPR Records",
      action: "block",
      count: async (db) => scalarCount(countOf(db).from(dprRecords).where(eq(dprRecords.customerId, customerId))),
      blockReason: (n) => `${n} DPR record${n === 1 ? "" : "s"} reference this customer. Field work history is never deleted automatically.`,
    },
  ];
}

function buildCustomerDeleteImpactConfig(customerId: string): DeleteImpactConfig {
  return {
    entityType: "customer",
    getLabel: async (db) => {
      const [customer] = await db.select({ customerName: customers.customerName }).from(customers).where(eq(customers.id, customerId)).limit(1);
      if (!customer) throw new Error("Customer not found");
      return customer.customerName;
    },
    dependencies: customerDependencies(customerId),
  };
}

export const customersDeletionService = {
  async getDeleteImpact(customerId: string): Promise<DeleteImpactResult> {
    const db = getDb();
    return computeDeleteImpact(db, buildCustomerDeleteImpactConfig(customerId), customerId);
  },

  async execute(customerId: string, userId: string): Promise<{ label: string; totalAffected: number }> {
    const db = getDb();

    const result = await db.transaction(async (tx) => {
      const config = buildCustomerDeleteImpactConfig(customerId);
      const impact = await computeDeleteImpact(tx, config, customerId);

      if (!impact.canDelete) {
        throw new EntityInUseError(`"${impact.entity.label}" cannot be deleted: ${impact.blockers.map((b) => b.reason).join(" ")}`);
      }

      // No explicit child deletes needed - every "delete" dependency here is a
      // native DB CASCADE off customers.id, so removing the customer row cascades
      // them automatically. Only the customer row itself needs deleting.
      await tx.delete(customers).where(eq(customers.id, customerId));

      return { label: impact.entity.label, totalAffected: impact.totalAffected };
    });

    await auditService.log({
      userId,
      module: "Customers",
      action: "Deleted Customer (cascade)",
      recordId: customerId,
      description: `Deleted customer "${result.label}" and ${result.totalAffected} related record${result.totalAffected === 1 ? "" : "s"}`,
      metadata: { totalAffected: result.totalAffected },
    });

    return result;
  },
};

// Exported for the bulk-delete path (customers-bulk.service.ts) to reuse the same
// audited policy instead of a second, divergent set of rules.
export async function assertCustomersDeletable(db: DbHandle, customerIds: string[]) {
  if (!customerIds.length) return;
  const blockingPayments = await scalarCount(countOf(db).from(payments).where(inArray(payments.customerId, customerIds)));
  const blockingSitePlans = await scalarCount(countOf(db).from(sitePlans).where(inArray(sitePlans.customerId, customerIds)));
  const blockingDprRecords = await scalarCount(countOf(db).from(dprRecords).where(inArray(dprRecords.customerId, customerIds)));
  if (blockingPayments > 0 || blockingSitePlans > 0 || blockingDprRecords > 0) {
    const parts: string[] = [];
    if (blockingPayments > 0) parts.push(`${blockingPayments} payment${blockingPayments === 1 ? "" : "s"}`);
    if (blockingSitePlans > 0) parts.push(`${blockingSitePlans} site plan${blockingSitePlans === 1 ? "" : "s"}`);
    if (blockingDprRecords > 0) parts.push(`${blockingDprRecords} DPR record${blockingDprRecords === 1 ? "" : "s"}`);
    throw new EntityInUseError(
      `Some selected customers cannot be deleted: ${parts.join(", ")} reference them. Financial and field-work records are never deleted automatically.`,
    );
  }
}
