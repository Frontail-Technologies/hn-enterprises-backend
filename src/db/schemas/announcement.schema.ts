import { index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.schema";

export const announcementStatusEnum = pgEnum("announcement_status", ["draft", "sent"]);

export const announcements = pgTable(
  "announcements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    imageUrl: text("image_url"),
    imageFileName: text("image_file_name"),
    status: announcementStatusEnum("status").notNull().default("draft"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index("announcements_status_idx").on(table.status),
  }),
);
