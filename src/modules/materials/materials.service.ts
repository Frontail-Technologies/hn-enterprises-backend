import { and, count, eq, gte, ilike, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "@db";
import { customers, materialTransactions, materials, projectSites, users } from "@db/schema";
import { normalizeKey } from "@modules/master-import/master-import.mapper";
import { auditService } from "@services";
import {
  buildPaginationMeta,
  cleanObject,
  parsePagination,
  toSearchPattern,
} from "@utils";
import { materialsDeletionService } from "./materials-deletion.service";
import type {
  AdjustmentDirection,
  CorrectMaterialTransactionBody,
  CreateMaterialBody,
  CreateMaterialTransactionBody,
  MaterialListQuery,
  MaterialSource,
  MaterialTransactionListQuery,
  MaterialTransactionType,
  PlumberBalanceQuery,
  StockBalanceQuery,
  UpdateMaterialBody,
} from "./materials.types";

// Only these move material into/out of STORE custody. `consumption`/`pbg_consumption`
// draw down a plumber's already-issued balance, not the store - the pre-existing bug
// this fixes was reducing store stock a second time on every consumption, on top of
// the reduction already made when the material was issued to the plumber.
const STORE_AFFECTING_TYPES = new Set<MaterialTransactionType>(["purchase", "pbg_issue", "issue", "return"]);

// Source is implied by `type` for receipts and PBG-attributed consumption; every other
// type can move either source's stock, so the caller must say which.
const IMPLIED_SOURCE: Partial<Record<MaterialTransactionType, MaterialSource>> = {
  purchase: "purchase",
  pbg_issue: "pbg",
  pbg_consumption: "pbg",
  consumption: "purchase",
};
const SOURCE_REQUIRED_TYPES = new Set<MaterialTransactionType>(["issue", "return", "adjustment"]);

function resolveSource(type: MaterialTransactionType, input: MaterialSource | undefined): MaterialSource | null {
  const implied = IMPLIED_SOURCE[type];
  if (implied) return implied;
  if (SOURCE_REQUIRED_TYPES.has(type)) {
    if (!input) throw new Error(`Material source (purchase or pbg) is required for a ${type} transaction`);
    return input;
  }
  return input ?? null;
}

// "unassigned" is the sentinel for "Central / Unassigned" (projectId IS NULL) used by
// every project filter in the Inventory module - a real project's UUID filters to that
// project, and omitting the param means "all projects".
function projectFilterCondition(projectId: string | undefined) {
  if (!projectId) return undefined;
  return projectId === "unassigned" ? isNull(materialTransactions.projectId) : eq(materialTransactions.projectId, projectId);
}

function buildTransactionListWhere(query: MaterialTransactionListQuery) {
  const conditions = [
    query.materialId ? eq(materialTransactions.materialId, query.materialId) : undefined,
    query.type ? eq(materialTransactions.type, query.type) : undefined,
    query.plumberId ? eq(materialTransactions.plumberId, query.plumberId) : undefined,
    query.source ? eq(materialTransactions.source, query.source) : undefined,
    query.siteId ? eq(materialTransactions.siteId, query.siteId) : undefined,
    query.customerId ? eq(materialTransactions.customerId, query.customerId) : undefined,
    projectFilterCondition(query.projectId),
    query.from ? gte(materialTransactions.transactionDate, new Date(query.from)) : undefined,
    query.to ? lte(materialTransactions.transactionDate, new Date(query.to)) : undefined,
  ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

  return conditions.length ? and(...conditions) : undefined;
}

// Correct/Reverse (§7) needs each row to know whether it's already been superseded,
// without mutating the original row - derived here by checking who points back at
// it (via relatedTransactionId), rather than stored on the row itself. Deliberately
// unfiltered by the caller's own query conditions: a correction that also moved
// project/source must still be found so the *old* scope correctly shows the
// original as superseded even though the replacement no longer matches that scope.
async function computeSupersedeMap(db: ReturnType<typeof getDb>, ids: string[]) {
  const supersedeMap = new Map<string, { isReversed: boolean; isCorrected: boolean }>();
  if (!ids.length) return supersedeMap;

  const links = await db
    .select({
      relatedTransactionId: materialTransactions.relatedTransactionId,
      linkType: materialTransactions.linkType,
    })
    .from(materialTransactions)
    .where(inArray(materialTransactions.relatedTransactionId, ids));

  for (const link of links) {
    if (!link.relatedTransactionId) continue;
    const entry = supersedeMap.get(link.relatedTransactionId) ?? { isReversed: false, isCorrected: false };
    if (link.linkType === "reversal") entry.isReversed = true;
    if (link.linkType === "correction") entry.isCorrected = true;
    supersedeMap.set(link.relatedTransactionId, entry);
  }

  return supersedeMap;
}

// Exported so the Stock Sheet export reuses this instead of a second copy of the
// low/out-of-stock thresholds - status is always the material's true global standing,
// never recomputed against a project/source-filtered balance (see stockBalances()).
export function computeStockStatus(balance: number, reorderLevel: number) {
  return balance <= 0 ? "out_of_stock" : balance <= reorderLevel ? "low_stock" : "active";
}

function withStatus<T extends { currentBalance: string; reorderLevel: string }>(
  material: T,
) {
  const status = computeStockStatus(Number(material.currentBalance), Number(material.reorderLevel));
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

function computeQuantityDelta(
  type: MaterialTransactionType,
  quantity: number,
  direction: AdjustmentDirection | undefined,
) {
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
      // Direction is required (validated by the caller) - a balance correction with an
      // assumed sign is exactly the kind of silent, unauditable change §9 rules out.
      return direction === "out" ? -quantity : quantity;
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

  // Delegates to the Delete Impact architecture (materials-deletion.service.ts):
  // re-checks inside the same transaction as the delete, blocks whenever any
  // ledger transaction references this material (never cascade/detach - the
  // append-only ledger is never touched to make a catalog-item delete succeed).
  async delete(id: string, userId: string) {
    return materialsDeletionService.execute(id, userId);
  },

  async listTransactions(query: MaterialTransactionListQuery) {
    const db = getDb();
    const { page, limit, offset } = parsePagination(query);
    const where = buildTransactionListWhere(query);

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

    const supersedeMap = await computeSupersedeMap(db, rows.map((row) => row.id));
    const enrichedRows = rows.map((row) => ({
      ...row,
      isReversed: supersedeMap.get(row.id)?.isReversed ?? false,
      isCorrected: supersedeMap.get(row.id)?.isCorrected ?? false,
    }));

    return { rows: enrichedRows, pagination: buildPaginationMeta(page, limit, total) };
  },

  // The current business truth of the ledger, for operational exports/registers
  // (Purchase Register, PBG Issue, Store Issue Book, Consumption Log): the complete
  // matching set (no pagination - callers need every row, not one page), with
  // reversal bookkeeping rows dropped entirely and any row that's since been
  // reversed or corrected dropped in favor of its replacement. A corrected 100->120
  // purchase yields exactly one row here (120); a purely reversed transaction yields
  // none. Full ledger history (including reversal/correction rows and superseded
  // originals) remains fully intact and queryable via listTransactions - this method
  // only changes what's *selected*, never what's stored.
  async listEffectiveTransactions(query: MaterialTransactionListQuery) {
    const db = getDb();
    const where = buildTransactionListWhere(query);

    const rows = await db
      .select()
      .from(materialTransactions)
      .where(where)
      .orderBy(materialTransactions.transactionDate);

    const supersedeMap = await computeSupersedeMap(db, rows.map((row) => row.id));

    return rows.filter((row) => {
      if (row.linkType === "reversal") return false;
      const info = supersedeMap.get(row.id);
      if (info?.isReversed || info?.isCorrected) return false;
      return true;
    });
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

      if (input.type === "adjustment" && !input.direction) {
        throw new Error("Adjustment direction (in or out) is required");
      }

      const source = resolveSource(input.type, input.source);

      let projectId = input.projectId ?? null;
      if (!projectId && input.siteId) {
        const [site] = await tx
          .select({ projectId: projectSites.projectId })
          .from(projectSites)
          .where(eq(projectSites.id, input.siteId))
          .limit(1);
        projectId = site?.projectId ?? null;
      }
      if (!projectId && input.customerId) {
        const [customer] = await tx
          .select({ projectId: customers.projectId })
          .from(customers)
          .where(eq(customers.id, input.customerId))
          .limit(1);
        projectId = customer?.projectId ?? null;
      }

      const quantityDelta = computeQuantityDelta(input.type, input.quantity, input.direction);

      const [transaction] = await tx
        .insert(materialTransactions)
        .values({
          materialId: input.materialId,
          type: input.type,
          quantity: String(input.quantity),
          quantityDelta: String(quantityDelta),
          source,
          projectId,
          referenceNo: input.referenceNo || null,
          vendorName: input.vendorName || null,
          rate: input.rate != null ? String(input.rate) : null,
          billAmount:
            input.billAmount != null ? String(input.billAmount) : null,
          plumberId: input.plumberId || null,
          supervisorId: input.supervisorId || null,
          supervisorName: supervisorName || null,
          siteId: input.siteId || null,
          address: input.address || null,
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

      // Store custody only moves on receipts and issue/return - consumption (from
      // either source) and plumber-balance adjustments never touch it (§5).
      if (!STORE_AFFECTING_TYPES.has(input.type)) return transaction;

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
      query.source ? eq(materialTransactions.source, query.source) : undefined,
      projectFilterCondition(query.projectId),
    ].filter((condition): condition is NonNullable<typeof condition> =>
      Boolean(condition),
    );

    const rows = await db
      .select({
        plumberId: materialTransactions.plumberId,
        materialId: materialTransactions.materialId,
        type: materialTransactions.type,
        quantity: materialTransactions.quantity,
        quantityDelta: materialTransactions.quantityDelta,
        source: materialTransactions.source,
        projectId: materialTransactions.projectId,
      })
      .from(materialTransactions)
      .where(and(...conditions));

    const grouped = new Map<
      string,
      {
        plumberId: string;
        materialId: string;
        source: MaterialSource | null;
        projectId: string | null;
        issued: number;
        consumed: number;
        returned: number;
        adjusted: number;
      }
    >();

    for (const row of rows) {
      if (!row.plumberId) continue;
      // Balance is scoped per source and per project: the same plumber can hold both
      // PBG and purchased stock of the same material, on different projects, and
      // those must never net against each other (§6).
      const key = `${row.plumberId}:${row.materialId}:${row.source ?? "unspecified"}:${row.projectId ?? "none"}`;
      const entry = grouped.get(key) ?? {
        plumberId: row.plumberId,
        materialId: row.materialId,
        source: row.source,
        projectId: row.projectId,
        issued: 0,
        consumed: 0,
        returned: 0,
        adjusted: 0,
      };
      const quantity = Number(row.quantity);
      if (row.type === "issue") entry.issued += quantity;
      if (row.type === "consumption" || row.type === "pbg_consumption") entry.consumed += quantity;
      if (row.type === "return") entry.returned += quantity;
      if (row.type === "adjustment") entry.adjusted += Number(row.quantityDelta);
      grouped.set(key, entry);
    }

    return Array.from(grouped.values()).map((entry) => ({
      ...entry,
      balance: entry.issued - entry.consumed - entry.returned + entry.adjusted,
    }));
  },

  // Store-custody balance, filtered by project and/or source (§3): the sum of
  // quantityDelta across STORE_AFFECTING_TYPES rows is exactly
  // `purchase + pbg_issue - issue + return` since those are the only types whose delta
  // is ever added to store custody - no separate formula needed. `projectId:
  // "unassigned"` is the sentinel for "Central / Unassigned" (projectId IS NULL);
  // omitting projectId/source means "all projects" / "all sources".
  async stockBalances(query: StockBalanceQuery) {
    const db = getDb();
    const conditions = [
      inArray(materialTransactions.type, Array.from(STORE_AFFECTING_TYPES)),
      query.materialId ? eq(materialTransactions.materialId, query.materialId) : undefined,
      query.source ? eq(materialTransactions.source, query.source) : undefined,
      projectFilterCondition(query.projectId),
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

    const rows = await db
      .select({
        materialId: materialTransactions.materialId,
        balance: sql<string>`coalesce(sum(${materialTransactions.quantityDelta}), 0)`,
      })
      .from(materialTransactions)
      .where(and(...conditions))
      .groupBy(materialTransactions.materialId);

    return rows.map((row) => ({ materialId: row.materialId, balance: Number(row.balance) }));
  },

  // Reverse: appends a same-type row with quantity/quantityDelta negated (bypassing
  // computeQuantityDelta) so it cancels the original in both the store-balance update
  // and plumberBalances() aggregation without either needing to change. Never mutates
  // or deletes the original (§7).
  async reverseTransaction(id: string, reason: string, userId: string) {
    if (!reason?.trim()) throw new Error("A reversal reason is required");
    const db = getDb();

    return db.transaction(async (tx) => {
      const [original] = await tx
        .select()
        .from(materialTransactions)
        .where(eq(materialTransactions.id, id))
        .limit(1);
      if (!original) throw new Error("Transaction not found");

      const [existingLink] = await tx
        .select({ id: materialTransactions.id })
        .from(materialTransactions)
        .where(eq(materialTransactions.relatedTransactionId, id))
        .limit(1);
      if (existingLink) throw new Error("This transaction has already been reversed or corrected");

      const negatedQuantity = -Number(original.quantity);
      const negatedDelta = -Number(original.quantityDelta);

      const [reversal] = await tx
        .insert(materialTransactions)
        .values({
          materialId: original.materialId,
          type: original.type,
          quantity: String(negatedQuantity),
          quantityDelta: String(negatedDelta),
          source: original.source,
          projectId: original.projectId,
          referenceNo: original.referenceNo,
          vendorName: original.vendorName,
          rate: original.rate,
          billAmount: original.billAmount,
          plumberId: original.plumberId,
          supervisorId: original.supervisorId,
          supervisorName: original.supervisorName,
          siteId: original.siteId,
          address: original.address,
          storeLabel: original.storeLabel,
          customerId: original.customerId,
          paymentId: original.paymentId,
          reportNo: original.reportNo,
          condition: original.condition,
          adjustmentType: original.adjustmentType,
          vehicleNo: original.vehicleNo,
          vehicleQty: original.vehicleQty,
          transactionDate: new Date(),
          evidence: null,
          remarks: original.remarks,
          relatedTransactionId: original.id,
          linkType: "reversal",
          correctionReason: reason,
          createdBy: userId,
        })
        .returning();
      if (!reversal) throw new Error("Unable to record reversal");

      if (STORE_AFFECTING_TYPES.has(original.type)) {
        await tx
          .update(materials)
          .set({ currentBalance: sql`${materials.currentBalance} + ${negatedDelta}`, updatedAt: new Date() })
          .where(eq(materials.id, original.materialId));
      }

      await auditService.log({
        userId,
        module: "Inventory",
        action: "Reversed Transaction",
        recordId: original.id,
        description: `Reversed ${original.type} transaction: ${reason}`,
      });

      return reversal;
    });
  },

  // Correct: atomically reverses the original's effect (identical mechanics to
  // reverseTransaction), then inserts a replacement row where every field falls back
  // to the original's value unless the caller supplied a change. Both new rows link
  // back to the original via relatedTransactionId; the original is never touched.
  async correctTransaction(id: string, input: CorrectMaterialTransactionBody, userId: string) {
    if (!input.correctionReason?.trim()) throw new Error("A correction reason is required");
    const db = getDb();

    return db.transaction(async (tx) => {
      const [original] = await tx
        .select()
        .from(materialTransactions)
        .where(eq(materialTransactions.id, id))
        .limit(1);
      if (!original) throw new Error("Transaction not found");

      const [existingLink] = await tx
        .select({ id: materialTransactions.id })
        .from(materialTransactions)
        .where(eq(materialTransactions.relatedTransactionId, id))
        .limit(1);
      if (existingLink) throw new Error("This transaction has already been reversed or corrected");

      const negatedQuantity = -Number(original.quantity);
      const negatedDelta = -Number(original.quantityDelta);

      const [reversal] = await tx
        .insert(materialTransactions)
        .values({
          materialId: original.materialId,
          type: original.type,
          quantity: String(negatedQuantity),
          quantityDelta: String(negatedDelta),
          source: original.source,
          projectId: original.projectId,
          referenceNo: original.referenceNo,
          vendorName: original.vendorName,
          rate: original.rate,
          billAmount: original.billAmount,
          plumberId: original.plumberId,
          supervisorId: original.supervisorId,
          supervisorName: original.supervisorName,
          siteId: original.siteId,
          address: original.address,
          storeLabel: original.storeLabel,
          customerId: original.customerId,
          paymentId: original.paymentId,
          reportNo: original.reportNo,
          condition: original.condition,
          adjustmentType: original.adjustmentType,
          vehicleNo: original.vehicleNo,
          vehicleQty: original.vehicleQty,
          transactionDate: new Date(),
          evidence: null,
          remarks: `Reversal for correction: ${input.correctionReason}`,
          relatedTransactionId: original.id,
          linkType: "reversal",
          correctionReason: input.correctionReason,
          createdBy: userId,
        })
        .returning();
      if (!reversal) throw new Error("Unable to record reversal");

      if (STORE_AFFECTING_TYPES.has(original.type)) {
        await tx
          .update(materials)
          .set({ currentBalance: sql`${materials.currentBalance} + ${negatedDelta}`, updatedAt: new Date() })
          .where(eq(materials.id, original.materialId));
      }

      const type = original.type;

      let supervisorName = original.supervisorName;
      if (input.supervisorId && input.supervisorId !== original.supervisorId) {
        const [supervisor] = await tx
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, input.supervisorId))
          .limit(1);
        if (!supervisor) throw new Error("Supervisor not found");
        supervisorName = supervisor.name;
      }

      const source = input.source !== undefined ? resolveSource(type, input.source) : original.source;

      let projectId = input.projectId !== undefined ? input.projectId || null : original.projectId;
      if (input.projectId === undefined && input.siteId) {
        const [site] = await tx
          .select({ projectId: projectSites.projectId })
          .from(projectSites)
          .where(eq(projectSites.id, input.siteId))
          .limit(1);
        projectId = site?.projectId ?? projectId;
      }
      if (input.projectId === undefined && !input.siteId && input.customerId) {
        const [customer] = await tx
          .select({ projectId: customers.projectId })
          .from(customers)
          .where(eq(customers.id, input.customerId))
          .limit(1);
        projectId = customer?.projectId ?? projectId;
      }

      const quantity = input.quantity ?? Number(original.quantity);
      const direction = input.direction ?? (Number(original.quantityDelta) < 0 ? "out" : "in");
      const quantityDelta = computeQuantityDelta(type, quantity, direction);

      const [corrected] = await tx
        .insert(materialTransactions)
        .values({
          materialId: original.materialId,
          type,
          quantity: String(quantity),
          quantityDelta: String(quantityDelta),
          source,
          projectId,
          referenceNo: input.referenceNo ?? original.referenceNo,
          vendorName: input.vendorName ?? original.vendorName,
          rate: input.rate != null ? String(input.rate) : original.rate,
          billAmount: input.billAmount != null ? String(input.billAmount) : original.billAmount,
          plumberId: input.plumberId ?? original.plumberId,
          supervisorId: input.supervisorId ?? original.supervisorId,
          supervisorName,
          siteId: input.siteId ?? original.siteId,
          address: input.address ?? original.address,
          storeLabel: input.storeLabel ?? original.storeLabel,
          customerId: input.customerId ?? original.customerId,
          paymentId: original.paymentId,
          reportNo: input.reportNo ?? original.reportNo,
          condition: input.condition ?? original.condition,
          adjustmentType: input.adjustmentType ?? original.adjustmentType,
          vehicleNo: input.vehicleNo ?? original.vehicleNo,
          vehicleQty: input.vehicleQty != null ? String(input.vehicleQty) : original.vehicleQty,
          transactionDate: input.transactionDate ? new Date(input.transactionDate) : original.transactionDate,
          evidence: original.evidence,
          remarks: input.remarks ?? original.remarks,
          relatedTransactionId: original.id,
          linkType: "correction",
          correctionReason: input.correctionReason,
          createdBy: userId,
        })
        .returning();
      if (!corrected) throw new Error("Unable to record correction");

      if (STORE_AFFECTING_TYPES.has(type)) {
        await tx
          .update(materials)
          .set({ currentBalance: sql`${materials.currentBalance} + ${quantityDelta}`, updatedAt: new Date() })
          .where(eq(materials.id, original.materialId));
      }

      await auditService.log({
        userId,
        module: "Inventory",
        action: "Corrected Transaction",
        recordId: original.id,
        description: `Corrected ${type} transaction: ${input.correctionReason}`,
      });

      return { reversal, corrected };
    });
  },
};
