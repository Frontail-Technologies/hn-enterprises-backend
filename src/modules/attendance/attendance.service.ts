import { and, eq, gte, isNotNull, isNull, lte } from "drizzle-orm";
import { endOfMonth, format, parseISO, startOfMonth } from "date-fns";
import { getDb } from "@db";
import { attendance, users } from "@db/schema";
import { cleanObject } from "@utils";
import type {
  AdminListQuery,
  AdminUpsertBody,
  AttendanceLocation,
  CheckInBody,
  CheckOutBody,
} from "./attendance.types";

function toDateOnly(value: Date) {
  return format(value, "yyyy-MM-dd");
}

function combineDateAndTime(date: string, time?: string) {
  if (!time) return undefined;
  return new Date(`${date}T${time}`);
}

async function findRecord(userId: string, date: string) {
  const db = getDb();
  const [record] = await db
    .select()
    .from(attendance)
    .where(and(eq(attendance.userId, userId), eq(attendance.date, date)))
    .limit(1);

  return record ?? null;
}

export const attendanceService = {
  async checkIn(userId: string, input: CheckInBody) {
    const existing = await findRecord(userId, input.date);
    if (existing?.checkInAt) throw new Error("Already checked in for this date");

    const db = getDb();
    const values = {
      userId,
      date: input.date,
      status: "present" as const,
      checkInAt: new Date(input.location.capturedAt),
      checkInLocation: input.location as AttendanceLocation,
      updatedAt: new Date(),
    };

    const [record] = await db
      .insert(attendance)
      .values(values)
      .onConflictDoUpdate({
        target: [attendance.userId, attendance.date],
        set: values,
      })
      .returning();

    if (!record) throw new Error("Unable to check in");
    return record;
  },

  async checkOut(userId: string, input: CheckOutBody) {
    const db = getDb();

    const [record] = await db
      .update(attendance)
      .set({
        checkOutAt: new Date(input.location.capturedAt),
        checkOutLocation: input.location as AttendanceLocation,
        ...(input.remarks ? { remarks: input.remarks } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(attendance.userId, userId),
          eq(attendance.date, input.date),
          isNotNull(attendance.checkInAt),
          isNull(attendance.checkOutAt),
        ),
      )
      .returning();

    if (!record) throw new Error("Must check in before checking out, or already checked out");
    return record;
  },

  async selfHistory(userId: string, month?: string) {
    const db = getDb();
    const reference = month ? parseISO(`${month}-01`) : new Date();
    const from = toDateOnly(startOfMonth(reference));
    const to = toDateOnly(endOfMonth(reference));

    return db
      .select()
      .from(attendance)
      .where(and(eq(attendance.userId, userId), gte(attendance.date, from), lte(attendance.date, to)))
      .orderBy(attendance.date);
  },

  async selfDay(userId: string, date: string) {
    return findRecord(userId, date);
  },

  async adminList(query: AdminListQuery) {
    const db = getDb();
    const conditions = [gte(attendance.date, query.from), lte(attendance.date, query.to)];
    if (query.userId) conditions.push(eq(attendance.userId, query.userId));

    return db
      .select({
        id: attendance.id,
        userId: attendance.userId,
        date: attendance.date,
        status: attendance.status,
        checkInAt: attendance.checkInAt,
        checkOutAt: attendance.checkOutAt,
        checkInLocation: attendance.checkInLocation,
        checkOutLocation: attendance.checkOutLocation,
        remarks: attendance.remarks,
        markedBy: attendance.markedBy,
        user: { id: users.id, name: users.name, role: users.role },
      })
      .from(attendance)
      .leftJoin(users, eq(attendance.userId, users.id))
      .where(and(...conditions))
      .orderBy(attendance.date);
  },

  async adminUpsert(input: AdminUpsertBody, markedBy: string) {
    const db = getDb();
    const checkInAt = combineDateAndTime(input.date, input.checkInTime);
    const checkOutAt = combineDateAndTime(input.date, input.checkOutTime);
    const existing = await findRecord(input.userId, input.date);

    if (existing) {
      const [record] = await db
        .update(attendance)
        .set(
          cleanObject({
            status: input.status,
            checkInAt,
            checkOutAt,
            remarks: input.remarks,
            markedBy,
            updatedAt: new Date(),
          }),
        )
        .where(eq(attendance.id, existing.id))
        .returning();

      if (!record) throw new Error("Unable to save attendance record");
      return record;
    }

    const [record] = await db
      .insert(attendance)
      .values({
        userId: input.userId,
        date: input.date,
        status: input.status,
        checkInAt: checkInAt ?? null,
        checkOutAt: checkOutAt ?? null,
        remarks: input.remarks || null,
        markedBy,
      })
      .returning();

    if (!record) throw new Error("Unable to save attendance record");
    return record;
  },
};
