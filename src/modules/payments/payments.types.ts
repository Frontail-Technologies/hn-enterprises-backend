import type { paymentCategoryEnum, paymentStatusEnum } from "@db/schema";

export type PaymentCategory = (typeof paymentCategoryEnum.enumValues)[number];
export type PaymentStatus = (typeof paymentStatusEnum.enumValues)[number];
// Free text, managed as master data ("Payment Types") - not a fixed enum.
export type PaymentMode = string;

export type PaymentListQuery = {
  page?: number | string;
  limit?: number | string;
  search?: string;
  category?: PaymentCategory;
  status?: string;
  siteId?: string;
  plumberId?: string;
  projectId?: string;
  from?: string;
  to?: string;
  paidTo?: string;
  purpose?: string;
  address?: string;
  amount?: string;
  date?: string;
  // summary() only - "true" skips the categoryBreakdown/recent sub-queries
  // for callers that only read count/total. Ignored by list().
  totalsOnly?: string;
};

export type PaymentFilterColumn = "paidTo" | "purpose" | "address" | "amount" | "date" | "status" | "category";

export type CreatePaymentBody = {
  category: PaymentCategory;
  plumberId?: string;
  paidTo?: string;
  siteId?: string;
  address?: string;
  customerId?: string;
  projectId?: string;
  amount: number;
  paymentDate: string;
  mode: PaymentMode;
  status?: PaymentStatus;
  purpose?: string;
  remarks?: string;
  evidence?: Record<string, unknown>[];
  files?: File[];
};

export type UpdatePaymentBody = Partial<CreatePaymentBody>;
