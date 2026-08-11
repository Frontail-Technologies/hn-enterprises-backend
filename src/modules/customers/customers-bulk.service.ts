import { and, eq, ilike, inArray, notInArray, or, sql } from "drizzle-orm";
import { getDb } from "@db";
import { customerNotes, customers, plumbers, projectSites, projects, users } from "@db/schema";
import { toSearchPattern } from "@utils";
import { auditService } from "@services";
import type { AuthTokenPayload } from "@types";
import { getStatKeyCondition } from "./customers.service";

// Hard ceiling so a runaway selection can't lock the whole table (§16).
const MAX_BULK_TARGETS = 20000;

export type CustomerBulkFilters = {
  search?: string;
  status?: string;
  projectId?: string;
  siteId?: string;
  city?: string;
  statKey?: string;
  supervisorId?: string;
  plumberId?: string;
  scheme?: string;
  connectionType?: string;
};

export type CustomerBulkSelection =
  | { mode: "ids"; ids: string[] }
  | { mode: "filter"; filters: CustomerBulkFilters; excludedIds?: string[] };

// Only these fields may EVER be touched by a bulk operation. Identity fields
// (name/mobile/address/TR & report/meter numbers), unique report/meter
// identifiers, and individual technical measurements are intentionally
// absent so a bulk op can never overwrite them (§26) - each field here is
// one where "apply the same value to many customers" is a real operation.
export type CustomerBulkChanges = {
  supervisorId?: string | null;
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
  supervisorId: "Supervisor",
  supervisorName: "Supervisor",
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

// Build the same WHERE the customer list uses, plus operational filters, so
// "select all matching" resolves server-side without shipping ids around.
function buildFilterConditions(filters: CustomerBulkFilters) {
  const searchPattern = toSearchPattern(filters.search);
  return [
    filters.projectId ? eq(customers.projectId, filters.projectId) : undefined,
    filters.siteId ? eq(customers.siteId, filters.siteId) : undefined,
    filters.status ? eq(customers.status, filters.status as (typeof customers.status.enumValues)[number]) : undefined,
    filters.city ? eq(customers.city, filters.city) : undefined,
    filters.supervisorId ? eq(customers.supervisorId, filters.supervisorId) : undefined,
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

// Resolve a selection to a concrete, existing set of customer ids. Filter mode
// runs an indexed SELECT server-side (never trusts a client-sent id list for
// "all matching"); ids mode is intersected with real rows so phantom ids are
// dropped from the count.
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

async function getUserNameOrThrow(userId: string) {
  const db = getDb();
  const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("Selected supervisor was not found.");
  return user.name;
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

// Booleans need their own presence check - `false` is a real, explicit
// value (e.g. "mark GI Bill Done = No") and must not be treated the same as
// "field not provided" the way an empty string is for `isSet`.
function isBoolSet(value: boolean | undefined): value is boolean {
  return typeof value === "boolean";
}

// Activity foundation (Project Command Center Phase 1): a bulk op only gets
// tagged with a projectId when every targeted customer belongs to the SAME
// project - a selection spanning multiple projects is intentionally left
// unscoped rather than guessing which project "owns" the event.
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
  /**
   * Set-based bulk update over an allowlisted field set. Runs ONE UPDATE for
   * every target row inside a transaction (§17/§18) - no per-row loop.
   */
  async bulkUpdate(
    selection: CustomerBulkSelection,
    changes: CustomerBulkChanges,
    currentUser: AuthTokenPayload,
  ) {
    const db = getDb();
    const ids = await resolveSelectionIds(selection);
    if (!ids.length) return { count: 0 };

    // Build the column patch EXPLICITLY - never spread `changes` into the ORM.
    const columnPatch: Record<string, unknown> = {};
    // Human-readable "Field → value" lines for the audit description (§ Audit Log).
    const changeSummary: string[] = [];

    if ("supervisorId" in changes) {
      if (isSet(changes.supervisorId)) {
        const supervisorName = await getUserNameOrThrow(changes.supervisorId);
        columnPatch.supervisorId = changes.supervisorId;
        columnPatch.supervisorName = supervisorName;
        changeSummary.push(`${FIELD_LABELS.supervisorId} → ${supervisorName}`);
      } else {
        columnPatch.supervisorId = null;
        columnPatch.supervisorName = null;
        changeSummary.push(`${FIELD_LABELS.supervisorId} → Cleared`);
      }
    }
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
        // If project is being set in the same operation, the site must belong to it (§8).
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

    // paymentStatus/paymentMode/initialAmount/the completion booleans all
    // live inside the billingCompletion jsonb section - merge (never
    // replace) so other billing fields survive.
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
          updatedBy: currentUser.id,
          updatedAt: new Date(),
        })
        .where(inArray(customers.id, ids));
    });

    const changedFields = [
      ...Object.keys(columnPatch).filter((k) => k !== "supervisorName" && k !== "plumberName"),
      ...Object.keys(jsonMerge),
    ];
    // One aggregate record for the whole operation (never one per row) - the
    // description reads as "Field → value" lines so Recent Activity shows
    // exactly what changed without opening the metadata.
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

  /** Append one customerNotes row per selected customer (remarks are a history, §6/§11). */
  async bulkRemark(selection: CustomerBulkSelection, note: string, currentUser: AuthTokenPayload) {
    const db = getDb();
    const ids = await resolveSelectionIds(selection);
    if (!ids.length) return { count: 0 };

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

  /** Hard delete (matches the existing single-delete policy - no soft-delete concept exists). */
  async bulkDelete(selection: CustomerBulkSelection, currentUser: AuthTokenPayload) {
    const db = getDb();
    const ids = await resolveSelectionIds(selection);
    if (!ids.length) return { count: 0 };

    // Resolved BEFORE the delete - once these customers are gone there's no
    // way to look their project back up.
    const projectId = await resolveSharedProjectId(ids);

    try {
      await db.transaction(async (tx) => {
        await tx.delete(customers).where(inArray(customers.id, ids));
      });
    } catch (error: any) {
      if (error?.code === "23503") {
        throw new Error(
          "Some selected customers have associated records (e.g. bills or payments) and cannot be deleted. Remove those records first.",
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
