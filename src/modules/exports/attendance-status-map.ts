import type { AttendanceStatus } from "@modules/attendance/attendance.types";

/**
 * Backend attendance status -> Attendance Register display code.
 * "late" is still a worked day, so it renders the same as "present".
 * There is no "holiday"/"weekly off" backend status; Sundays default to
 * HOLIDAY only when no real attendance record exists for that day.
 */
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

/**
 * The one explicit Summary "No. of Days" rule for the Attendance Register export:
 *   present / late  -> 1
 *   half_day        -> 0.5
 *   absent / leave  -> 0
 *   HOLIDAY (Sunday with no record) -> 0 (never added; this function isn't called for it)
 * This is NOT the same computation as the template's own `COUNTIF(range,"P")` formula,
 * which only ever counts exact "P" cells and has no half-day concept - once half_day
 * contributes 0.5, the two calculations diverge by design.
 */
export function attendanceDayValue(status: AttendanceStatus): number {
  if (status === "half_day") return 0.5;
  if (status === "present" || status === "late") return 1;
  return 0;
}
