import { and, asc, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { getDb } from "@db";
import { complaints, customerDocuments, customerLmcPipeRecords, customerNotes, customers, plumbers, users, workProgressUpdates } from "@db/schema";
import { normalizeKey } from "@modules/master-import/master-import.mapper";
import { buildPaginationMeta, cleanObject, parsePagination, toSearchPattern } from "@utils";
import { auditService, permissionService } from "@services";
import { activityService } from "@modules/activity/activity.service";
import {
  buildCustomerCompletionAudit,
  customerStatCondition,
  customerStatDateCondition,
  evaluateCustomerCompletion,
  PROGRESS_MILESTONE_KEYS,
  type ProgressMilestoneKey,
} from "./customer-completion";
import { customersDeletionService } from "./customers-deletion.service";
import {
  CUSTOMER_FILTER_COLUMNS,
  customerFilterColumnInArray,
  isCustomerFilterColumnKey,
  type CustomerFilterColumnKey,
} from "./customer-filter-columns";
import type { AuthTokenPayload } from "@types";
import type {
  CreateCustomerBody,
  CreateCustomerNoteBody,
  CustomerFilterOptionsQuery,
  CustomerJsonSections,
  CustomerListQuery,
  LmcPipeRecordInput,
  ResolvedCustomerDocumentInput,
  UpdateCustomerBody,
  UpsertLmcPipeRecordBody,
} from "./customers.types";

/** Parses the JSON-encoded columnFilters query param, silently dropping anything not in the whitelist. */
function parseCustomerColumnFilters(raw: string | undefined): Partial<Record<CustomerFilterColumnKey, string[]>> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object") return {};

  const result: Partial<Record<CustomerFilterColumnKey, string[]>> = {};
  for (const [key, values] of Object.entries(parsed as Record<string, unknown>)) {
    if (!isCustomerFilterColumnKey(key) || !Array.isArray(values)) continue;
    const clean = values.filter((value): value is string => typeof value === "string" && value.length > 0);
    if (clean.length) result[key] = clean;
  }
  return result;
}

/** Builds one inArray() condition per active column filter, optionally excluding a column (its own filter, when computing that column's distinct options). */
function buildCustomerColumnFilterConditions(
  columnFilters: Partial<Record<CustomerFilterColumnKey, string[]>>,
  excludeKey?: CustomerFilterColumnKey,
) {
  return Object.entries(columnFilters)
    .filter(([key]) => key !== excludeKey)
    .map(([key, values]) => customerFilterColumnInArray(key as CustomerFilterColumnKey, values as string[]));
}

const JSON_SECTION_KEYS = [
  "survey",
  "giMeasurements",
  "valvesRegulators",
  "fittingsAccessories",
  "lmcPipelineWork",
  "mdpeFittings",
  "commissioningConversion",
  "billingCompletion",
  "customFields",
] as const satisfies readonly (keyof CustomerJsonSections)[];

const EXPLICIT_COMPLETION_SECTIONS: Record<string, true> = {
  giMeasurements: true,
  valvesRegulators: true,
  fittingsAccessories: true,
  mdpeFittings: true,
  lmcPipelineWork: true,
};

const PROGRESS_MILESTONE_SECTIONS: Record<string, true> = Object.fromEntries(
  PROGRESS_MILESTONE_KEYS.map((key) => [key, true]),
);

const REOPEN_BLOCKED_BY_BILL: Partial<Record<string, { billField: string; label: string }>> = {
  giMeasurements: { billField: "giBillDone", label: "GI Bill Done" },
  gc: { billField: "gcBillDone", label: "GC Bill Done" },
};

/** Human labels for the customer JSON sections, for Recent Activity titles like "Survey updated". */
const CUSTOMER_SECTION_LABELS: Record<string, string> = {
  survey: "Survey",
  giMeasurements: "GI measurements",
  valvesRegulators: "Valves & regulators",
  fittingsAccessories: "Fittings & accessories",
  lmcPipelineWork: "LMC work",
  mdpeFittings: "MDPE fittings",
  commissioningConversion: "Commissioning/Conversion",
  billingCompletion: "Billing",
  progressMilestones: "Progress milestones",
  customFields: "Custom fields",
};

/**
 * Emits an operational activity event for a customer action. Runs alongside
 * (not instead of) auditService.log() - the two feeds serve different
 * consumers. Best-effort: activityService.record swallows its own errors.
 * A fresh random sourceId is used so repeated real edits are distinct rows.
 */
async function recordCustomerActivity(
  customer: { id: string; customerName: string; trBpNumber: string; projectId: string },
  input: { actorId: string; action: string; title: string; description: string; metadata?: Record<string, unknown> },
) {
  await activityService.record({
    type: "customer",
    action: input.action,
    actorId: input.actorId,
    customerId: customer.id,
    projectId: customer.projectId,
    entityType: "customer",
    entityId: customer.id,
    sourceType: "customer",
    sourceId: crypto.randomUUID(),
    title: input.title,
    description: input.description,
    metadata: input.metadata,
  });
}

async function getPlumberNameOrThrow(plumberId: string) {
  const db = getDb();
  const [plumber] = await db.select({ name: plumbers.name }).from(plumbers).where(eq(plumbers.id, plumberId)).limit(1);
  if (!plumber) throw new Error("Plumber not found");
  return plumber.name;
}

async function getCustomerOrThrow(id: string) {
  const db = getDb();
  const customer = await db.query.customers.findFirst({
    where: eq(customers.id, id),
    with: {
      lmcPipeRecords: true,
      documents: true,
      project: true,
      site: true,
    },
  });

  if (!customer) throw new Error("Customer not found");
  return customer;
}

async function buildCompletionAuditFor(customer: Parameters<typeof buildCustomerCompletionAudit>[0]) {
  const db = getDb();
  const userRows = await db.select({ id: users.id, name: users.name }).from(users);
  const userNames = new Map(userRows.map((u) => [u.id, u.name]));
  // Falls back to a readable label (never the raw UUID) once the user is hard-deleted - see safe-hard-delete brief §7.
  const resolveUserName = (userId: string | null | undefined) => (userId ? (userNames.get(userId) ?? "Deleted user") : null);
  return buildCustomerCompletionAudit(customer, resolveUserName);
}

export function getStatKeyCondition(statKey: string) {
  return customerStatCondition(statKey);
}

type CustomerScopeQuery = Pick<
  CustomerListQuery,
  "ids" | "projectId" | "siteId" | "status" | "city" | "search" | "statKey" | "month" | "year" | "columnFilters"
>;

/**
 * The full set of scope conditions shared by list(), filterOptions() and
 * listIds() - search/project/site/status/city/statKey plus every active
 * Excel column filter. Kept in one place so all three stay in sync; a filter
 * added to one but not the others is exactly the kind of silent page-local/
 * dataset-wide mismatch this batch exists to close.
 */
function buildCustomerScopeConditions(query: CustomerScopeQuery, options: { excludeColumnFilter?: CustomerFilterColumnKey } = {}) {
  const searchPattern = toSearchPattern(query.search);
  const idList = query.ids ? query.ids.split(",").map((id) => id.trim()).filter(Boolean) : undefined;
  const columnFilters = parseCustomerColumnFilters(query.columnFilters);

  return [
    idList && idList.length ? inArray(customers.id, idList) : undefined,
    query.projectId ? eq(customers.projectId, query.projectId) : undefined,
    query.siteId ? eq(customers.siteId, query.siteId) : undefined,
    query.status ? eq(customers.status, query.status) : undefined,
    query.city ? eq(customers.city, query.city) : undefined,
    searchPattern
      ? or(
          ilike(customers.customerName, searchPattern),
          ilike(customers.trBpNumber, searchPattern),
          ilike(customers.mobileNumber, searchPattern),
        )
      : undefined,
    query.statKey ? getStatKeyCondition(query.statKey) : undefined,
    query.statKey
      ? customerStatDateCondition(query.statKey, Number(query.month) || undefined, Number(query.year) || undefined)
      : undefined,
    ...buildCustomerColumnFilterConditions(columnFilters, options.excludeColumnFilter),
  ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));
}

// "Select all matching" IDs are capped at the same 10,000 ceiling the app
// already treats as "practically all customers" (parsePagination's
// maxLimit for limit=-1 elsewhere) - large enough for any real filtered
// view, small enough that returning ids (not full rows) never risks
// freezing the browser.
const SELECT_ALL_MATCHING_ID_CAP = 10000;

export const customersService = {
  async list(query: CustomerListQuery) {
    const db = getDb();
    const { page, limit, offset } = parsePagination(query, 10000);
    const conditions = buildCustomerScopeConditions(query);
    const where = conditions.length ? and(...conditions) : undefined;

    // Whitelisted sort - sortBy is a closed union at the type/schema level, so this
    // can never receive an arbitrary column name. Defaults to the original
    // (createdAt desc, id desc) behavior when no sort is requested.
    const sortColumnMap = {
      customerName: customers.customerName,
      trBpNumber: customers.trBpNumber,
      mobileNumber: customers.mobileNumber,
      createdAt: customers.createdAt,
    } as const;
    const requestedSortColumn = query.sortBy ? sortColumnMap[query.sortBy] : undefined;
    const sortDirection = query.sortOrder === "asc" ? asc : desc;

    const [rows, [{ value: total }], userRows] = await Promise.all([
      db.query.customers.findMany({
        where,
        limit,
        offset,
        orderBy: (fields, { desc: orderDesc }) =>
          requestedSortColumn
            ? [sortDirection(requestedSortColumn), orderDesc(fields.id)]
            : [orderDesc(fields.createdAt), orderDesc(fields.id)],
        with: {
          project: true,
          site: true,
          lmcPipeRecords: true,
          documents: true,
        },
      }),
      db.select({ value: count() }).from(customers).where(where),
      db.select({ id: users.id, name: users.name }).from(users),
    ]);

    const userNames = new Map(userRows.map((u) => [u.id, u.name]));
    // Falls back to a readable label (never the raw UUID) once the user is hard-deleted - see safe-hard-delete brief §7.
    const resolveUserName = (id: string | null | undefined) => (id ? (userNames.get(id) ?? "Deleted user") : null);
    const rowsWithCompletionAudit = rows.map((row) => ({
      ...row,
      completionAudit: buildCustomerCompletionAudit(row, resolveUserName),
    }));

    if (query.statKey === "complaint-customer" || query.statKey === "customer-resolved") {
      const ids = rowsWithCompletionAudit.map((row) => row.id);
      const complaintRows = ids.length
        ? await db
            .select({
              customerId: complaints.customerId,
              status: complaints.status,
              createdAt: complaints.createdAt,
              resolvedAt: complaints.resolvedAt,
              supervisorRemark: complaints.supervisorRemark,
            })
            .from(complaints)
            .where(inArray(complaints.customerId, ids))
            .orderBy(desc(complaints.createdAt))
        : [];
      const latestByCustomer = new Map<string, (typeof complaintRows)[number]>();
      for (const complaint of complaintRows) {
        if (!latestByCustomer.has(complaint.customerId)) latestByCustomer.set(complaint.customerId, complaint);
      }
      return {
        rows: rowsWithCompletionAudit.map((row) => ({ ...row, latestComplaint: latestByCustomer.get(row.id) ?? null })),
        pagination: buildPaginationMeta(page, limit, total),
      };
    }

    return { rows: rowsWithCompletionAudit, pagination: buildPaginationMeta(page, limit, total) };
  },

  /**
   * Distinct values for one Excel-style column filter dropdown, scoped by the
   * same search/project/site/status/city/statKey filters as list() plus every
   * OTHER currently-active column filter (excluding the target column's own
   * filter, so selecting a value never removes its sibling options). Capped at
   * 500 distinct values - a dropdown with more than that is already unusable
   * UX, and it protects against a free-text column (address, plumber name)
   * blowing up into an unbounded result set.
   */
  async filterOptions(query: CustomerFilterOptionsQuery) {
    if (!isCustomerFilterColumnKey(query.column)) {
      throw new Error(`Invalid filter column: ${query.column}`);
    }

    const db = getDb();
    const conditions = buildCustomerScopeConditions(query, { excludeColumnFilter: query.column });
    const where = conditions.length ? and(...conditions) : undefined;
    const columnExpr = CUSTOMER_FILTER_COLUMNS[query.column];

    const rows = await db
      .selectDistinct({ value: columnExpr })
      .from(customers)
      .where(where)
      .orderBy(columnExpr)
      .limit(500);

    return rows.map((row) => row.value).filter((value): value is string => Boolean(value && value.trim()));
  },

  /**
   * All customer IDs matching the current search/project/status/city/statKey
   * scope AND every active Excel column filter - powers "Select all matching"
   * without ever downloading full Customer objects. Capped at
   * SELECT_ALL_MATCHING_ID_CAP; `truncated` tells the caller when the real
   * matching set is bigger than what was returned, so the UI can say so
   * instead of silently acting as if it selected everything.
   */
  async listIds(query: CustomerListQuery) {
    const db = getDb();
    const conditions = buildCustomerScopeConditions(query);
    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select({ id: customers.id })
        .from(customers)
        .where(where)
        .orderBy(desc(customers.createdAt), desc(customers.id))
        .limit(SELECT_ALL_MATCHING_ID_CAP),
      db.select({ value: count() }).from(customers).where(where),
    ]);

    return {
      ids: rows.map((row) => row.id),
      total,
      truncated: total > SELECT_ALL_MATCHING_ID_CAP,
    };
  },

  async get(id: string) {
    const customer = await getCustomerOrThrow(id);
    return {
      ...customer,
      sectionCompletion: evaluateCustomerCompletion(customer, customer.lmcPipeRecords),
      completionAudit: await buildCompletionAuditFor(customer),
    };
  },

  async setSectionCompletion(
    id: string,
    sectionKey: string,
    completed: boolean,
    currentUser: AuthTokenPayload,
  ) {
    const isJsonSection = sectionKey in EXPLICIT_COMPLETION_SECTIONS;
    const isMilestone = sectionKey in PROGRESS_MILESTONE_SECTIONS;
    if (!isJsonSection && !isMilestone) {
      throw new Error("This section does not support explicit completion");
    }

    const db = getDb();
    const existing = await getCustomerOrThrow(id);

    if (!permissionService.canModifyCustomer(currentUser)) {
      throw new Error("Not authorized to update this customer");
    }

    if (!completed) {
      const guard = REOPEN_BLOCKED_BY_BILL[sectionKey];
      const billing = (existing.billingCompletion ?? {}) as Record<string, unknown>;
      if (guard && billing[guard.billField] === true) {
        throw new Error(`${guard.label} is already marked - correct the billing status before reopening this section.`);
      }
    }

    const completion = completed
      ? { completedAt: new Date().toISOString(), completedBy: currentUser.id }
      : null;

    const [customer] = await db
      .update(customers)
      .set(
        isJsonSection
          ? {
              [sectionKey]: {
                ...((existing[sectionKey as keyof typeof existing] as Record<string, unknown> | null) ?? {}),
                completion,
              },
              updatedBy: currentUser.id,
              updatedAt: new Date(),
            }
          : {
              progressMilestones: {
                ...(existing.progressMilestones ?? {}),
                [sectionKey as ProgressMilestoneKey]: completion,
              },
              updatedBy: currentUser.id,
              updatedAt: new Date(),
            },
      )
      .where(eq(customers.id, id))
      .returning();

    if (!customer) throw new Error("Unable to update section completion");

    await auditService.log({
      userId: currentUser.id,
      module: "Customers",
      action: completed ? "Marked Section Complete" : "Reopened Section",
      recordId: id,
      projectId: customer.projectId,
      description: `${completed ? "Completed" : "Reopened"} ${sectionKey} for ${customer.customerName}`,
    });

    await recordCustomerActivity(customer, {
      actorId: currentUser.id,
      action: completed ? "customer.section_completed" : "customer.section_reopened",
      title: completed ? "Section completed" : "Section reopened",
      description: `${completed ? "Completed" : "Reopened"} ${sectionKey} for ${customer.customerName}`,
      metadata: { section: sectionKey, completed },
    });

    const refreshed = await getCustomerOrThrow(id);
    return {
      ...refreshed,
      sectionCompletion: evaluateCustomerCompletion(refreshed, refreshed.lmcPipeRecords),
      completionAudit: await buildCompletionAuditFor(refreshed),
    };
  },

  async create(input: CreateCustomerBody, userId: string) {
    const db = getDb();
    const plumberName = await getPlumberNameOrThrow(input.plumberId);

    const jsonSections: Record<string, Record<string, unknown>> = {};
    for (const key of JSON_SECTION_KEYS) {
      const section = input[key];
      if (section) jsonSections[key] = section;
    }

    const [customer] = await db
      .insert(customers)
      .values({
        trBpNumber: input.trBpNumber,
        normalizedTrBpNumber: normalizeKey(input.trBpNumber),
        mobileNumber: input.mobileNumber,
        customerName: input.customerName,
        normalizedCustomerName: normalizeKey(input.customerName),
        fullAddress: input.fullAddress,
        city: input.city,
        connectionType: input.connectionType,
        houseType: input.houseType,
        scheme: input.scheme,
        plumberId: input.plumberId || null,
        plumberName,
        giReportNumber: input.giReportNumber || null,
        gcReportNumber: input.gcReportNumber || null,
        conversionReportNumber: input.conversionReportNumber || null,
        status: input.status ?? "active",
        projectId: input.projectId,
        siteId: input.siteId || null,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    if (!customer) throw new Error("Unable to create customer");

    await auditService.log({
      userId,
      module: "Customers",
      action: "Created Customer",
      recordId: customer.id,
      projectId: customer.projectId,
      description: `Created customer ${customer.customerName} (${customer.trBpNumber})`,
    });

    await recordCustomerActivity(customer, {
      actorId: userId,
      action: "customer.created",
      title: "Customer created",
      description: `Created customer ${customer.customerName} (${customer.trBpNumber})`,
    });

    return customer;
  },

  async update(id: string, input: UpdateCustomerBody, currentUser: AuthTokenPayload) {
    const userId = currentUser.id;
    const existing = await getCustomerOrThrow(id);

    if (!permissionService.canModifyCustomer(currentUser)) {
      throw new Error("Not authorized to update this customer");
    }

    const db = getDb();
    const plumberName = input.plumberId ? await getPlumberNameOrThrow(input.plumberId) : undefined;

    const patch = cleanObject({
      trBpNumber: input.trBpNumber,
      mobileNumber: input.mobileNumber,
      customerName: input.customerName,
      fullAddress: input.fullAddress,
      city: input.city,
      connectionType: input.connectionType,
      houseType: input.houseType,
      scheme: input.scheme,
      plumberId: input.plumberId,
      plumberName,
      giReportNumber: input.giReportNumber,
      gcReportNumber: input.gcReportNumber,
      conversionReportNumber: input.conversionReportNumber,
      status: input.status,
      projectId: input.projectId,
      siteId: input.siteId,
    });

    const jsonPatch: Record<string, Record<string, unknown>> = {};
    const workProgressInserts: any[] = [];

    for (const key of JSON_SECTION_KEYS) {
      const section = input[key] as Record<string, unknown> | undefined;
      if (section) {
        const oldSection = existing[key as keyof typeof existing] as Record<string, unknown> | null;
        const oldStatus = oldSection?.approvalStatus;
        const newStatus = section.approvalStatus;

        if (oldStatus === "approved" && !permissionService.canManage(currentUser)) {
          throw new Error(`Cannot modify ${key} because it is already approved. Contact an admin.`);
        }

        const isApprovalTransition =
          (newStatus === "approved" || newStatus === "rejected") && newStatus !== oldStatus;
        if (isApprovalTransition && !permissionService.canManage(currentUser)) {
          throw new Error(`Only admins can approve or reject ${key}`);
        }

        jsonPatch[key] = { ...oldSection, ...section };

        if (Object.prototype.hasOwnProperty.call(section, "completion")) {
          const incoming = (section as { completion?: unknown }).completion;
          if (incoming && typeof incoming === "object") {
            const completedAt = (incoming as { completedAt?: unknown }).completedAt;
            jsonPatch[key].completion = {
              completedAt: typeof completedAt === "string" && completedAt ? completedAt : new Date().toISOString(),
              completedBy: currentUser.id,
            };
          } else {
            jsonPatch[key].completion = null;
          }
        }

        if (newStatus && newStatus !== oldStatus) {
          let stage = null;
          if (key === "survey") stage = "survey";
          else if (key === "giMeasurements") stage = "plumbing_gi";
          else if (key === "lmcPipelineWork") stage = "workable";
          else if (key === "commissioningConversion") stage = "commissioning";
          else if (key === "billingCompletion") stage = "conversion";

          let workStatus = "pending";
          if (newStatus === "approved") workStatus = "completed";
          else if (newStatus === "rejected") workStatus = "sent_back";
          else if (newStatus === "on_hold") workStatus = "on_hold";
          else if (newStatus === "submitted") workStatus = "pending";

          if (stage) {
            workProgressInserts.push({
              customerId: id,
              supervisorId: currentUser.id,
              stage,
              status: workStatus,
              remarks: section.approvalComments || `Status updated to ${newStatus} via web dashboard`,
            });
          }
        }
      }
    }

    const billingPatch = jsonPatch.billingCompletion;
    if (billingPatch) {
      if (billingPatch.giBillDone === true) {
        const currentGi = (jsonPatch.giMeasurements ?? existing.giMeasurements ?? {}) as Record<string, unknown>;
        const currentCompletion = (currentGi.completion ?? {}) as { completedAt?: string | null };
        if (!currentCompletion.completedAt) {
          jsonPatch.giMeasurements = {
            ...currentGi,
            completion: { completedAt: new Date().toISOString(), completedBy: userId },
          };
        }
      }
      if (billingPatch.gcBillDone === true) {
        const currentMilestones = (jsonPatch.progressMilestones ?? existing.progressMilestones ?? {}) as Record<string, unknown>;
        const currentGc = (currentMilestones.gc ?? {}) as { completedAt?: string | null };
        if (!currentGc.completedAt) {
          jsonPatch.progressMilestones = {
            ...currentMilestones,
            gc: { completedAt: new Date().toISOString(), completedBy: userId },
          };
        }
      }
    }

    const [customer] = await db
      .update(customers)
      .set({
        ...patch,
        ...jsonPatch,
        ...(input.trBpNumber ? { normalizedTrBpNumber: normalizeKey(input.trBpNumber) } : {}),
        ...(input.customerName ? { normalizedCustomerName: normalizeKey(input.customerName) } : {}),
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(customers.id, id))
      .returning();

    if (!customer) throw new Error("Unable to update customer");

    if (workProgressInserts.length > 0) {
      await db.insert(workProgressUpdates).values(workProgressInserts);
    }

    await auditService.log({
      userId,
      module: "Customers",
      action: "Updated Customer",
      recordId: customer.id,
      projectId: customer.projectId,
      description: `Updated customer ${customer.customerName} (${customer.trBpNumber})`,
    });

    const changedSections = Object.keys(jsonPatch).filter((key) => CUSTOMER_SECTION_LABELS[key]);
    const singleSection = changedSections.length === 1 ? changedSections[0] : undefined;
    await recordCustomerActivity(customer, {
      actorId: userId,
      action: singleSection ? `customer.${singleSection}_updated` : "customer.updated",
      title: singleSection ? `${CUSTOMER_SECTION_LABELS[singleSection]} updated` : "Customer details updated",
      description: singleSection
        ? `${CUSTOMER_SECTION_LABELS[singleSection]} updated for ${customer.customerName} (${customer.trBpNumber})`
        : `Updated customer ${customer.customerName} (${customer.trBpNumber})`,
      metadata: changedSections.length ? { sections: changedSections } : undefined,
    });

    return customer;
  },

  async createWithPipeRecords(input: CreateCustomerBody, pipeRecords: LmcPipeRecordInput[], userId: string) {
    const db = getDb();
    const plumberName = await getPlumberNameOrThrow(input.plumberId);

    const customer = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(customers)
        .values({
          trBpNumber: input.trBpNumber,
          normalizedTrBpNumber: normalizeKey(input.trBpNumber),
          mobileNumber: input.mobileNumber,
          customerName: input.customerName,
          normalizedCustomerName: normalizeKey(input.customerName),
          fullAddress: input.fullAddress,
          city: input.city,
          connectionType: input.connectionType,
          houseType: input.houseType,
          scheme: input.scheme,
          plumberId: input.plumberId || null,
          plumberName,
          giReportNumber: input.giReportNumber || null,
          gcReportNumber: input.gcReportNumber || null,
          conversionReportNumber: input.conversionReportNumber || null,
          status: input.status ?? "active",
          projectId: input.projectId,
          siteId: input.siteId || null,
          createdBy: userId,
          updatedBy: userId,
        })
        .returning();

      if (!created) throw new Error("Unable to create customer");

      for (const record of pipeRecords) {
        const values = {
          customerId: created.id,
          pipeSize: record.pipeSize,
          lengthMetres: record.lengthMetres != null ? String(record.lengthMetres) : null,
          layingDate: record.layingDate ? new Date(record.layingDate) : null,
          testingDate: record.testingDate ? new Date(record.testingDate) : null,
          purgingDate: record.purgingDate ? new Date(record.purgingDate) : null,
          layingStatus: record.layingStatus ?? "not_started",
          testingStatus: record.testingStatus ?? "not_started",
          purgingStatus: record.purgingStatus ?? "not_started",
          jointFittingDetails: record.jointFittingDetails || null,
          remarks: record.remarks || null,
          evidence: record.evidence,
          updatedBy: userId,
          updatedAt: new Date(),
        };

        await tx
          .insert(customerLmcPipeRecords)
          .values(values)
          .onConflictDoUpdate({
            target: [customerLmcPipeRecords.customerId, customerLmcPipeRecords.pipeSize],
            set: values,
          });
      }

      return created;
    });

    await auditService.log({
      userId,
      module: "Customers",
      action: "Created Customer",
      recordId: customer.id,
      projectId: customer.projectId,
      description: `Created customer ${customer.customerName} (${customer.trBpNumber})`,
    });

    await recordCustomerActivity(customer, {
      actorId: userId,
      action: "customer.created",
      title: "Customer created",
      description: `Created customer ${customer.customerName} (${customer.trBpNumber})`,
    });

    return customer;
  },

  async updateWithPipeRecords(
    id: string,
    input: UpdateCustomerBody,
    pipeRecords: LmcPipeRecordInput[],
    currentUser: AuthTokenPayload,
  ) {
    const userId = currentUser.id;
    const existing = await getCustomerOrThrow(id);

    if (!permissionService.canModifyCustomer(currentUser)) {
      throw new Error("Not authorized to update this customer");
    }

    const db = getDb();
    const plumberName = input.plumberId ? await getPlumberNameOrThrow(input.plumberId) : undefined;

    const patch = cleanObject({
      trBpNumber: input.trBpNumber,
      mobileNumber: input.mobileNumber,
      customerName: input.customerName,
      fullAddress: input.fullAddress,
      city: input.city,
      connectionType: input.connectionType,
      houseType: input.houseType,
      scheme: input.scheme,
      plumberId: input.plumberId,
      plumberName,
      giReportNumber: input.giReportNumber,
      gcReportNumber: input.gcReportNumber,
      conversionReportNumber: input.conversionReportNumber,
      status: input.status,
      projectId: input.projectId,
      siteId: input.siteId,
    });

    const jsonPatch: Record<string, Record<string, unknown>> = {};
    const workProgressInserts: any[] = [];

    for (const key of JSON_SECTION_KEYS) {
      const section = input[key] as Record<string, unknown> | undefined;
      if (section) {
        const oldSection = existing[key as keyof typeof existing] as Record<string, unknown> | null;
        const oldStatus = oldSection?.approvalStatus;
        const newStatus = section.approvalStatus;

        if (oldStatus === "approved" && !permissionService.canManage(currentUser)) {
          throw new Error(`Cannot modify ${key} because it is already approved. Contact an admin.`);
        }

        const isApprovalTransition =
          (newStatus === "approved" || newStatus === "rejected") && newStatus !== oldStatus;
        if (isApprovalTransition && !permissionService.canManage(currentUser)) {
          throw new Error(`Only admins can approve or reject ${key}`);
        }

        jsonPatch[key] = { ...oldSection, ...section };

        if (Object.prototype.hasOwnProperty.call(section, "completion")) {
          const incoming = (section as { completion?: unknown }).completion;
          if (incoming && typeof incoming === "object") {
            const completedAt = (incoming as { completedAt?: unknown }).completedAt;
            jsonPatch[key].completion = {
              completedAt: typeof completedAt === "string" && completedAt ? completedAt : new Date().toISOString(),
              completedBy: currentUser.id,
            };
          } else {
            jsonPatch[key].completion = null;
          }
        }

        if (newStatus && newStatus !== oldStatus) {
          let stage = null;
          if (key === "survey") stage = "survey";
          else if (key === "giMeasurements") stage = "plumbing_gi";
          else if (key === "lmcPipelineWork") stage = "workable";
          else if (key === "commissioningConversion") stage = "commissioning";
          else if (key === "billingCompletion") stage = "conversion";

          let workStatus = "pending";
          if (newStatus === "approved") workStatus = "completed";
          else if (newStatus === "rejected") workStatus = "sent_back";
          else if (newStatus === "on_hold") workStatus = "on_hold";
          else if (newStatus === "submitted") workStatus = "pending";

          if (stage) {
            workProgressInserts.push({
              customerId: id,
              supervisorId: currentUser.id,
              stage,
              status: workStatus,
              remarks: section.approvalComments || `Status updated to ${newStatus} via web dashboard`,
            });
          }
        }
      }
    }

    const billingPatch = jsonPatch.billingCompletion;
    if (billingPatch) {
      if (billingPatch.giBillDone === true) {
        const currentGi = (jsonPatch.giMeasurements ?? existing.giMeasurements ?? {}) as Record<string, unknown>;
        const currentCompletion = (currentGi.completion ?? {}) as { completedAt?: string | null };
        if (!currentCompletion.completedAt) {
          jsonPatch.giMeasurements = {
            ...currentGi,
            completion: { completedAt: new Date().toISOString(), completedBy: userId },
          };
        }
      }
      if (billingPatch.gcBillDone === true) {
        const currentMilestones = (jsonPatch.progressMilestones ?? existing.progressMilestones ?? {}) as Record<string, unknown>;
        const currentGc = (currentMilestones.gc ?? {}) as { completedAt?: string | null };
        if (!currentGc.completedAt) {
          jsonPatch.progressMilestones = {
            ...currentMilestones,
            gc: { completedAt: new Date().toISOString(), completedBy: userId },
          };
        }
      }
    }

    const customer = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(customers)
        .set({
          ...patch,
          ...jsonPatch,
          ...(input.trBpNumber ? { normalizedTrBpNumber: normalizeKey(input.trBpNumber) } : {}),
          ...(input.customerName ? { normalizedCustomerName: normalizeKey(input.customerName) } : {}),
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(customers.id, id))
        .returning();

      if (!updated) throw new Error("Unable to update customer");

      if (workProgressInserts.length > 0) {
        await tx.insert(workProgressUpdates).values(workProgressInserts);
      }

      for (const record of pipeRecords) {
        const values = {
          customerId: id,
          pipeSize: record.pipeSize,
          lengthMetres: record.lengthMetres != null ? String(record.lengthMetres) : null,
          layingDate: record.layingDate ? new Date(record.layingDate) : null,
          testingDate: record.testingDate ? new Date(record.testingDate) : null,
          purgingDate: record.purgingDate ? new Date(record.purgingDate) : null,
          layingStatus: record.layingStatus ?? "not_started",
          testingStatus: record.testingStatus ?? "not_started",
          purgingStatus: record.purgingStatus ?? "not_started",
          jointFittingDetails: record.jointFittingDetails || null,
          remarks: record.remarks || null,
          evidence: record.evidence,
          updatedBy: userId,
          updatedAt: new Date(),
        };

        await tx
          .insert(customerLmcPipeRecords)
          .values(values)
          .onConflictDoUpdate({
            target: [customerLmcPipeRecords.customerId, customerLmcPipeRecords.pipeSize],
            set: values,
          });
      }

      return updated;
    });

    await auditService.log({
      userId,
      module: "Customers",
      action: "Updated Customer",
      recordId: customer.id,
      projectId: customer.projectId,
      description: `Updated customer ${customer.customerName} (${customer.trBpNumber})`,
    });

    await recordCustomerActivity(customer, {
      actorId: userId,
      action: "customer.updated",
      title: "Customer details updated",
      description: `Updated customer ${customer.customerName} (${customer.trBpNumber})`,
    });

    return customer;
  },

  async delete(id: string, userId: string) {
    return customersDeletionService.execute(id, userId);
  },

  async listLmcPipeRecords(customerId: string) {
    await getCustomerOrThrow(customerId);
    const db = getDb();
    return db
      .select()
      .from(customerLmcPipeRecords)
      .where(eq(customerLmcPipeRecords.customerId, customerId))
      .orderBy(customerLmcPipeRecords.pipeSize);
  },

  async upsertLmcPipeRecord(customerId: string, input: UpsertLmcPipeRecordBody, currentUser: AuthTokenPayload) {
    const customer = await getCustomerOrThrow(customerId);
    if (!permissionService.canModifyCustomer(currentUser)) {
      throw new Error("Not authorized to update this customer");
    }

    const db = getDb();

    const values = {
      customerId,
      pipeSize: input.pipeSize,
      lengthMetres: input.lengthMetres != null ? String(input.lengthMetres) : null,
      layingDate: input.layingDate ? new Date(input.layingDate) : null,
      testingDate: input.testingDate ? new Date(input.testingDate) : null,
      purgingDate: input.purgingDate ? new Date(input.purgingDate) : null,
      layingStatus: input.layingStatus ?? "not_started",
      testingStatus: input.testingStatus ?? "not_started",
      purgingStatus: input.purgingStatus ?? "not_started",
      jointFittingDetails: input.jointFittingDetails || null,
      remarks: input.remarks || null,
      evidence: input.evidence,
      updatedBy: currentUser.id,
      updatedAt: new Date(),
    };

    const [record] = await db
      .insert(customerLmcPipeRecords)
      .values(values)
      .onConflictDoUpdate({
        target: [customerLmcPipeRecords.customerId, customerLmcPipeRecords.pipeSize],
        set: values,
      })
      .returning();

    if (!record) throw new Error("Unable to save LMC pipe record");
    return record;
  },

  async listDocuments(customerId: string) {
    await getCustomerOrThrow(customerId);
    const db = getDb();
    return db
      .select()
      .from(customerDocuments)
      .where(eq(customerDocuments.customerId, customerId))
      .orderBy(customerDocuments.uploadedAt);
  },

  async createDocument(customerId: string, input: ResolvedCustomerDocumentInput, currentUser: AuthTokenPayload) {
    const customer = await getCustomerOrThrow(customerId);
    if (!permissionService.canModifyCustomer(currentUser)) {
      throw new Error("Not authorized to update this customer");
    }

    const db = getDb();
    // Immutable uploader snapshot (safe-hard-delete brief §5) - survives a hard-deleted uploader.
    const [uploader] = await db.select({ name: users.name }).from(users).where(eq(users.id, currentUser.id)).limit(1);

    const [document] = await db
      .insert(customerDocuments)
      .values({
        customerId,
        projectId: customer.projectId,
        siteId: customer.siteId,
        documentType: input.documentType,
        category: input.category || null,
        referenceNumber: input.referenceNumber || null,
        issueDate: input.issueDate ? new Date(input.issueDate) : null,
        expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
        amount: input.amount?.toString(),
        fileUrl: input.fileUrl,
        fileName: input.fileName,
        mimeType: input.mimeType || null,
        status: input.status ?? "submitted",
        remarks: input.remarks || null,
        uploadedBy: currentUser.id,
        uploadedByName: uploader?.name ?? null,
      })
      .returning();

    if (!document) throw new Error("Unable to create customer document");
    return document;
  },

  async deleteDocument(customerId: string, documentId: string) {
    await getCustomerOrThrow(customerId);
    const db = getDb();

    const [document] = await db
      .select({ id: customerDocuments.id })
      .from(customerDocuments)
      .where(and(eq(customerDocuments.id, documentId), eq(customerDocuments.customerId, customerId)))
      .limit(1);

    if (!document) throw new Error("Customer document not found");
    await db.delete(customerDocuments).where(eq(customerDocuments.id, documentId));
  },

  async listNotes(customerId: string) {
    await getCustomerOrThrow(customerId);
    const db = getDb();
    return db.query.customerNotes.findMany({
      where: eq(customerNotes.customerId, customerId),
      with: { author: { columns: { id: true, name: true } } },
      orderBy: desc(customerNotes.createdAt),
    });
  },

  async createNote(customerId: string, input: CreateCustomerNoteBody, currentUser: AuthTokenPayload) {
    const customer = await getCustomerOrThrow(customerId);
    if (!permissionService.canModifyCustomer(currentUser)) {
      throw new Error("Not authorized to update this customer");
    }

    const db = getDb();
    // Immutable author snapshot (safe-hard-delete brief §5) - survives a hard-deleted author.
    const [author] = await db.select({ name: users.name }).from(users).where(eq(users.id, currentUser.id)).limit(1);

    const [note] = await db
      .insert(customerNotes)
      .values({
        customerId,
        authorId: currentUser.id,
        authorName: author?.name ?? null,
        note: input.note,
      })
      .returning();

    if (!note) throw new Error("Unable to create customer note");
    return note;
  },
};
