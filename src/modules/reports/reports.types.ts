/** Query shared by every report: inclusive yyyy-MM-dd range, optional project. */
export type ReportQuery = { from: string; to: string; projectId?: string };
