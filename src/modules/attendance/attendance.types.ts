import type { attendanceStatusEnum } from "@db/schema";

export type AttendanceStatus = (typeof attendanceStatusEnum.enumValues)[number];

export type AttendanceLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  address?: string;
  capturedAt: string;
};

export type CheckInBody = {
  date: string;
  location: AttendanceLocation;
};

export type CheckOutBody = {
  date: string;
  location: AttendanceLocation;
};

export type SelfHistoryQuery = {
  month?: string;
};

export type AdminListQuery = {
  from: string;
  to: string;
  userId?: string;
};

export type AdminUpsertBody = {
  userId: string;
  date: string;
  status: AttendanceStatus;
  checkInTime?: string;
  checkOutTime?: string;
  remarks?: string;
};
