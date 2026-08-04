import type { paymentCategoryEnum, paymentModeEnum, paymentStatusEnum } from "@db/schema";

export type PaymentCategory = (typeof paymentCategoryEnum.enumValues)[number];
export type PaymentStatus = (typeof paymentStatusEnum.enumValues)[number];
export type PaymentMode = (typeof paymentModeEnum.enumValues)[number];

export type PaymentListQuery = {
  page?: number | string;
  limit?: number | string;
  search?: string;
  category?: PaymentCategory;
  status?: PaymentStatus;
  siteId?: string;
  plumberId?: string;
  from?: string;
  to?: string;
};

export type CreatePaymentBody = {
  category: PaymentCategory;
  plumberId?: string;
  paidTo?: string;
  siteId?: string;
  customerId?: string;
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
