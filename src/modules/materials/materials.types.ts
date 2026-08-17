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
  // Required (validated in the service) for issue/return/adjustment - the only types
  // that can move either source's stock. Ignored/overridden for types where source is
  // implied by `type` (purchase, pbg_issue, pbg_consumption, consumption).
  source?: MaterialSource;
  // Required (validated in the service) for adjustment - determines whether the
  // signed delta adds to or subtracts from the plumber's balance.
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

export type PlumberBalanceQuery = {
  plumberId?: string;
  materialId?: string;
  source?: MaterialSource;
  projectId?: string;
};

// "unassigned" is the sentinel for "Central / Unassigned" (projectId IS NULL) - a real
// project's UUID filters to that project, and omitting the param filters to nothing.
export type StockBalanceQuery = {
  materialId?: string;
  source?: MaterialSource;
  projectId?: string;
};

export type ReverseMaterialTransactionBody = {
  reason: string;
};

// All fields optional and fall back to the original row's value - a correction is a
// prefilled copy of the original with only the changed fields supplied.
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
