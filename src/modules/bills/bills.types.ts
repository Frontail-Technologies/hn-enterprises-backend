import type { billPaymentStatusEnum, billStageEnum, billStatusEnum } from "@db/schema";

export type BillStage = (typeof billStageEnum.enumValues)[number];
export type BillStatus = (typeof billStatusEnum.enumValues)[number];
// Free text, managed as master data ("Payment Types") - not a fixed enum.
export type PaymentMode = string;
export type BillPaymentStatus = (typeof billPaymentStatusEnum.enumValues)[number];

export type BillListQuery = {
  page?: number | string;
  limit?: number | string;
  search?: string;
  projectId?: string;
  customerId?: string;
  stage?: BillStage;
  status?: BillStatus;
};

export type CreateBillBody = {
  projectId: string;
  customerId?: string;
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
  status?: BillPaymentStatus;
  remarks?: string;
};

export type UpdateBillPaymentBody = {
  status: BillPaymentStatus;
};
