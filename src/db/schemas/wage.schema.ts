import { relations } from "drizzle-orm";
import { index, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.schema";
import { plumbers } from "./plumber.schema";

export const wageCategoryEnum = pgEnum("wage_category", ["high_skilled", "skilled", "unskilled"]);
export const wageStatusEnum = pgEnum("wage_status", ["pending", "approved", "paid"]);

export const wageRecords = pgTable(
  "wage_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plumberId: uuid("plumber_id")
      .notNull()
      .references(() => plumbers.id, { onDelete: "restrict" }),
    month: text("month").notNull(),
    category: wageCategoryEnum("category").notNull(),
    wageRate: numeric("wage_rate", { precision: 12, scale: 2 }).notNull(),
    daysWorked: numeric("days_worked", { precision: 6, scale: 2 }).notNull(),
    pf: numeric("pf", { precision: 12, scale: 2 }).notNull().default("0"),
    esic: numeric("esic", { precision: 12, scale: 2 }).notNull().default("0"),
    status: wageStatusEnum("status").notNull().default("pending"),
    remarks: text("remarks"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    plumberMonthIdx: uniqueIndex("wage_records_plumber_month_idx").on(table.plumberId, table.month),
    monthIdx: index("wage_records_month_idx").on(table.month),
    statusIdx: index("wage_records_status_idx").on(table.status),
  }),
);

export const wageRecordsRelations = relations(wageRecords, ({ one }) => ({
  plumber: one(plumbers, {
    fields: [wageRecords.plumberId],
    references: [plumbers.id],
  }),
}));
