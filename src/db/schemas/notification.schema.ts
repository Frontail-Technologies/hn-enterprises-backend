import { boolean, index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.schema";

export type NotificationRoutePayload = {
  pathname: string;
  params?: Record<string, string>;
};

export const notificationCategoryEnum = pgEnum("notification_category", [
  "work",
  "attendance",
  "survey",
  "system",
]);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    message: text("message").notNull(),
    category: notificationCategoryEnum("category").notNull().default("system"),
    sourceType: text("source_type"),
    sourceId: uuid("source_id"),
    imageUrl: text("image_url"),
    route: jsonb("route").$type<NotificationRoutePayload>(),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("notifications_user_idx").on(table.userId),
    userReadIdx: index("notifications_user_read_idx").on(table.userId, table.read),
    createdAtIdx: index("notifications_created_at_idx").on(table.createdAt),
  }),
);

export const pushTokens = pgTable(
  "push_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenIdx: uniqueIndex("push_tokens_token_idx").on(table.token),
    userIdx: index("push_tokens_user_idx").on(table.userId),
  }),
);
