import { t } from "elysia";
import { attendanceStatusEnum } from "@db/schema";

const attendanceStatusSchema = t.Union(attendanceStatusEnum.enumValues.map((value) => t.Literal(value)));

const attendanceLocationSchema = t.Object({
  latitude: t.Number(),
  longitude: t.Number(),
  accuracy: t.Optional(t.Union([t.Number(), t.Null()])),
  address: t.Optional(t.String()),
  capturedAt: t.String(),
});

export const checkInBodySchema = t.Object({
  date: t.String({ minLength: 1 }),
  location: attendanceLocationSchema,
});

export const checkOutBodySchema = t.Object({
  date: t.String({ minLength: 1 }),
  location: attendanceLocationSchema,
  remarks: t.Optional(t.String()),
});

export const selfHistoryQuerySchema = t.Object({
  month: t.Optional(t.String()),
});

export const adminListQuerySchema = t.Object({
  from: t.String({ minLength: 1 }),
  to: t.String({ minLength: 1 }),
  userId: t.Optional(t.String()),
});

export const adminUpsertBodySchema = t.Object({
  userId: t.String({ minLength: 1 }),
  date: t.String({ minLength: 1 }),
  status: attendanceStatusSchema,
  checkInTime: t.Optional(t.String()),
  checkOutTime: t.Optional(t.String()),
  remarks: t.Optional(t.String()),
});
