import { and, count, eq, gte, ilike, isNotNull, lte, sql } from "drizzle-orm";
import { getDb } from "@db";
import { materialTransactions, materials, users } from "@db/schema";
import { normalizeKey } from "@modules/master-import/master-import.mapper";
import { auditService } from "@services";
import {
  buildPaginationMeta,
  cleanObject,
  parsePagination,
  toSearchPattern,
} from "@utils";
import type {
  CreateMaterialBody,
  CreateMaterialTransactionBody,
  MaterialListQuery,
  MaterialTransactionListQuery,
  MaterialTransactionType,
  PlumberBalanceQuery,
  UpdateMaterialBody,
} from "./materials.types";

function withStatus<T extends { currentBalance: string; reorderLevel: string }>(
  material: T,
) {
  const balance = Number(material.currentBalance);
  const reorder = Number(material.reorderLevel);
  const status =
    balance <= 0 ? "out_of_stock" : balance <= reorder ? "low_stock" : "active";
  return { ...material, status };
}

async function getMaterialOrThrow(id: string) {
  const db = getDb();
  const [material] = await db
    .select()
    .from(materials)
    .where(eq(materials.id, id))
    .limit(1);
  if (!material) throw new Error("Material not found");
  return material;
}

function computeQuantityDelta(type: MaterialTransactionType, quantity: number) {
  switch (type) {
    case "purchase":
    case "pbg_issue":
    case "return":
      return quantity;
    case "pbg_consumption":
    case "issue":
    case "consumption":
      return -quantity;
    case "adjustment":
      return quantity;
    default:
      return quantity;
  }
}

export const materialsService = {
  async list(query: MaterialListQuery) {
    const db = getDb();
    const { page, limit, offset } = parsePagination(query);
    const searchPattern = toSearchPattern(query.search);
    const conditions = [
      query.category ? eq(materials.category, query.category) : undefined,
      searchPattern ? ilike(materials.name, searchPattern) : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> =>
      Boolean(condition),
    );
    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select()
        .from(materials)
        .where(where)
        .limit(limit)
        .offset(offset)
        .orderBy(materials.name),
      db.select({ value: count() }).from(materials).where(where),
    ]);

    return {
      rows: rows.map(withStatus),
      pagination: buildPaginationMeta(page, limit, total),
    };
  },

  async get(id: string) {
    const material = await getMaterialOrThrow(id);
    return withStatus(material);
  },

  async create(input: CreateMaterialBody, userId: string) {
    const db = getDb();
    const [material] = await db
      .insert(materials)
      .values({
        name: input.name,
        normalizedName: normalizeKey(input.name),
        category: input.category || null,
        unit: input.unit,
        reorderLevel: String(input.reorderLevel ?? 0),
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    if (!material) throw new Error("Unable to create material");

    await auditService.log({
      userId,
      module: "Inventory",
      action: "Created Material",
      recordId: material.id,
      description: `Created material ${material.name}`,
    });

    return withStatus(material);
  },

  async update(id: string, input: UpdateMaterialBody, userId: string) {
    await getMaterialOrThrow(id);
    const db = getDb();

    const patch = cleanObject({
      name: input.name,
      category: input.category,
      unit: input.unit,
      reorderLevel:
        input.reorderLevel != null ? String(input.reorderLevel) : undefined,
    });

    const [material] = await db
      .update(materials)
      .set({
        ...patch,
        ...(input.name ? { normalizedName: normalizeKey(input.name) } : {}),
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(materials.id, id))
      .returning();

    if (!material) throw new Error("Unable to update material");
    return withStatus(material);
  },

  async delete(id: string, userId: string) {
    const db = getDb();
    const existing = await getMaterialOrThrow(id);

    try {
      await db.delete(materials).where(eq(materials.id, id));
      await auditService.log({
        userId,
        module: "Inventory",
        action: "Deleted Material",
        recordId: id,
        description: `Deleted material ${existing.name}`,
      });
    } catch (error: any) {
      if (error.code === "23503") {
        throw new Error(
          "Cannot delete this material because it has associated transactions. Please delete them first.",
        );
      }
      throw error;
    }
  },

  async listTransactions(query: MaterialTransactionListQuery) {
    const db = getDb();
    const { page, limit, offset } = parsePagination(query);
    const conditions = [
      query.materialId
        ? eq(materialTransactions.materialId, query.materialId)
        : undefined,
      query.type ? eq(materialTransactions.type, query.type) : undefined,
      query.plumberId
        ? eq(materialTransactions.plumberId, query.plumberId)
        : undefined,
      query.siteId ? eq(materialTransactions.siteId, query.siteId) : undefined,
      query.customerId
        ? eq(materialTransactions.customerId, query.customerId)
        : undefined,
      query.from
        ? gte(materialTransactions.transactionDate, new Date(query.from))
        : undefined,
      query.to
        ? lte(materialTransactions.transactionDate, new Date(query.to))
        : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> =>
      Boolean(condition),
    );
    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select()
        .from(materialTransactions)
        .where(where)
        .limit(limit)
        .offset(offset)
        .orderBy(materialTransactions.transactionDate),
      db.select({ value: count() }).from(materialTransactions).where(where),
    ]);

    return { rows, pagination: buildPaginationMeta(page, limit, total) };
  },

  async createTransaction(
    input: CreateMaterialTransactionBody,
    userId: string,
  ) {
    const db = getDb();

    return db.transaction(async (tx) => {
      const [material] = await tx
        .select()
        .from(materials)
        .where(eq(materials.id, input.materialId))
        .limit(1);
      if (!material) throw new Error("Material not found");

      let supervisorName: string | undefined;
      if (input.supervisorId) {
        const [supervisor] = await tx
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, input.supervisorId))
          .limit(1);
        if (!supervisor) throw new Error("Supervisor not found");
        supervisorName = supervisor.name;
      }

      const quantityDelta = computeQuantityDelta(input.type, input.quantity);

      const [transaction] = await tx
        .insert(materialTransactions)
        .values({
          materialId: input.materialId,
          type: input.type,
          quantity: String(input.quantity),
          quantityDelta: String(quantityDelta),
          referenceNo: input.referenceNo || null,
          vendorName: input.vendorName || null,
          rate: input.rate != null ? String(input.rate) : null,
          billAmount:
            input.billAmount != null ? String(input.billAmount) : null,
          plumberId: input.plumberId || null,
          supervisorId: input.supervisorId || null,
          supervisorName: supervisorName || null,
          siteId: input.siteId || null,
          storeLabel: input.storeLabel || null,
          customerId: input.customerId || null,
          paymentId: input.paymentId || null,
          reportNo: input.reportNo || null,
          condition: input.condition || null,
          adjustmentType: input.adjustmentType || null,
          vehicleNo: input.vehicleNo || null,
          vehicleQty:
            input.vehicleQty != null ? String(input.vehicleQty) : null,
          transactionDate: new Date(input.transactionDate),
          evidence: input.evidence,
          remarks: input.remarks || null,
          createdBy: userId,
        })
        .returning();

      if (!transaction) throw new Error("Unable to record transaction");

      await tx
        .update(materials)
        .set({
          currentBalance: sql`${materials.currentBalance} + ${quantityDelta}`,
          updatedAt: new Date(),
        })
        .where(eq(materials.id, input.materialId));

      return transaction;
    });
  },

  async plumberBalances(query: PlumberBalanceQuery) {
    const db = getDb();
    const conditions = [
      isNotNull(materialTransactions.plumberId),
      query.plumberId
        ? eq(materialTransactions.plumberId, query.plumberId)
        : undefined,
      query.materialId
        ? eq(materialTransactions.materialId, query.materialId)
        : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> =>
      Boolean(condition),
    );

    const rows = await db
      .select({
        plumberId: materialTransactions.plumberId,
        materialId: materialTransactions.materialId,
        type: materialTransactions.type,
        quantity: materialTransactions.quantity,
      })
      .from(materialTransactions)
      .where(and(...conditions));

    const grouped = new Map<
      string,
      {
        plumberId: string;
        materialId: string;
        issued: number;
        consumed: number;
        returned: number;
      }
    >();

    for (const row of rows) {
      if (!row.plumberId) continue;
      const key = `${row.plumberId}:${row.materialId}`;
      const entry = grouped.get(key) ?? {
        plumberId: row.plumberId,
        materialId: row.materialId,
        issued: 0,
        consumed: 0,
        returned: 0,
      };
      const quantity = Number(row.quantity);
      if (row.type === "issue") entry.issued += quantity;
      if (row.type === "consumption") entry.consumed += quantity;
      if (row.type === "return") entry.returned += quantity;
      grouped.set(key, entry);
    }

    return Array.from(grouped.values()).map((entry) => ({
      ...entry,
      balance: entry.issued - entry.consumed - entry.returned,
    }));
  },
};
