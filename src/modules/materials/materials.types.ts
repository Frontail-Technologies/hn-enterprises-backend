import type {
  materialSourceEnum,
  materialTransactionLinkTypeEnum,
  materialTransactionTypeEnum,
} from "@db/schema";

export type MaterialTransactionType = (typeof materialTransactionTypeEnum.enumValues)[number];
export type MaterialSource = (typeof materialSourceEnum.enumValues)[number];
export type MaterialTransactionLinkType = (typeof materialTransactionLinkTypeEnum.enumValues)[number];
export type AdjustmentDirection = "in" | "out";

export type MaterialListQuery = {
  page?: number | string;
  limit?: number | string;
  search?: string;
  category?: string;
};

export type CreateMaterialBody = {
  name: string;
  category?: string;
  unit: string;
  reorderLevel?: number;
};

export type UpdateMaterialBody = Partial<CreateMaterialBody>;

export type MaterialTransactionListQuery = {
  page?: number | string;
  limit?: number | string;
  materialId?: string;
  type?: MaterialTransactionType;
  types?: MaterialTransactionType[];
  source?: MaterialSource;
  plumberId?: string;
  siteId?: string;
  customerId?: string;
  projectId?: string;
  from?: string;
  to?: string;
};

export type CreateMaterialTransactionBody = {
  materialId: string;
  type: MaterialTransactionType;
  quantity: number;
  transactionDate: string;
  source?: MaterialSource;
  direction?: AdjustmentDirection;
  projectId?: string;
  referenceNo?: string;
  vendorName?: string;
  rate?: number;
  billAmount?: number;
  plumberId?: string;
  supervisorId?: string;
  siteId?: string;
  address?: string;
  storeLabel?: string;
  customerId?: string;
  paymentId?: string;
  reportNo?: string;
  condition?: string;
  adjustmentType?: string;
  vehicleNo?: string;
  vehicleQty?: number;
  evidence?: Record<string, unknown>[];
  remarks?: string;
  files?: File[];
};

/**
 * Filters shared with the InventoryPage transaction tabs (InventoryFilterBar's
 * source/project/plumber/month) - the overview's counts must reflect the
 * exact same filter context the tab grids themselves use, or the badges
 * would silently disagree with what's on screen.
 */
export type InventoryOverviewQuery = {
  source?: MaterialSource;
  projectId?: string;
  plumberId?: string;
  from?: string;
  to?: string;
};

export type InventoryOverview = {
  stockCount: number;
  purchaseCount: number;
  pbgIssueCount: number;
  pbgConsumptionCount: number;
  storeIssueCount: number;
  totalIssueCount: number;
  plumberBalanceCount: number;
  plumberConsumptionCount: number;
};

export type PlumberBalanceQuery = {
  plumberId?: string;
  materialId?: string;
  source?: MaterialSource;
  projectId?: string;
};

export type StockBalanceQuery = {
  materialId?: string;
  source?: MaterialSource;
  projectId?: string;
};

export type ReverseMaterialTransactionBody = {
  reason: string;
};

export type CorrectMaterialTransactionBody = {
  correctionReason: string;
  quantity?: number;
  transactionDate?: string;
  source?: MaterialSource;
  direction?: AdjustmentDirection;
  projectId?: string;
  referenceNo?: string;
  vendorName?: string;
  rate?: number;
  billAmount?: number;
  plumberId?: string;
  supervisorId?: string;
  siteId?: string;
  address?: string;
  storeLabel?: string;
  customerId?: string;
  paymentId?: string;
  reportNo?: string;
  condition?: string;
  adjustmentType?: string;
  vehicleNo?: string;
  vehicleQty?: number;
  remarks?: string;
};
