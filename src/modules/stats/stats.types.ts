export type SupervisorStatId =
  | "survey-done"
  | "conversion-done"
  | "gi-done"
  | "jmr-done"
  | "gc-done"
  | "site-expenses-done"
  | "laying"
  | "flushing-testing"
  | "valve-chamber"
  | "pre-commissioning"
  | "commissioning"
  | "dpr"
  | "planning"
  | "pole-marker"
  | "route-marker"
  | "complaint-customer"
  | "total-pbg-assignment"
  | "total-connection-done"
  | "total-connection-remark"
  | "needs-attention"
  | "total-conversion-done"
  | "customer-resolve";

export type SupervisorStatTone = "blue" | "orange" | "green" | "red";

export type SupervisorStat = {
  id: SupervisorStatId;
  label: string;
  value: string;
  suffix: string;
  tone: SupervisorStatTone;
};

export type SupervisorStatDetailStatus =
  | "Done"
  | "Pending"
  | "In Progress"
  | "Sent Back"
  | "Not Required"
  | "Not Started"
  | "On Hold"
  | "Planned"
  | "Delayed";

export type SupervisorStatDetailRow = {
  id: string;
  customerId?: string;
  title: string;
  reference: string;
  site: string;
  address: string;
  status: SupervisorStatDetailStatus;
  updatedOn: string;
  helper: string;
};
