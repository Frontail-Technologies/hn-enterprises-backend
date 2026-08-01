import type { AuthTokenPayload } from "@types";
import type { SetContext } from "@modules/auth/auth.helpers";
import { ok, paginated } from "@utils";
import { billsService } from "./bills.service";
import type {
  BillListQuery,
  CreateBillBody,
  CreateBillPaymentBody,
  UpdateBillBody,
} from "./bills.types";

function statusFromError(error: unknown) {
  if (error instanceof Error && error.message.includes("not found")) return 404;
  return 400;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export const billsController = {
  async list({ query, set }: { query: BillListQuery; set: SetContext }) {
    try {
      const { rows, pagination } = await billsService.list(query);
      return paginated(rows, pagination);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to list bills") };
    }
  },

  async get({ params, set }: { params: { id: string }; set: SetContext }) {
    try {
      const bill = await billsService.get(params.id);
      return ok(bill);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to fetch bill") };
    }
  },

  async create({
    body,
    currentUser,
    set,
  }: {
    body: CreateBillBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const bill = await billsService.create(body, currentUser.id);
      set.status = 201;
      return ok(bill, "Bill created");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to create bill") };
    }
  },

  async update({
    params,
    body,
    currentUser,
    set,
  }: {
    params: { id: string };
    body: UpdateBillBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const bill = await billsService.update(params.id, body, currentUser.id);
      return ok(bill, "Bill updated");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to update bill") };
    }
  },

  async listPayments({ params, set }: { params: { id: string }; set: SetContext }) {
    try {
      const payments = await billsService.listPayments(params.id);
      return ok(payments);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to list bill payments") };
    }
  },

  async createPayment({
    params,
    body,
    currentUser,
    set,
  }: {
    params: { id: string };
    body: CreateBillPaymentBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const payment = await billsService.createPayment(params.id, body, currentUser.id);
      set.status = 201;
      return ok(payment, "Payment recorded");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to record payment") };
    }
  },
};
