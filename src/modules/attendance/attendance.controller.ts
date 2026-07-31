import type { AuthTokenPayload } from "@types";
import type { SetContext } from "@modules/auth/auth.helpers";
import { ok } from "@utils";
import { attendanceService } from "./attendance.service";
import type { AdminListQuery, AdminUpsertBody, CheckInBody, CheckOutBody, SelfHistoryQuery } from "./attendance.types";

function statusFromError(error: unknown) {
  if (error instanceof Error && error.message.includes("not found")) return 404;
  return 400;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export const attendanceController = {
  async checkIn({
    body,
    currentUser,
    set,
  }: {
    body: CheckInBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const record = await attendanceService.checkIn(currentUser.id, body);
      set.status = 201;
      return ok(record, "Checked in");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to check in") };
    }
  },

  async checkOut({
    body,
    currentUser,
    set,
  }: {
    body: CheckOutBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const record = await attendanceService.checkOut(currentUser.id, body);
      return ok(record, "Checked out");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to check out") };
    }
  },

  async selfHistory({
    query,
    currentUser,
    set,
  }: {
    query: SelfHistoryQuery;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const records = await attendanceService.selfHistory(currentUser.id, query.month);
      return ok(records);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to fetch attendance history") };
    }
  },

  async selfDay({
    params,
    currentUser,
    set,
  }: {
    params: { date: string };
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const record = await attendanceService.selfDay(currentUser.id, params.date);
      return ok(record);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to fetch attendance") };
    }
  },

  async adminList({ query, set }: { query: AdminListQuery; set: SetContext }) {
    try {
      const records = await attendanceService.adminList(query);
      return ok(records);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to list attendance") };
    }
  },

  async adminUpsert({
    body,
    currentUser,
    set,
  }: {
    body: AdminUpsertBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const record = await attendanceService.adminUpsert(body, currentUser.id);
      return ok(record, "Attendance saved");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to save attendance") };
    }
  },
};
