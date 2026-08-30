import type { billPaymentStatusEnum, billStatusEnum } from "@db/schema";

export type BillStatus = (typeof billStatusEnum.enumValues)[number];
export type PaymentMode = string;
export type BillPaymentStatus = (typeof billPaymentStatusEnum.enumValues)[number];

export type BillListQuery = {
  page?: number | string;
  limit?: number | string;
  search?: string;
  projectId?: string;
  status?: BillStatus;
};

export type CreateBillBody = {
  projectId: string;
  billNumber: string;
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
