import { pgEnum } from "drizzle-orm/pg-core";

export const paymentModeEnum = pgEnum("payment_mode", [
  "cash",
  "upi",
  "neft",
  "bank_transfer",
  "cheque",
  "other",
]);
