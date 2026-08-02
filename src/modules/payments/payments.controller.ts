import type { AuthTokenPayload } from "@types";
import type { SetContext } from "@modules/auth/auth.helpers";
import { ok, paginated } from "@utils";
import { paymentsService } from "./payments.service";
import type { CreatePaymentBody, PaymentListQuery, UpdatePaymentBody } from "./payments.types";

function statusFromError(error: unknown) {
  if (error instanceof Error && error.message.includes("not found")) return 404;
  return 400;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export const paymentsController = {
  async list({ query, set }: { query: PaymentListQuery; set: SetContext }) {
    try {
      const { rows, pagination } = await paymentsService.list(query);
      return paginated(rows, pagination);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to list payments") };
    }
  },

  async get({ params, set }: { params: { id: string }; set: SetContext }) {
    try {
      const payment = await paymentsService.get(params.id);
      return ok(payment);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to fetch payment") };
    }
  },

  async create({
    body,
    currentUser,
    set,
  }: {
    body: CreatePaymentBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const payment = await paymentsService.create(body, currentUser.id);
      set.status = 201;
      return ok(payment, "Payment recorded");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to record payment") };
    }
  },

  async update({
    params,
    body,
    currentUser,
    set,
  }: {
    params: { id: string };
    body: UpdatePaymentBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const payment = await paymentsService.update(params.id, body, currentUser);
      return ok(payment, "Payment updated");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to update payment") };
    }
  },
};
