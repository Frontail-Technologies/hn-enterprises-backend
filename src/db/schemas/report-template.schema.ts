import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.schema";

/**
 * Admin edits to the built-in report templates (the templates themselves are
 * defined in the frontend). One row per edited template; a missing row means
 * "use the defaults". `fieldLabels` maps a data field key (e.g. "customerName")
 * to the label printed on the paper form.
 */
export const reportTemplateOverrides = pgTable("report_template_overrides", {
  templateId: text("template_id").primaryKey(),
  title: text("title"),
  category: text("category"),
  description: text("description"),
  fieldLabels: jsonb("field_labels").$type<Record<string, string>>().notNull().default({}),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
