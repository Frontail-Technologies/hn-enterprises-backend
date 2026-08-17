import type { HTTPHeaders } from "elysia";
import type { AuthTokenPayload } from "@types";
import { errorMessage, statusFromError } from "@utils";
import { attendanceExportService } from "./attendance-export.service";
import { wageExportService } from "./wage-export.service";
import { customerExportService } from "./customer-export.service";
import { dprPlanningExportService } from "./dpr-planning-export.service";
import { inventoryExportService } from "./inventory-export.service";
import { userExportService } from "./user-export.service";
import { mastersExportService } from "./masters-export.service";
import type {
  AttendanceExportQuery,
  CustomerRegisterQuery,
  DprPlanningExportQuery,
  HolidaysExportQuery,
  InventoryConsumptionExportQuery,
  InventoryPbgConsumptionExportQuery,
  InventoryPbgIssueExportQuery,
  InventoryPlumberBalanceExportQuery,
  InventoryPurchaseExportQuery,
  InventoryStockExportQuery,
  InventoryStoreIssueExportQuery,
  InventoryTotalIssueExportQuery,
  MasterValuesExportQuery,
  UserRegisterQuery,
  WageExportQuery,
} from "./exports.types";

type ExportSetContext = { status?: number | string; headers: HTTPHeaders };

function setXlsxHeaders(set: ExportSetContext, filename: string) {
  set.headers["Content-Type"] = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  set.headers["Content-Disposition"] = `attachment; filename="${filename}"`;
}

export const exportsController = {
  async attendance({ query, set }: { query: AttendanceExportQuery; set: ExportSetContext }) {
    try {
      const { workbook, filename } = await attendanceExportService.build(query);
      const buffer = await workbook.xlsx.writeBuffer();
      setXlsxHeaders(set, filename);
      return buffer;
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to generate attendance register") };
    }
  },

  async wages({ query, set }: { query: WageExportQuery; set: ExportSetContext }) {
    try {
      const { workbook, filename } = await wageExportService.build(query);
      const buffer = await workbook.xlsx.writeBuffer();
      setXlsxHeaders(set, filename);
      return buffer;
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to generate wage register") };
    }
  },

  async customers({
    query,
    currentUser,
    set,
  }: {
    query: CustomerRegisterQuery;
    currentUser: AuthTokenPayload | null;
    set: ExportSetContext;
  }) {
    try {
      const { workbook, filename } = await customerExportService.build(query, currentUser?.id ?? null);
      const buffer = await workbook.xlsx.writeBuffer();
      setXlsxHeaders(set, filename);
      return buffer;
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to generate customer register") };
    }
  },

  async dprPlanning({ query, set }: { query: DprPlanningExportQuery; set: ExportSetContext }) {
    try {
      const { workbook, filename } = await dprPlanningExportService.build(query);
      const buffer = await workbook.xlsx.writeBuffer();
      setXlsxHeaders(set, filename);
      return buffer;
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to generate DPR/Planning summary") };
    }
  },

  async inventoryStock({ query, set }: { query: InventoryStockExportQuery; set: ExportSetContext }) {
    try {
      const { workbook, filename } = await inventoryExportService.stockSheet(query);
      const buffer = await workbook.xlsx.writeBuffer();
      setXlsxHeaders(set, filename);
      return buffer;
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to generate stock sheet") };
    }
  },

  async inventoryPurchases({ query, set }: { query: InventoryPurchaseExportQuery; set: ExportSetContext }) {
    try {
      const { workbook, filename } = await inventoryExportService.purchaseRegister(query);
      const buffer = await workbook.xlsx.writeBuffer();
      setXlsxHeaders(set, filename);
      return buffer;
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to generate purchase register") };
    }
  },

  async inventoryPbgIssues({ query, set }: { query: InventoryPbgIssueExportQuery; set: ExportSetContext }) {
    try {
      const { workbook, filename } = await inventoryExportService.pbgIssue(query);
      const buffer = await workbook.xlsx.writeBuffer();
      setXlsxHeaders(set, filename);
      return buffer;
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to generate PBG issue register") };
    }
  },

  async inventoryStoreIssues({ query, set }: { query: InventoryStoreIssueExportQuery; set: ExportSetContext }) {
    try {
      const { workbook, filename } = await inventoryExportService.storeIssueBook(query);
      const buffer = await workbook.xlsx.writeBuffer();
      setXlsxHeaders(set, filename);
      return buffer;
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to generate store issue book") };
    }
  },

  async inventoryConsumption({ query, set }: { query: InventoryConsumptionExportQuery; set: ExportSetContext }) {
    try {
      const { workbook, filename } = await inventoryExportService.consumptionLog(query);
      const buffer = await workbook.xlsx.writeBuffer();
      setXlsxHeaders(set, filename);
      return buffer;
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to generate consumption log") };
    }
  },

  async inventoryPbgConsumption({ query, set }: { query: InventoryPbgConsumptionExportQuery; set: ExportSetContext }) {
    try {
      const { workbook, filename } = await inventoryExportService.pbgConsumption(query);
      const buffer = await workbook.xlsx.writeBuffer();
      setXlsxHeaders(set, filename);
      return buffer;
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to generate PBG consumption register") };
    }
  },

  async inventoryTotalIssue({ query, set }: { query: InventoryTotalIssueExportQuery; set: ExportSetContext }) {
    try {
      const { workbook, filename } = await inventoryExportService.totalIssue(query);
      const buffer = await workbook.xlsx.writeBuffer();
      setXlsxHeaders(set, filename);
      return buffer;
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to generate total issue register") };
    }
  },

  async inventoryPlumberBalance({ query, set }: { query: InventoryPlumberBalanceExportQuery; set: ExportSetContext }) {
    try {
      const { workbook, filename } = await inventoryExportService.plumberBalance(query);
      const buffer = await workbook.xlsx.writeBuffer();
      setXlsxHeaders(set, filename);
      return buffer;
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to generate plumber balance register") };
    }
  },

  async users({ query, set }: { query: UserRegisterQuery; set: ExportSetContext }) {
    try {
      const { workbook, filename } = await userExportService.build(query);
      const buffer = await workbook.xlsx.writeBuffer();
      setXlsxHeaders(set, filename);
      return buffer;
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to generate user register") };
    }
  },

  async masterValues({ query, set }: { query: MasterValuesExportQuery; set: ExportSetContext }) {
    try {
      const { workbook, filename } = await mastersExportService.masterValues(query);
      const buffer = await workbook.xlsx.writeBuffer();
      setXlsxHeaders(set, filename);
      return buffer;
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to generate master values register") };
    }
  },

  async holidays({ query, set }: { query: HolidaysExportQuery; set: ExportSetContext }) {
    try {
      const { workbook, filename } = await mastersExportService.holidays(query);
      const buffer = await workbook.xlsx.writeBuffer();
      setXlsxHeaders(set, filename);
      return buffer;
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to generate holidays register") };
    }
  },
};
