export type AttendanceExportQuery = {
  month: string;
  year: string;
  projectId?: string;
};

export type WageExportQuery = {
  month: string;
  year: string;
};

export type CustomerRegisterQuery = {
  projectId?: string;
  siteId?: string;
  status?: string;
  city?: string;
  search?: string;
  statKey?: string;
};

export type InventoryStockExportQuery = {
  projectId?: string;
  source?: "purchase" | "pbg";
};

export type InventoryPurchaseExportQuery = {
  projectId?: string;
  from?: string;
  to?: string;
};

export type InventoryPbgIssueExportQuery = {
  projectId?: string;
  from?: string;
  to?: string;
};

export type InventoryStoreIssueExportQuery = {
  projectId?: string;
  source?: "purchase" | "pbg";
  plumberId?: string;
  from?: string;
  to?: string;
};

export type InventoryConsumptionExportQuery = {
  projectId?: string;
  source?: "purchase" | "pbg";
  plumberId?: string;
  from?: string;
  to?: string;
};

export type InventoryPbgConsumptionExportQuery = {
  projectId?: string;
  plumberId?: string;
  materialId?: string;
  from?: string;
  to?: string;
};

export type InventoryTotalIssueExportQuery = {
  projectId?: string;
  source?: "purchase" | "pbg";
  from?: string;
  to?: string;
};

export type InventoryPlumberBalanceExportQuery = {
  projectId?: string;
  source?: "purchase" | "pbg";
  plumberId?: string;
  materialId?: string;
};

export type DprPlanningExportQuery = {
  date: string;
  projectId?: string;
  supervisorId?: string;
};

export type UserRegisterQuery = {
  role?: string;
  status?: string;
  search?: string;
};

export type MasterValuesExportQuery = {
  category: string;
  search?: string;
};

export type HolidaysExportQuery = {
  search?: string;
};
