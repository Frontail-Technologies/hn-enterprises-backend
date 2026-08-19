import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { getDb } from "@db";
import { complaints, customerDocuments, customerLmcPipeRecords, customerNotes, customers, plumbers, users, workProgressUpdates } from "@db/schema";
import { normalizeKey } from "@modules/master-import/master-import.mapper";
import { buildPaginationMeta, cleanObject, parsePagination, toSearchPattern } from "@utils";
import { auditService, permissionService } from "@services";
import {
  buildCustomerCompletionAudit,
  customerStatCondition,
  customerStatDateCondition,
  evaluateCustomerCompletion,
  PROGRESS_MILESTONE_KEYS,
  type ProgressMilestoneKey,
} from "./customer-completion";
import { customersDeletionService } from "./customers-deletion.service";
import type { AuthTokenPayload } from "@types";
import type {
  CreateCustomerBody,
  CreateCustomerNoteBody,
  CustomerJsonSections,
  CustomerListQuery,
  ResolvedCustomerDocumentInput,
  UpdateCustomerBody,
  UpsertLmcPipeRecordBody,
} from "./customers.types";

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

// Only these jsonb sections carry an explicit completion marker; the completion
// endpoint refuses any other key so arbitrary customer JSON can't be targeted.
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

// Sections whose bill is "Done" reopening must block: work can finish before
// billing, but a completed bill must never be silently contradicted by
// reopening the underlying work. Correct the billing flag first.
const REOPEN_BLOCKED_BY_BILL: Partial<Record<string, { billField: string; label: string }>> = {
  giMeasurements: { billField: "giBillDone", label: "GI Bill Done" },
  gc: { billField: "gcBillDone", label: "GC Bill Done" },
};

async function getPlumberNameOrThrow(plumberId: string) {
  const db = getDb();
  const [plumber] = await db.select({ name: plumbers.name }).from(plumbers).where(eq(plumbers.id, plumberId)).limit(1);
  if (!plumber) throw new Error("Plumber not found");
  return plumber.name;
}

async function getUserNameOrThrow(userId: string) {
  const db = getDb();
  const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("Supervisor not found");
  return user.name;
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

// Same resolver list() uses (§ shared column config) - so the single-customer
// detail view's Completed On/By never disagrees with the Web master sheet or
// Excel export.
async function buildCompletionAuditFor(customer: Parameters<typeof buildCustomerCompletionAudit>[0]) {
  const db = getDb();
  const userRows = await db.select({ id: users.id, name: users.name }).from(users);
  const userNames = new Map(userRows.map((u) => [u.id, u.name]));
  const resolveUserName = (userId: string | null | undefined) => (userId ? (userNames.get(userId) ?? userId) : null);
  return buildCustomerCompletionAudit(customer, resolveUserName);
}

// Single source of truth lives in customer-completion.ts; this stays as the
// list-query entry point but no longer defines its own copy of the conditions.
export function getStatKeyCondition(statKey: string) {
  return customerStatCondition(statKey);
}

export const customersService = {
  async list(query: CustomerListQuery) {
    const db = getDb();
    const { page, limit, offset } = parsePagination(query, 10000);
    const searchPattern = toSearchPattern(query.search);

    const conditions = [
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
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, [{ value: total }], userRows] = await Promise.all([
      db.query.customers.findMany({
        where,
        limit,
        offset,
        // createdAt alone isn't unique - rows bulk-inserted in one statement
        // (e.g. via import) share an identical timestamp, and Postgres doesn't
        // guarantee stable ordering among ties across separate LIMIT/OFFSET
        // queries. That let the same customer reappear (or get skipped) across
        // pages during pagination. id is unique, so it makes the sort stable.
        orderBy: (fields, { desc }) => [desc(fields.createdAt), desc(fields.id)],
        with: {
          project: true,
          site: true,
          // Needed for the master-sheet/Excel-export columns that read per-size
          // LMC pipe dates and the KYC-verified flag (§ shared column config) -
          // both previously only available via the single-customer `get()`.
          lmcPipeRecords: true,
          documents: true,
        },
      }),
      db.select({ value: count() }).from(customers).where(where),
      db.select({ id: users.id, name: users.name }).from(users),
    ]);

    // Resolves each section's completedBy user id to a display name using the
    // SAME helper the Excel export uses (§ shared column config) - so the
    // Completion Audit columns can never disagree between Web and Excel.
    const userNames = new Map(userRows.map((u) => [u.id, u.name]));
    const resolveUserName = (id: string | null | undefined) => (id ? (userNames.get(id) ?? id) : null);
    const rowsWithCompletionAudit = rows.map((row) => ({
      ...row,
      completionAudit: buildCustomerCompletionAudit(row, resolveUserName),
    }));

    // Complaint drill-down columns (Complaint Status/Date, Resolved Date) need
    // real complaint rows, not just the customer record - only fetched for the
    // two complaint-based stats so the plain customer list/master table never
    // pays for this join.
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
    const supervisorName = input.supervisorId ? await getUserNameOrThrow(input.supervisorId) : undefined;

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
        supervisorId: input.supervisorId || null,
        supervisorName,
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

    return customer;
  },

  async update(id: string, input: UpdateCustomerBody, currentUser: AuthTokenPayload) {
    const userId = currentUser.id;
    const existing = await getCustomerOrThrow(id);
    const db = getDb();
    const plumberName = input.plumberId ? await getPlumberNameOrThrow(input.plumberId) : undefined;
    const supervisorName = input.supervisorId ? await getUserNameOrThrow(input.supervisorId) : undefined;

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
      supervisorId: input.supervisorId,
      supervisorName,
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

        // Section-completion marker is server-authoritative: a normal save omits
        // `completion` (shallow-merge above keeps the existing marker), Mark
        // Complete sends a completion object (we stamp completedBy from the auth
        // user), and Reopen sends `completion: null` to clear it.
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

        // Generate work progress update if status changed
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

    // Billing -> completion synchronization: a bill marked Done always implies
    // the corresponding work is complete, even if nobody separately hit "Mark
    // Complete". Never runs in reverse (marking work complete never touches a
    // bill flag) - see customer-completion.ts's gi-done/gc-done conditions for
    // the read-time OR that backs this up for write paths other than this one.
    // Only fires "not already complete" (never overwrites an earlier real
    // completedAt), and stamps the actual acting user, never a fabricated one.
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

    return customer;
  },

  // Delegates to the Delete Impact architecture (customers-deletion.service.ts):
  // re-checks dependencies inside the same transaction as the delete, blocks on
  // financial records (bills, payments), and cascades the customer's own
  // documents/notes/LMC records/complaints/work-progress along with it.
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

  async upsertLmcPipeRecord(customerId: string, input: UpsertLmcPipeRecordBody, userId: string) {
    await getCustomerOrThrow(customerId);
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
      updatedBy: userId,
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

  async createDocument(customerId: string, input: ResolvedCustomerDocumentInput, userId: string) {
    const customer = await getCustomerOrThrow(customerId);
    const db = getDb();

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
        uploadedBy: userId,
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

  async createNote(customerId: string, input: CreateCustomerNoteBody, userId: string) {
    await getCustomerOrThrow(customerId);
    const db = getDb();

    const [note] = await db
      .insert(customerNotes)
      .values({
        customerId,
        authorId: userId,
        note: input.note,
      })
      .returning();

    if (!note) throw new Error("Unable to create customer note");
    return note;
  },
};
