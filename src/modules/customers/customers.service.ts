import { and, count, eq, ilike, or } from "drizzle-orm";
import { getDb } from "@db";
import { customerDocuments, customerLmcPipeRecords, customers } from "@db/schema";
import { normalizeKey } from "@modules/master-import/master-import.mapper";
import { buildPaginationMeta, cleanObject, parsePagination, toSearchPattern } from "@utils";
import type {
  CreateCustomerBody,
  CreateCustomerDocumentBody,
  CustomerJsonSections,
  CustomerListQuery,
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

async function getCustomerOrThrow(id: string) {
  const db = getDb();
  const customer = await db.query.customers.findFirst({
    where: eq(customers.id, id),
    with: {
      lmcPipeRecords: true,
      documents: true,
    },
  });

  if (!customer) throw new Error("Customer not found");
  return customer;
}

export const customersService = {
  async list(query: CustomerListQuery) {
    const db = getDb();
    const { page, limit, offset } = parsePagination(query);
    const searchPattern = toSearchPattern(query.search);

    const conditions = [
      query.projectId ? eq(customers.projectId, query.projectId) : undefined,
      query.siteId ? eq(customers.siteId, query.siteId) : undefined,
      query.status ? eq(customers.status, query.status) : undefined,
      searchPattern
        ? or(
            ilike(customers.customerName, searchPattern),
            ilike(customers.trBpNumber, searchPattern),
            ilike(customers.mobileNumber, searchPattern),
          )
        : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, [{ value: total }]] = await Promise.all([
      db.query.customers.findMany({
        where,
        limit,
        offset,
        orderBy: (fields, { desc }) => [desc(fields.createdAt)],
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
    const [customer] = await db
      .insert(customers)
      .values({
        projectId: input.projectId,
        siteId: input.siteId,
        trBpNumber: input.trBpNumber,
        normalizedTrBpNumber: normalizeKey(input.trBpNumber),
        mobileNumber: input.mobileNumber || null,
        customerName: input.customerName,
        normalizedCustomerName: normalizeKey(input.customerName),
        fullAddress: input.fullAddress || null,
        city: input.city || null,
        connectionType: input.connectionType || null,
        houseType: input.houseType || null,
        scheme: input.scheme || null,
        plumberName: input.plumberName || null,
        supervisorName: input.supervisorName || null,
        giReportNumber: input.giReportNumber || null,
        gcReportNumber: input.gcReportNumber || null,
        conversionReportNumber: input.conversionReportNumber || null,
        status: input.status ?? "active",
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    if (!customer) throw new Error("Unable to create customer");
    return customer;
  },

  async update(id: string, input: UpdateCustomerBody, userId: string) {
    const existing = await getCustomerOrThrow(id);
    const db = getDb();

    const patch = cleanObject({
      trBpNumber: input.trBpNumber,
      mobileNumber: input.mobileNumber,
      customerName: input.customerName,
      fullAddress: input.fullAddress,
      city: input.city,
      connectionType: input.connectionType,
      houseType: input.houseType,
      scheme: input.scheme,
      plumberName: input.plumberName,
      supervisorName: input.supervisorName,
      giReportNumber: input.giReportNumber,
      gcReportNumber: input.gcReportNumber,
      conversionReportNumber: input.conversionReportNumber,
      status: input.status,
      projectId: input.projectId,
      siteId: input.siteId,
    });

    const jsonPatch: Record<string, Record<string, unknown>> = {};
    for (const key of JSON_SECTION_KEYS) {
      const section = input[key];
      if (section) {
        jsonPatch[key] = { ...(existing[key] as Record<string, unknown> | null), ...section };
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
    return customer;
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

  async createDocument(customerId: string, input: CreateCustomerDocumentBody, userId: string) {
    const customer = await getCustomerOrThrow(customerId);
    const db = getDb();

    const [document] = await db
      .insert(customerDocuments)
      .values({
        customerId,
        projectId: customer.projectId,
        siteId: customer.siteId,
        documentType: input.documentType,
        referenceNumber: input.referenceNumber || null,
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
};
