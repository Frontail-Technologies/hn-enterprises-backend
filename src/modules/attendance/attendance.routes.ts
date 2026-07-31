import { Elysia, t } from "elysia";
import { auth } from "@plugins";
import { attendanceController } from "./attendance.controller";
import {
  adminListQuerySchema,
  adminUpsertBodySchema,
  checkInBodySchema,
  checkOutBodySchema,
  selfHistoryQuerySchema,
} from "./attendance.schema";

export const attendanceRoutes = new Elysia({ prefix: "/attendance" })
  .use(auth)
  .post(
    "/check-in",
    ({ body, currentUser, set }) => attendanceController.checkIn({ body, currentUser, set }),
    { body: checkInBodySchema, requireAuth: true },
  )
  .post(
    "/check-out",
    ({ body, currentUser, set }) => attendanceController.checkOut({ body, currentUser, set }),
    { body: checkOutBodySchema, requireAuth: true },
  )
  .get(
    "/me",
    ({ query, currentUser, set }) => attendanceController.selfHistory({ query, currentUser, set }),
    { query: selfHistoryQuerySchema, requireAuth: true },
  )
  .get(
    "/me/:date",
    ({ params, currentUser, set }) => attendanceController.selfDay({ params, currentUser, set }),
    { params: t.Object({ date: t.String() }), requireAuth: true },
  )
  .get(
    "/",
    ({ query, set }) => attendanceController.adminList({ query, set }),
    { query: adminListQuerySchema, requireAuth: true },
  )
  .put(
    "/",
    ({ body, currentUser, set }) => attendanceController.adminUpsert({ body, currentUser, set }),
    { body: adminUpsertBodySchema, requireRole: ["super_admin", "admin"] },
  );
