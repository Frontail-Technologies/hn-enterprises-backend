import type { billStageEnum, billStatusEnum, paymentModeEnum } from "@db/schema";

export type BillStage = (typeof billStageEnum.enumValues)[number];
export type BillStatus = (typeof billStatusEnum.enumValues)[number];
export type PaymentMode = (typeof paymentModeEnum.enumValues)[number];

export type BillListQuery = {
  page?: number | string;
  limit?: number | string;
  search?: string;
  customerId?: string;
  stage?: BillStage;
  status?: BillStatus;
};

export type CreateBillBody = {
  customerId: string;
  billNumber: string;
  stage?: BillStage;
  billDate?: string;
  dueDate?: string;
  totalAmount: number;
  tax?: number;
  status?: BillStatus;
  remarks?: string;
};

export type UpdateBillBody = Partial<CreateBillBody>;

export type CreateBillPaymentBody = {
  amount: number;
  paymentDate: string;
  mode: PaymentMode;
  remarks?: string;
};
