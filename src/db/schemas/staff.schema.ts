import { relations } from "drizzle-orm";
import { numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users, userStatusEnum } from "./auth.schema";
import { projects } from "./project.schema";

export const staffSalaryTypeEnum = pgEnum("staff_salary_type", [
  "monthly",
  "daily_wage",
  "work_basis",
  "contract",
]);

export const staffPaymentAccountTypeEnum = pgEnum("staff_payment_account_type", [
  "bank_account",
  "upi",
  "cash",
  "other",
]);

/** Job title. Only supervisors have an app login; everyone else is a record without one. */
export const staffDesignationEnum = pgEnum("staff_designation", [
  "supervisor",
  "site_manager",
  "project_manager",
  "driver",
  "jointer",
  "helper",
  "operator",
  "store_incharge",
]);

export const staff = pgTable(
  "staff",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Login account (supervisors only); null for staff without app access. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    designation: staffDesignationEnum("designation").notNull().default("supervisor"),
    /** Name, mobile, photo and status of staff without a login (supervisors keep these on their user). */
    name: text("name"),
    mobile: text("mobile"),
    avatarUrl: text("avatar_url"),
    status: userStatusEnum("status").notNull().default("active"),
    assignedProjectId: uuid("assigned_project_id").references(() => projects.id, { onDelete: "set null" }),
    salaryType: staffSalaryTypeEnum("salary_type").notNull().default("monthly"),
    monthlySalary: numeric("monthly_salary", { precision: 12, scale: 2 }).notNull().default("0"),
    allowance: numeric("allowance", { precision: 12, scale: 2 }).notNull().default("0"),
    paymentAccountType: staffPaymentAccountTypeEnum("payment_account_type").notNull().default("bank_account"),
    bankType: text("bank_type"),
    bankName: text("bank_name"),
    accountHolderName: text("account_holder_name"),
    accountNumber: text("account_number"),
    ifscCode: text("ifsc_code"),
    upiType: text("upi_type"),
    upiId: text("upi_id"),
    salaryEffectiveFrom: timestamp("salary_effective_from", { withTimezone: true }),
    lastSalaryRevisionDate: timestamp("last_salary_revision_date", { withTimezone: true }),
    nextSalaryReviewDate: timestamp("next_salary_review_date", { withTimezone: true }),
    remarks: text("remarks"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: uniqueIndex("staff_user_id_idx").on(table.userId),
  }),
);

export const staffRelations = relations(staff, ({ one }) => ({
  user: one(users, {
    fields: [staff.userId],
    references: [users.id],
  }),
  assignedProject: one(projects, {
    fields: [staff.assignedProjectId],
    references: [projects.id],
  }),
}));
