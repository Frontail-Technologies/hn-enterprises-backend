import type { materialTransactionTypeEnum } from "@db/schema";

export type MaterialTransactionType = (typeof materialTransactionTypeEnum.enumValues)[number];

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
  plumberId?: string;
  siteId?: string;
  customerId?: string;
  from?: string;
  to?: string;
};

export type CreateMaterialTransactionBody = {
  materialId: string;
  type: MaterialTransactionType;
  quantity: number;
  transactionDate: string;
  referenceNo?: string;
  vendorName?: string;
  rate?: number;
  billAmount?: number;
  plumberId?: string;
  supervisorId?: string;
  siteId?: string;
  storeLabel?: string;
  customerId?: string;
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
};
