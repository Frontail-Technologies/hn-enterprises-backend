import { count, eq, inArray, sql } from "drizzle-orm";
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
import { snapshotCustomers, type CustomerOptionalTable } from "@modules/recycle-bin/recycle-bin.service";

/** What the admin ticked in the delete dialog. Defaults keep expenses and material entries. */
export type CustomerDeleteOptions = {
  /** Ignored: plans / DPRs are project-wise now (kept so older admin builds don't fail validation). */
  deletePlans?: boolean;
  deletePayments?: boolean;
  deleteMaterial?: boolean;
};

function optionalTables(options: CustomerDeleteOptions): CustomerOptionalTable[] {
  return [
    // Leftover per-customer plans / DPRs (old app versions) always go with the customer.
    "site_plans",
    "dpr_records",
    ...(options.deletePayments ? (["payments"] as const) : []),
    ...(options.deleteMaterial ? (["material_transactions"] as const) : []),
  ];
}

/**
 * Remove the ticked related rows (after the snapshot), and stamp the customer's
 * name on expenses that are kept, so they read "Deleted customer (name)".
 */
async function removeOptionalRows(tx: DbHandle, customerIds: string[], options: CustomerDeleteOptions) {
  if (!customerIds.length) return;
  // Old per-customer plans / DPRs (planning is project-wise now): never block a delete.
  await tx.delete(dprRecords).where(inArray(dprRecords.customerId, customerIds));
  await tx.delete(sitePlans).where(inArray(sitePlans.customerId, customerIds));
  if (options.deletePayments) {
    await tx.delete(payments).where(inArray(payments.customerId, customerIds));
  } else {
    await tx
      .update(payments)
      .set({ customerNameSnapshot: sql`(SELECT c.customer_name FROM customers c WHERE c.id = ${payments.customerId})` })
      .where(inArray(payments.customerId, customerIds));
  }
  if (options.deleteMaterial) {
    await tx.delete(materialTransactions).where(inArray(materialTransactions.customerId, customerIds));
  }
}

function countOf(db: DbHandle) {
  return db.select({ value: count() });
}

async function scalarCount(query: Promise<{ value: number }[]>) {
  const [row] = await query;
  return row?.value ?? 0;
}

function customerDependencies(customerId: string, options: CustomerDeleteOptions = {}): DeleteImpactDependencyConfig[] {
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
      label: "Payments & expenses",
      action: options.deletePayments ? "delete" : "detach",
      count: async (db) => scalarCount(countOf(db).from(payments).where(eq(payments.customerId, customerId))),
    },
    {
      key: "materialTransactions",
      label: "Material entries",
      action: options.deleteMaterial ? "delete" : "detach",
      count: async (db) =>
        scalarCount(countOf(db).from(materialTransactions).where(eq(materialTransactions.customerId, customerId))),
    },
  ];
}

function buildCustomerDeleteImpactConfig(customerId: string, options: CustomerDeleteOptions = {}): DeleteImpactConfig {
  return {
    entityType: "customer",
    getLabel: async (db) => {
      const [customer] = await db.select({ customerName: customers.customerName }).from(customers).where(eq(customers.id, customerId)).limit(1);
      if (!customer) throw new Error("Customer not found");
      return customer.customerName;
    },
    dependencies: customerDependencies(customerId, options),
  };
}

export const customersDeletionService = {
  async getDeleteImpact(customerId: string): Promise<DeleteImpactResult> {
    const db = getDb();
    return computeDeleteImpact(db, buildCustomerDeleteImpactConfig(customerId), customerId);
  },

  async execute(customerId: string, userId: string, options: CustomerDeleteOptions = {}): Promise<{ label: string; totalAffected: number }> {
    const db = getDb();

    const result = await db.transaction(async (tx) => {
      const config = buildCustomerDeleteImpactConfig(customerId, options);
      const impact = await computeDeleteImpact(tx, config, customerId);

      if (!impact.canDelete) {
        throw new EntityInUseError(`"${impact.entity.label}" cannot be deleted: ${impact.blockers.map((b) => b.reason).join(" ")}`);
      }

      // Keep a restorable copy for 30 days (recycle bin) before deleting.
      await snapshotCustomers(tx, [customerId], userId, optionalTables(options));
      await removeOptionalRows(tx, [customerId], options);
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

/** Bulk delete: nothing blocks any more (expenses and material entries are kept or deleted as ticked). */
export async function assertCustomersDeletable(_db: DbHandle, _customerIds: string[], _options: CustomerDeleteOptions = {}) {
  return;
}

/** Snapshot + remove ticked related rows for a bulk delete (call inside its transaction). */
export async function prepareCustomersDelete(tx: DbHandle, customerIds: string[], userId: string, options: CustomerDeleteOptions = {}) {
  await snapshotCustomers(tx, customerIds, userId, optionalTables(options));
  await removeOptionalRows(tx, customerIds, options);
}
