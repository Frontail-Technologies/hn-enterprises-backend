import type { AttendanceStatus } from "@modules/attendance/attendance.types";

const STATUS_DISPLAY: Record<AttendanceStatus, string> = {
  present: "P",
  late: "P",
  absent: "A",
  half_day: "HD",
  leave: "L",
};

export function attendanceDisplayCode(status: AttendanceStatus): string {
  return STATUS_DISPLAY[status];
}

export function attendanceDayValue(status: AttendanceStatus): number {
  if (status === "half_day") return 0.5;
  if (status === "present" || status === "late") return 1;
  return 0;
}
