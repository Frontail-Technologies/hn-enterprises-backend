import { and, eq, ilike, inArray, notInArray, or, sql } from "drizzle-orm";
import { getDb } from "@db";
import { customerNotes, customers, plumbers, projectSites, projects, users } from "@db/schema";
import { isForeignKeyViolation, toEntityInUseError, toSearchPattern } from "@utils";
import { auditService, permissionService } from "@services";
import type { AuthTokenPayload } from "@types";
import { getStatKeyCondition } from "./customers.service";
import { assertCustomersDeletable } from "./customers-deletion.service";

const MAX_BULK_TARGETS = 20000;

export type CustomerBulkFilters = {
  search?: string;
  status?: string;
  projectId?: string;
  siteId?: string;
  city?: string;
  statKey?: string;
  plumberId?: string;
  scheme?: string;
  connectionType?: string;
};

export type CustomerBulkSelection =
  | { mode: "ids"; ids: string[] }
  | { mode: "filter"; filters: CustomerBulkFilters; excludedIds?: string[] };

export type CustomerBulkChanges = {
  plumberId?: string | null;
  projectId?: string;
  siteId?: string | null;
  scheme?: string;
  connectionType?: string;
  houseType?: string;
  status?: string;
  paymentStatus?: string;
  paymentMode?: string;
  initialAmount?: string;
  jmrDone?: boolean;
  jmrSubmittedInPbg?: boolean;
  giBillDone?: boolean;
  gcBillDone?: boolean;
  conversionBillDone?: boolean;
};

const FIELD_LABELS: Record<string, string> = {
  plumberId: "Plumber",
  plumberName: "Plumber",
  projectId: "Project",
  siteId: "Site",
  scheme: "Scheme",
  connectionType: "Connection Type",
  houseType: "House Type",
  status: "Customer Status",
  paymentStatus: "Payment Status",
  paymentMode: "Payment Mode",
  initialAmount: "Initial Amount",
  jmrDone: "JMR Done",
  jmrSubmittedInPbg: "JMR Submitted in PBG",
  giBillDone: "GI Bill Done",
  gcBillDone: "GC Bill Done",
  conversionBillDone: "Conversion Bill Done",
};

function humanizeEnumValue(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildFilterConditions(filters: CustomerBulkFilters) {
  const searchPattern = toSearchPattern(filters.search);
  return [
    filters.projectId ? eq(customers.projectId, filters.projectId) : undefined,
    filters.siteId ? eq(customers.siteId, filters.siteId) : undefined,
    filters.status ? eq(customers.status, filters.status as (typeof customers.status.enumValues)[number]) : undefined,
    filters.city ? eq(customers.city, filters.city) : undefined,
    filters.plumberId ? eq(customers.plumberId, filters.plumberId) : undefined,
    filters.scheme ? eq(customers.scheme, filters.scheme) : undefined,
    filters.connectionType ? eq(customers.connectionType, filters.connectionType) : undefined,
    searchPattern
      ? or(
          ilike(customers.customerName, searchPattern),
          ilike(customers.trBpNumber, searchPattern),
          ilike(customers.mobileNumber, searchPattern),
        )
      : undefined,
    filters.statKey ? getStatKeyCondition(filters.statKey) : undefined,
  ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));
}

async function resolveSelectionIds(selection: CustomerBulkSelection): Promise<string[]> {
  const db = getDb();

  if (selection.mode === "ids") {
    const unique = Array.from(new Set(selection.ids));
    if (!unique.length) return [];
    if (unique.length > MAX_BULK_TARGETS) {
      throw new Error(`Too many customers selected (max ${MAX_BULK_TARGETS}).`);
    }
    const rows = await db
      .select({ id: customers.id })
      .from(customers)
      .where(inArray(customers.id, unique));
    return rows.map((row) => row.id);
  }

  const conditions = buildFilterConditions(selection.filters);
  const excluded = Array.from(new Set(selection.excludedIds ?? []));
  const where = and(
    ...conditions,
    excluded.length ? notInArray(customers.id, excluded) : undefined,
  );
  const rows = await db.select({ id: customers.id }).from(customers).where(where);
  if (rows.length > MAX_BULK_TARGETS) {
    throw new Error(`Too many customers matched (max ${MAX_BULK_TARGETS}).`);
  }
  return rows.map((row) => row.id);
}

async function getPlumberNameOrThrow(plumberId: string) {
  const db = getDb();
  const [plumber] = await db.select({ name: plumbers.name }).from(plumbers).where(eq(plumbers.id, plumberId)).limit(1);
  if (!plumber) throw new Error("Selected plumber was not found.");
  return plumber.name;
}

function isSet(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isBoolSet(value: boolean | undefined): value is boolean {
  return typeof value === "boolean";
}

async function resolveSharedProjectId(ids: string[]): Promise<string | undefined> {
  if (!ids.length) return undefined;
  const db = getDb();
  const rows = await db
    .selectDistinct({ projectId: customers.projectId })
    .from(customers)
    .where(inArray(customers.id, ids));
  return rows.length === 1 ? rows[0].projectId : undefined;
}

export const customersBulkService = {
  async bulkUpdate(
    selection: CustomerBulkSelection,
    changes: CustomerBulkChanges,
    currentUser: AuthTokenPayload,
  ) {
    const db = getDb();
    const ids = await resolveSelectionIds(selection);
    if (!ids.length) return { count: 0 };

    const columnPatch: Record<string, unknown> = {};
    const changeSummary: string[] = [];

    if ("plumberId" in changes) {
      if (isSet(changes.plumberId)) {
        const plumberName = await getPlumberNameOrThrow(changes.plumberId);
        columnPatch.plumberId = changes.plumberId;
        columnPatch.plumberName = plumberName;
        changeSummary.push(`${FIELD_LABELS.plumberId} → ${plumberName}`);
      } else {
        columnPatch.plumberId = null;
        columnPatch.plumberName = null;
        changeSummary.push(`${FIELD_LABELS.plumberId} → Cleared`);
      }
    }
    if (isSet(changes.projectId)) {
      const [project] = await db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.id, changes.projectId)).limit(1);
      if (!project) throw new Error("Selected project was not found.");
      columnPatch.projectId = changes.projectId;
      changeSummary.push(`${FIELD_LABELS.projectId} → ${project.name}`);
    }
    if ("siteId" in changes) {
      if (isSet(changes.siteId)) {
        const [site] = await db
          .select({ id: projectSites.id, name: projectSites.name, projectId: projectSites.projectId })
          .from(projectSites)
          .where(eq(projectSites.id, changes.siteId))
          .limit(1);
        if (!site) throw new Error("Selected site was not found.");
        if (isSet(changes.projectId) && site.projectId !== changes.projectId) {
          throw new Error("Selected site does not belong to the selected project.");
        }
        columnPatch.siteId = changes.siteId;
        changeSummary.push(`${FIELD_LABELS.siteId} → ${site.name}`);
      } else {
        columnPatch.siteId = null;
        changeSummary.push(`${FIELD_LABELS.siteId} → Cleared`);
      }
    }
    if (isSet(changes.scheme)) {
      columnPatch.scheme = changes.scheme;
      changeSummary.push(`${FIELD_LABELS.scheme} → ${changes.scheme}`);
    }
    if (isSet(changes.connectionType)) {
      columnPatch.connectionType = changes.connectionType;
      changeSummary.push(`${FIELD_LABELS.connectionType} → ${changes.connectionType}`);
    }
    if (isSet(changes.houseType)) {
      columnPatch.houseType = changes.houseType;
      changeSummary.push(`${FIELD_LABELS.houseType} → ${changes.houseType}`);
    }
    if (isSet(changes.status)) {
      columnPatch.status = changes.status;
      changeSummary.push(`${FIELD_LABELS.status} → ${humanizeEnumValue(changes.status)}`);
    }

    const jsonMerge: Record<string, unknown> = {};
    if (isSet(changes.paymentStatus)) {
      jsonMerge.paymentStatus = changes.paymentStatus;
      changeSummary.push(`${FIELD_LABELS.paymentStatus} → ${changes.paymentStatus}`);
    }
    if (isSet(changes.paymentMode)) {
      jsonMerge.paymentMode = changes.paymentMode;
      changeSummary.push(`${FIELD_LABELS.paymentMode} → ${changes.paymentMode}`);
    }
    if (isSet(changes.initialAmount)) {
      jsonMerge.initialAmount = changes.initialAmount;
      changeSummary.push(`${FIELD_LABELS.initialAmount} → ${changes.initialAmount}`);
    }
    if (isBoolSet(changes.jmrDone)) {
      jsonMerge.jmrDone = changes.jmrDone;
      changeSummary.push(`${FIELD_LABELS.jmrDone} → ${changes.jmrDone ? "Yes" : "No"}`);
    }
    if (isBoolSet(changes.jmrSubmittedInPbg)) {
      jsonMerge.jmrSubmittedInPbg = changes.jmrSubmittedInPbg;
      changeSummary.push(`${FIELD_LABELS.jmrSubmittedInPbg} → ${changes.jmrSubmittedInPbg ? "Yes" : "No"}`);
    }
    if (isBoolSet(changes.giBillDone)) {
      jsonMerge.giBillDone = changes.giBillDone;
      changeSummary.push(`${FIELD_LABELS.giBillDone} → ${changes.giBillDone ? "Yes" : "No"}`);
    }
    if (isBoolSet(changes.gcBillDone)) {
      jsonMerge.gcBillDone = changes.gcBillDone;
      changeSummary.push(`${FIELD_LABELS.gcBillDone} → ${changes.gcBillDone ? "Yes" : "No"}`);
    }
    if (isBoolSet(changes.conversionBillDone)) {
      jsonMerge.conversionBillDone = changes.conversionBillDone;
      changeSummary.push(`${FIELD_LABELS.conversionBillDone} → ${changes.conversionBillDone ? "Yes" : "No"}`);
    }

    const hasColumnChanges = Object.keys(columnPatch).length > 0;
    const hasJsonChanges = Object.keys(jsonMerge).length > 0;
    if (!hasColumnChanges && !hasJsonChanges) {
      throw new Error("No editable fields were provided.");
    }

    const giCompletionSync =
      changes.giBillDone === true
        ? sql`CASE WHEN (coalesce(${customers.giMeasurements}, '{}'::jsonb)->'completion'->>'completedAt') IS NULL
            THEN coalesce(${customers.giMeasurements}, '{}'::jsonb) || jsonb_build_object('completion', jsonb_build_object('completedAt', now(), 'completedBy', ${currentUser.id}::text))
            ELSE ${customers.giMeasurements} END`
        : undefined;
    const gcCompletionSync =
      changes.gcBillDone === true
        ? sql`CASE WHEN (coalesce(${customers.progressMilestones}, '{}'::jsonb)->'gc'->>'completedAt') IS NULL
            THEN coalesce(${customers.progressMilestones}, '{}'::jsonb) || jsonb_build_object('gc', jsonb_build_object('completedAt', now(), 'completedBy', ${currentUser.id}::text))
            ELSE ${customers.progressMilestones} END`
        : undefined;

    await db.transaction(async (tx) => {
      await tx
        .update(customers)
        .set({
          ...columnPatch,
          ...(hasJsonChanges
            ? {
                billingCompletion: sql`coalesce(${customers.billingCompletion}, '{}'::jsonb) || ${JSON.stringify(jsonMerge)}::jsonb`,
              }
            : {}),
          ...(giCompletionSync ? { giMeasurements: giCompletionSync } : {}),
          ...(gcCompletionSync ? { progressMilestones: gcCompletionSync } : {}),
          updatedBy: currentUser.id,
          updatedAt: new Date(),
        })
        .where(inArray(customers.id, ids));
    });

    const changedFields = [
      ...Object.keys(columnPatch).filter((k) => k !== "plumberName"),
      ...Object.keys(jsonMerge),
    ];
    const projectId = await resolveSharedProjectId(ids);
    await auditService.log({
      userId: currentUser.id,
      module: "Customers",
      action: "Bulk Updated Customers",
      recordId: ids.length === 1 ? ids[0] : `${ids.length} customers`,
      projectId,
      description: `Bulk updated ${ids.length} customer${ids.length === 1 ? "" : "s"}. Changed: ${changeSummary.join(", ")}`,
      metadata: { count: ids.length, mode: selection.mode, changedFields, changeSummary, changes },
    });

    return { count: ids.length };
  },

  async bulkRemark(selection: CustomerBulkSelection, note: string, currentUser: AuthTokenPayload) {
    const db = getDb();
    const ids = await resolveSelectionIds(selection);
    if (!ids.length) return { count: 0 };

    if (!permissionService.canModifyCustomer(currentUser)) {
      throw new Error("Not authorized to update these customers");
    }

    await db.transaction(async (tx) => {
      await tx.insert(customerNotes).values(
        ids.map((customerId) => ({ customerId, authorId: currentUser.id, note })),
      );
    });

    const projectId = await resolveSharedProjectId(ids);
    await auditService.log({
      userId: currentUser.id,
      module: "Customers",
      action: "Bulk Added Remark",
      recordId: ids.length === 1 ? ids[0] : `${ids.length} customers`,
      projectId,
      description: `Added a remark to ${ids.length} customer${ids.length === 1 ? "" : "s"}`,
      metadata: { count: ids.length, mode: selection.mode },
    });

    return { count: ids.length };
  },

  async bulkDelete(selection: CustomerBulkSelection, currentUser: AuthTokenPayload) {
    const db = getDb();
    const ids = await resolveSelectionIds(selection);
    if (!ids.length) return { count: 0 };

    const projectId = await resolveSharedProjectId(ids);

    try {
      await db.transaction(async (tx) => {
        await assertCustomersDeletable(tx, ids);
        await tx.delete(customers).where(inArray(customers.id, ids));
      });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw toEntityInUseError(
          error,
          "Some selected customers have associated records and cannot be deleted. Remove those records first.",
        );
      }
      throw error;
    }

    await auditService.log({
      userId: currentUser.id,
      module: "Customers",
      action: "Bulk Deleted Customers",
      recordId: `${ids.length} customers`,
      projectId,
      description: `Bulk deleted ${ids.length} customer${ids.length === 1 ? "" : "s"}`,
      metadata: { count: ids.length, mode: selection.mode, customerIds: ids },
    });

    return { count: ids.length };
  },
};
