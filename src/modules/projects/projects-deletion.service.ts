import { count, eq, inArray } from "drizzle-orm";
import { getDb } from "@db";
import {
  auditLogs,
  bills,
  complaints,
  customerDocuments,
  customerLmcPipeRecords,
  customerNotes,
  customers,
  dprRecords,
  materialTransactions,
  payments,
  projectDocuments,
  projects,
  projectSites,
  sitePlans,
  staff,
  users,
  workProgressUpdates,
} from "@db/schema";
import { auditService } from "@services";
import { EntityInUseError } from "@utils";
import { computeDeleteImpact } from "../deletion/deletion.service";
import type {
  DbHandle,
  DeleteImpactConfig,
  DeleteImpactDependencyConfig,
  DeleteImpactResult,
} from "../deletion/deletion.types";

function countOf(db: DbHandle) {
  return db.select({ value: count() });
}

async function scalarCount(query: Promise<{ value: number }[]>) {
  const [row] = await query;
  return row?.value ?? 0;
}

function projectDependencies(
  projectId: string,
): DeleteImpactDependencyConfig[] {
  const customerIdsSubquery = (db: DbHandle) =>
    db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.projectId, projectId));

  return [
    {
      key: "projectSites",
      label: "Project Sites",
      action: "delete",
      count: async (db) =>
        scalarCount(
          countOf(db)
            .from(projectSites)
            .where(eq(projectSites.projectId, projectId)),
        ),
      preview: async (db) =>
        db
          .select({ id: projectSites.id, label: projectSites.name })
          .from(projectSites)
          .where(eq(projectSites.projectId, projectId))
          .limit(5),
    },
    {
      key: "projectDocuments",
      label: "Project Documents",
      action: "delete",
      count: async (db) =>
        scalarCount(
          countOf(db)
            .from(projectDocuments)
            .where(eq(projectDocuments.projectId, projectId)),
        ),
      preview: async (db) =>
        db
          .select({ id: projectDocuments.id, label: projectDocuments.fileName })
          .from(projectDocuments)
          .where(eq(projectDocuments.projectId, projectId))
          .limit(5),
    },
    {
      key: "customers",
      label: "Customers",
      action: "delete",
      count: async (db) =>
        scalarCount(
          countOf(db).from(customers).where(eq(customers.projectId, projectId)),
        ),
      preview: async (db) =>
        db
          .select({ id: customers.id, label: customers.customerName })
          .from(customers)
          .where(eq(customers.projectId, projectId))
          .limit(5),
    },
    {
      key: "customerDocuments",
      label: "Customer Documents",
      action: "delete",
      count: async (db) =>
        scalarCount(
          countOf(db)
            .from(customerDocuments)
            .where(eq(customerDocuments.projectId, projectId)),
        ),
      preview: async (db) =>
        db
          .select({
            id: customerDocuments.id,
            label: customerDocuments.fileName,
          })
          .from(customerDocuments)
          .where(eq(customerDocuments.projectId, projectId))
          .limit(5),
    },
    {
      key: "customerNotes",
      label: "Customer Notes",
      action: "delete",
      count: async (db) =>
        scalarCount(
          countOf(db)
            .from(customerNotes)
            .where(inArray(customerNotes.customerId, customerIdsSubquery(db))),
        ),
    },
    {
      key: "customerLmcPipeRecords",
      label: "Customer LMC Pipe Records",
      action: "delete",
      count: async (db) =>
        scalarCount(
          countOf(db)
            .from(customerLmcPipeRecords)
            .where(
              inArray(
                customerLmcPipeRecords.customerId,
                customerIdsSubquery(db),
              ),
            ),
        ),
    },
    {
      key: "complaints",
      label: "Complaints",
      action: "delete",
      count: async (db) =>
        scalarCount(
          countOf(db)
            .from(complaints)
            .where(inArray(complaints.customerId, customerIdsSubquery(db))),
        ),
      preview: async (db) =>
        db
          .select({ id: complaints.id, label: complaints.title })
          .from(complaints)
          .where(inArray(complaints.customerId, customerIdsSubquery(db)))
          .limit(5),
    },
    {
      key: "workProgressUpdates",
      label: "Work Progress Updates",
      action: "delete",
      count: async (db) =>
        scalarCount(
          countOf(db)
            .from(workProgressUpdates)
            .where(
              inArray(workProgressUpdates.customerId, customerIdsSubquery(db)),
            ),
        ),
    },
    {
      key: "bills",
      label: "Bills",
      action: "block",
      count: async (db) =>
        scalarCount(
          countOf(db).from(bills).where(eq(bills.projectId, projectId)),
        ),
      preview: async (db) =>
        db
          .select({ id: bills.id, label: bills.billNumber })
          .from(bills)
          .where(eq(bills.projectId, projectId))
          .limit(5),
      blockReason: (n) =>
        `${n} bill${n === 1 ? "" : "s"} exist for this project. Billing/financial records are never deleted automatically.`,
    },
    {
      key: "sitePlans",
      label: "Site Plans",
      action: "block",
      count: async (db) =>
        scalarCount(
          countOf(db).from(sitePlans).where(eq(sitePlans.projectId, projectId)),
        ),
      blockReason: (n) =>
        `${n} site plan${n === 1 ? "" : "s"} exist for this project's daily scheduling history.`,
    },
    {
      key: "dprRecords",
      label: "DPR Records",
      action: "block",
      count: async (db) =>
        scalarCount(
          countOf(db)
            .from(dprRecords)
            .where(eq(dprRecords.projectId, projectId)),
        ),
      preview: async (db) =>
        (
          await db
            .select({
              id: dprRecords.id,
              date: dprRecords.date,
              status: dprRecords.status,
            })
            .from(dprRecords)
            .where(eq(dprRecords.projectId, projectId))
            .limit(5)
        ).map((row) => ({ id: row.id, label: `${row.date} (${row.status})` })),
      blockReason: (n) =>
        `${n} DPR record${n === 1 ? "" : "s"} exist - daily progress reports are operational history and are never deleted automatically.`,
    },
    {
      key: "payments",
      label: "Payments",
      action: "detach",
      count: async (db) =>
        scalarCount(
          countOf(db).from(payments).where(eq(payments.projectId, projectId)),
        ),
    },
    {
      key: "materialTransactions",
      label: "Material Transactions",
      action: "detach",
      count: async (db) =>
        scalarCount(
          countOf(db)
            .from(materialTransactions)
            .where(eq(materialTransactions.projectId, projectId)),
        ),
    },
    {
      key: "auditLogs",
      label: "Audit Log Entries",
      action: "detach",
      count: async (db) =>
        scalarCount(
          countOf(db).from(auditLogs).where(eq(auditLogs.projectId, projectId)),
        ),
    },
    {
      key: "staff",
      label: "Staff Assignments",
      action: "detach",
      count: async (db) =>
        scalarCount(
          countOf(db).from(staff).where(eq(staff.assignedProjectId, projectId)),
        ),
      preview: async (db) =>
        db
          .select({ id: staff.id, label: users.name })
          .from(staff)
          .innerJoin(users, eq(staff.userId, users.id))
          .where(eq(staff.assignedProjectId, projectId))
          .limit(5),
    },
  ];
}

function buildProjectDeleteImpactConfig(projectId: string): DeleteImpactConfig {
  return {
    entityType: "project",
    getLabel: async (db) => {
      const [project] = await db
        .select({ name: projects.name })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      if (!project) throw new Error("Project not found");
      return project.name;
    },
    dependencies: projectDependencies(projectId),
  };
}

export const projectsDeletionService = {
  async getDeleteImpact(projectId: string): Promise<DeleteImpactResult> {
    const db = getDb();
    return computeDeleteImpact(
      db,
      buildProjectDeleteImpactConfig(projectId),
      projectId,
    );
  },

  async execute(
    projectId: string,
    userId: string,
  ): Promise<{ label: string; totalAffected: number }> {
    const db = getDb();

    const result = await db.transaction(async (tx) => {
      const config = buildProjectDeleteImpactConfig(projectId);
      const impact = await computeDeleteImpact(tx, config, projectId);

      if (!impact.canDelete) {
        throw new EntityInUseError(
          `"${impact.entity.label}" cannot be deleted: ${impact.blockers.map((b) => b.reason).join(" ")}`,
        );
      }

      await tx.delete(customers).where(eq(customers.projectId, projectId));
      await tx.delete(projects).where(eq(projects.id, projectId));

      return {
        label: impact.entity.label,
        totalAffected: impact.totalAffected,
      };
    });

    await auditService.log({
      userId,
      module: "Projects",
      action: "Deleted Project (cascade)",
      recordId: projectId,
      description: `Deleted project "${result.label}" and ${result.totalAffected} related record${result.totalAffected === 1 ? "" : "s"}`,
      metadata: { totalAffected: result.totalAffected },
    });

    return result;
  },
};
