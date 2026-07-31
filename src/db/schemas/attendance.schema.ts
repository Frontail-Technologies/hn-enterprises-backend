import { relations } from "drizzle-orm";
import { date, index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.schema";

export type AttendanceLocationPayload = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  address?: string;
  capturedAt: string;
};

export const attendanceStatusEnum = pgEnum("attendance_status", [
  "present",
  "absent",
  "late",
  "half_day",
  "leave",
]);

export const attendance = pgTable(
  "attendance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    status: attendanceStatusEnum("status").notNull().default("present"),
    checkInAt: timestamp("check_in_at", { withTimezone: true }),
    checkOutAt: timestamp("check_out_at", { withTimezone: true }),
    checkInLocation: jsonb("check_in_location").$type<AttendanceLocationPayload>(),
    checkOutLocation: jsonb("check_out_location").$type<AttendanceLocationPayload>(),
    remarks: text("remarks"),
    markedBy: uuid("marked_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userDateIdx: uniqueIndex("attendance_user_date_idx").on(table.userId, table.date),
    dateIdx: index("attendance_date_idx").on(table.date),
  }),
);

export const attendanceRelations = relations(attendance, ({ one }) => ({
  user: one(users, {
    fields: [attendance.userId],
    references: [users.id],
    relationName: "attendance_user",
  }),
  markedByUser: one(users, {
    fields: [attendance.markedBy],
    references: [users.id],
    relationName: "attendance_marked_by",
  }),
}));
