import { and, count, countDistinct, eq, getTableColumns, gte, ilike, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "@db";
import { customers, materialTransactions, materials, plumbers, projects, projectSites, users } from "@db/schema";
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
  InventoryOverview,
  InventoryOverviewQuery,
  MaterialListQuery,
  MaterialSource,
  MaterialTransactionListQuery,
  MaterialTransactionType,
  PlumberBalanceQuery,
  StockBalanceQuery,
  UpdateMaterialBody,
} from "./materials.types";

const STORE_AFFECTING_TYPES = new Set<MaterialTransactionType>(["purchase", "pbg_issue", "issue", "return"]);

/**
 * Domain grouping for the InventoryDetail tabs/stat cards - mirrors the
 * frontend's filterPurchases/filterStoreIssues/filterConsumption/
 * filterReturns exactly (inventory-detail.mapper.ts), so the overview
 * summary and the tab-scoped transaction lists always agree with each
 * other. Not a rename of the underlying transaction types.
 */
const RECEIVED_TYPES: MaterialTransactionType[] = ["purchase", "pbg_issue"];
const ISSUED_TYPES: MaterialTransactionType[] = ["issue"];
const CONSUMED_TYPES: MaterialTransactionType[] = ["consumption", "pbg_consumption"];
const RETURNED_TYPES: MaterialTransactionType[] = ["return"];

const INVENTORY_DETAIL_TAB_TYPES: Record<string, MaterialTransactionType[] | undefined> = {
  purchase: RECEIVED_TYPES,
  storeIssue: ISSUED_TYPES,
  consumption: CONSUMED_TYPES,
  transactions: undefined, // "All" / Transaction History - unfiltered by type
};

/**
 * InventoryPage's OWN 8 tabs - a different grouping from InventoryDetail's
 * (e.g. "purchase" here is the single `purchase` type only, NOT combined
 * with pbg_issue like InventoryDetail's "purchase" tab). Mirrors
 * InventoryPage.tsx's existing TAB_TO_TRANSACTION_TYPE exactly.
 */
const INVENTORY_PAGE_CONSUMPTION_LOG_TYPES: MaterialTransactionType[] = ["consumption", "pbg_consumption"];

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

function projectFilterCondition(projectId: string | undefined) {
  if (!projectId) return undefined;
  return projectId === "unassigned" ? isNull(materialTransactions.projectId) : eq(materialTransactions.projectId, projectId);
}

function buildTransactionListWhere(query: MaterialTransactionListQuery) {
  const conditions = [
    query.materialId ? eq(materialTransactions.materialId, query.materialId) : undefined,
    // `types` (plural) scopes to a SET of domain types in one request - e.g.
    // the Purchase tab is "purchase" + "pbg_issue" together. Additive to the
    // existing singular `type` filter so callers that only ever use `type`
    // (InventoryPage today) are unaffected.
    query.types?.length ? inArray(materialTransactions.type, query.types) : undefined,
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

  /**
   * Single initial request for InventoryDetail (R7): material + all 5 stat
   * totals computed with conditional SUM over the material's full
   * transaction history, so the numbers stay correct no matter how many
   * transactions exist (the old client-side reduce() over a 200-row-capped
   * fetch silently under-counted once a material passed 200 transactions).
   */
  async getOverview(id: string) {
    const material = await getMaterialOrThrow(id);
    const db = getDb();

    const sumWhenTypeIn = (types: MaterialTransactionType[]) =>
      sql<string>`coalesce(sum(case when ${inArray(materialTransactions.type, types)} then ${materialTransactions.quantity} else 0 end), 0)`;

    const [totals] = await db
      .select({
        receivedQty: sumWhenTypeIn(RECEIVED_TYPES),
        issuedQty: sumWhenTypeIn(ISSUED_TYPES),
        consumedQty: sumWhenTypeIn(CONSUMED_TYPES),
        returnedQty: sumWhenTypeIn(RETURNED_TYPES),
      })
      .from(materialTransactions)
      .where(eq(materialTransactions.materialId, id));

    // Reuses the existing, already-correct plumber-balance aggregation
    // rather than re-deriving that grouping logic in raw SQL here.
    const plumberBalanceRows = await materialsService.plumberBalances({ materialId: id });

    return {
      material: withStatus(material),
      summary: {
        availableQty: Number(material.currentBalance),
        receivedQty: Number(totals?.receivedQty ?? 0),
        issuedQty: Number(totals?.issuedQty ?? 0),
        consumedQty: Number(totals?.consumedQty ?? 0),
        returnedQty: Number(totals?.returnedQty ?? 0),
        plumberBalanceCount: plumberBalanceRows.length,
      },
    };
  },

  /**
   * Tab-scoped transaction fetch for InventoryDetail (R3): the tab ids here
   * match InventoryDetailPage's own DetailTab union exactly. "plumberLedger"
   * is deliberately not handled - that tab uses plumberBalances(), not this.
   */
  async listTransactionsForDetailTab(id: string, tab: string, query: MaterialTransactionListQuery) {
    const types = INVENTORY_DETAIL_TAB_TYPES[tab];
    return materialsService.listTransactions({ ...query, materialId: id, types, type: undefined });
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
    return materialsDeletionService.execute(id, userId);
  },

  async listTransactions(query: MaterialTransactionListQuery) {
    const db = getDb();
    const { page, limit, offset } = parsePagination(query);
    const where = buildTransactionListWhere(query);

    // Relational display labels are joined once here, server-side, so no
    // consumer needs to load the full plumbers/projects/customers/materials
    // lists just to resolve an id -> name for these rows. materialName
    // matters for InventoryPage's transaction tabs, which span multiple
    // materials (InventoryDetail already knows its one material directly).
    const selection = {
      ...getTableColumns(materialTransactions),
      plumberName: plumbers.name,
      projectName: projects.name,
      customerName: customers.customerName,
      materialName: materials.name,
    };

    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select(selection)
        .from(materialTransactions)
        .leftJoin(plumbers, eq(materialTransactions.plumberId, plumbers.id))
        .leftJoin(projects, eq(materialTransactions.projectId, projects.id))
        .leftJoin(customers, eq(materialTransactions.customerId, customers.id))
        .leftJoin(materials, eq(materialTransactions.materialId, materials.id))
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

    const balances = Array.from(grouped.values()).map((entry) => ({
      ...entry,
      balance: entry.issued - entry.consumed - entry.returned + entry.adjusted,
    }));

    // Join plumber/project/material names once, in batched lookups, rather
    // than requiring the caller to load the entire plumbers/projects/
    // materials lists to resolve them (InventoryPage's Plumber Balance tab
    // isn't scoped to one material, so it needs materialName too).
    const plumberIds = Array.from(new Set(balances.map((row) => row.plumberId)));
    const projectIds = Array.from(
      new Set(balances.map((row) => row.projectId).filter((id): id is string => Boolean(id))),
    );
    const materialIds = Array.from(new Set(balances.map((row) => row.materialId)));

    const [plumberRows, projectRows, materialRows] = await Promise.all([
      plumberIds.length
        ? db.select({ id: plumbers.id, name: plumbers.name }).from(plumbers).where(inArray(plumbers.id, plumberIds))
        : Promise.resolve([]),
      projectIds.length
        ? db.select({ id: projects.id, name: projects.name }).from(projects).where(inArray(projects.id, projectIds))
        : Promise.resolve([]),
      materialIds.length
        ? db.select({ id: materials.id, name: materials.name }).from(materials).where(inArray(materials.id, materialIds))
        : Promise.resolve([]),
    ]);
    const plumberNameById = new Map(plumberRows.map((row) => [row.id, row.name]));
    const projectNameById = new Map(projectRows.map((row) => [row.id, row.name]));
    const materialNameById = new Map(materialRows.map((row) => [row.id, row.name]));

    return balances.map((row) => ({
      ...row,
      plumberName: plumberNameById.get(row.plumberId) ?? "",
      projectName: row.projectId ? (projectNameById.get(row.projectId) ?? "") : "",
      materialName: materialNameById.get(row.materialId) ?? "",
    }));
  },

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

  /**
   * InventoryPage's "Total Issue" tab (R11) - one row PER MATERIAL, not a
   * transaction list, so it's computed with GROUP BY + SUM/COUNT/MAX
   * server-side rather than loading every "issue" transaction and the full
   * materials list to group/join them client-side. Sort matches the old
   * client-side totalIssueRows() exactly (highest issued qty first).
   */
  async totalIssueSummary(query: InventoryOverviewQuery) {
    const db = getDb();
    const where = buildTransactionListWhere({ ...query, types: ISSUED_TYPES });

    const rows = await db
      .select({
        materialId: materialTransactions.materialId,
        materialName: materials.name,
        unit: materials.unit,
        totalIssued: sql<string>`coalesce(sum(${materialTransactions.quantity}), 0)`,
        transactionCount: count(),
        lastIssueDate: sql<string>`max(${materialTransactions.transactionDate})`,
      })
      .from(materialTransactions)
      .innerJoin(materials, eq(materialTransactions.materialId, materials.id))
      .where(where)
      .groupBy(materialTransactions.materialId, materials.name, materials.unit)
      .orderBy(sql`sum(${materialTransactions.quantity}) desc`);

    return rows.map((row) => ({
      materialId: row.materialId,
      materialName: row.materialName,
      unit: row.unit,
      totalIssued: Number(row.totalIssued),
      transactionCount: row.transactionCount,
      lastIssueDate: row.lastIssueDate,
    }));
  },

  /**
   * ProjectDetail → Materials tab "Materials Used on This Project" summary -
   * one row PER MATERIAL for the whole project (issued/consumed/returned),
   * computed with GROUP BY + conditional SUM server-side. Replaces folding a
   * capped transaction page client-side, which produced wrong totals once a
   * project had more than ~100 movements.
   */
  async projectUsageSummary(projectId: string) {
    const db = getDb();
    const sumWhen = (types: MaterialTransactionType[]) =>
      sql<string>`coalesce(sum(case when ${inArray(materialTransactions.type, types)} then ${materialTransactions.quantity} else 0 end), 0)`;

    const rows = await db
      .select({
        materialId: materialTransactions.materialId,
        materialName: materials.name,
        unit: materials.unit,
        issued: sumWhen(["issue", "pbg_issue"]),
        consumed: sumWhen(["consumption", "pbg_consumption"]),
        returned: sumWhen(["return"]),
      })
      .from(materialTransactions)
      .innerJoin(materials, eq(materialTransactions.materialId, materials.id))
      .where(projectFilterCondition(projectId))
      .groupBy(materialTransactions.materialId, materials.name, materials.unit)
      .orderBy(materials.name);

    return rows.map((row) => ({
      id: row.materialId,
      materialId: row.materialId,
      name: row.materialName,
      unit: row.unit,
      issued: Number(row.issued),
      consumed: Number(row.consumed),
      returned: Number(row.returned),
    }));
  },

  /**
   * InventoryPage's tab-count badges (R3) - DB COUNT/GROUP BY per domain
   * type, honoring the same source/project/plumber/date filters the tab
   * grids themselves use, so a badge never disagrees with what's on
   * screen. Never returns the underlying transaction rows.
   */
  async getInventoryOverview(query: InventoryOverviewQuery): Promise<InventoryOverview> {
    const db = getDb();

    // Only the storeIssue/plumberConsumption/plumberBalance tabs ever
    // filtered by plumberId in the original per-tab queries - purchase/
    // pbgIssue/pbgConsumption/totalIssue never took a plumberId param, so
    // their counts must not silently start reflecting it just because the
    // overview computes everything in one request.
    const { plumberId, ...queryWithoutPlumber } = query;
    const countByTypes = (types: MaterialTransactionType[], includePlumberFilter: boolean) => {
      const where = buildTransactionListWhere({
        ...(includePlumberFilter ? query : queryWithoutPlumber),
        types,
      });
      return db.select({ value: count() }).from(materialTransactions).where(where);
    };

    const [
      [{ value: stockCount }],
      [{ value: purchaseCount }],
      [{ value: pbgIssueCount }],
      [{ value: pbgConsumptionCount }],
      [{ value: storeIssueCount }],
      [{ value: totalIssueCount }],
      [{ value: plumberConsumptionCount }],
      plumberBalanceRows,
    ] = await Promise.all([
      db.select({ value: count() }).from(materials),
      countByTypes(["purchase"], false),
      countByTypes(["pbg_issue"], false),
      countByTypes(["pbg_consumption"], false),
      countByTypes(["issue"], true),
      // "Total Issue" is one row PER MATERIAL (grouped), not a raw
      // transaction count - matches totalIssueRows() grouping exactly.
      // Never plumber-filtered, same as the original totalIssueRows().
      db
        .select({ value: countDistinct(materialTransactions.materialId) })
        .from(materialTransactions)
        .where(buildTransactionListWhere({ ...queryWithoutPlumber, types: ISSUED_TYPES })),
      countByTypes(INVENTORY_PAGE_CONSUMPTION_LOG_TYPES, true),
      // Reuses the existing, already-correct plumber-balance grouping
      // rather than re-deriving that composite-key logic in raw SQL.
      materialsService.plumberBalances({ source: query.source, projectId: query.projectId, plumberId: query.plumberId }),
    ]);

    return {
      stockCount,
      purchaseCount,
      pbgIssueCount,
      pbgConsumptionCount,
      storeIssueCount,
      totalIssueCount,
      plumberBalanceCount: plumberBalanceRows.length,
      plumberConsumptionCount,
    };
  },

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
