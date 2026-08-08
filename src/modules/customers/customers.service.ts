import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { getDb } from "@db";
import { customerDocuments, customerLmcPipeRecords, customerNotes, customers, plumbers, users, workProgressUpdates } from "@db/schema";
import { normalizeKey } from "@modules/master-import/master-import.mapper";
import { buildPaginationMeta, cleanObject, parsePagination, toSearchPattern } from "@utils";
import { auditService, permissionService } from "@services";
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

function getStatKeyCondition(statKey: string) {
  switch (statKey) {
    case "survey-done": return sql`survey->>'surveyDate' IS NOT NULL`;
    case "gi-done": return sql`commissioning_conversion->>'installationDate' IS NOT NULL`;
    case "gc-done": return sql`commissioning_conversion->>'commissioningDate' IS NOT NULL OR commissioning_conversion->>'meterNo' IS NOT NULL`;
    case "conversion-done": return sql`commissioning_conversion->>'conversionDate' IS NOT NULL`;
    case "jmr-done": return sql`billing_completion->>'jmrDone' = 'true'`;
    case "gi-bill-done": return sql`billing_completion->>'giBillDone' = 'true'`;
    case "gc-bill-done": return sql`billing_completion->>'gcBillDone' = 'true'`;
    case "conversion-bill-done": return sql`billing_completion->>'conversionBillDone' = 'true'`;
    case "total-pbg-assignment": return sql`billing_completion->>'jmrSubmittedInPbg' = 'true'`;
    case "connection-remark": return sql`(status = 'on_hold' OR survey->>'approvalStatus' IN ('Sent Back', 'Rejected') OR EXISTS (SELECT 1 FROM customer_lmc_pipe_records WHERE customer_id = customers.id AND laying_status = 'on_hold'))`;
    default: return undefined;
  }
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
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, [{ value: total }]] = await Promise.all([
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
        },
      }),
      db.select({ value: count() }).from(customers).where(where),
    ]);

    return { rows, pagination: buildPaginationMeta(page, limit, total) };
  },

  async get(id: string) {
    return getCustomerOrThrow(id);
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

    return customer;
  },

  async delete(id: string, userId: string) {
    const db = getDb();
    const existing = await getCustomerOrThrow(id);

    try {
      await db.delete(customers).where(eq(customers.id, id));
      await auditService.log({
        userId,
        module: "Customers",
        action: "Deleted Customer",
        recordId: id,
        description: `Deleted customer ${existing.customerName} (${existing.trBpNumber})`,
      });
    } catch (error: any) {
      if (error.code === "23503") {
        throw new Error("Cannot delete this customer because they have associated records (e.g. bills or payments). Please delete them first.");
      }
      throw error;
    }
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
