import ExcelJS from "exceljs";
import { format } from "date-fns";
import { usersService } from "@modules/users/users.service";
import type { UserStatus } from "@modules/users/users.types";
import { buildExportFilename } from "./workbook-helpers";
import { textOf, writeFlatRegisterSheet, type FlatColumn } from "./flat-register";
import type { UserRegisterQuery } from "./exports.types";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  supervisor: "Supervisor",
  viewer: "Viewer",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
  suspended: "Suspended",
};

// The Users & Roles page only ever shows admin-level accounts (Super Admin /
// Supervisor) - staff/plumber accounts live in their own modules - so the
// export mirrors that same restriction rather than dumping the full roster.
const PAGE_ROLES = ["super_admin", "supervisor"] as const;

export const userExportService = {
  async build(query: UserRegisterQuery) {
    const requestedRoles = query.role
      ? query.role.split(",").map((role) => role.trim()).filter((role) => (PAGE_ROLES as readonly string[]).includes(role))
      : [...PAGE_ROLES];

    // usersService.list() returns a bare array when called without page/limit
    // (as here), or {rows, pagination} when they're set - its return type is
    // the union of both regardless of which branch a given call takes, so
    // this needs the runtime check even though only the array shape is ever
    // actually possible here.
    const result = requestedRoles.length
      ? await usersService.list({
          role: requestedRoles.join(","),
          status: query.status as UserStatus | undefined,
          search: query.search,
        })
      : [];
    const rows = Array.isArray(result) ? result : result.rows;

    type Row = (typeof rows)[number];
    const columns: FlatColumn<Row>[] = [
      { header: "S.No.", type: "num", width: 8, get: (_row, rowNumber) => rowNumber },
      { header: "Name", type: "text", width: 24, get: (row) => textOf(row.name) },
      { header: "Username", type: "text", width: 18, get: (row) => textOf(row.username) },
      { header: "Mobile", type: "text", width: 16, get: (row) => textOf(row.mobile) },
      { header: "Role", type: "text", width: 16, get: (row) => textOf(ROLE_LABELS[row.role] ?? row.role) },
      { header: "Status", type: "text", width: 14, get: (row) => textOf(STATUS_LABELS[row.status] ?? row.status) },
      {
        header: "Last Login",
        type: "text",
        width: 20,
        get: (row) => textOf(row.lastLoginAt ? format(new Date(row.lastLoginAt), "dd MMM yyyy, hh:mm a") : "Never"),
      },
    ];

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "HN Enterprises";
    const sheet = workbook.addWorksheet("Users", { pageSetup: { orientation: "landscape" } });
    writeFlatRegisterSheet(sheet, columns, rows, { frozenCols: 1 });

    const filename = buildExportFilename(["Users-Roles"]);
    return { workbook, filename };
  },
};
