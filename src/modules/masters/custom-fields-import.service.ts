import { getDb } from "@db";
import { customFieldDefinitions } from "@db/schema";
import { canonicalHeader, normalizeKey, normalizeText, readSheetRows } from "@modules/master-import/master-import.mapper";
import type { CurrentUser } from "@types";
import { buildCustomFieldKey } from "./masters.service";
import type { CustomFieldAccess, CustomFieldValueType } from "./masters.types";

type ImportField = "label" | "groupName" | "valueType" | "dropdownOptions" | "required" | "supervisorAccess" | "sortOrder";

const HEADER_ALIASES: Record<string, ImportField> = {
  label: "label",
  columnlabel: "label",
  fieldlabel: "label",
  fieldname: "label",
  name: "label",
  group: "groupName",
  groupname: "groupName",
  section: "groupName",
  valuetype: "valueType",
  type: "valueType",
  fieldtype: "valueType",
  options: "dropdownOptions",
  dropdownoptions: "dropdownOptions",
  choices: "dropdownOptions",
  required: "required",
  mandatory: "required",
  access: "supervisorAccess",
  supervisoraccess: "supervisorAccess",
  position: "sortOrder",
  sortorder: "sortOrder",
  order: "sortOrder",
};

const VALUE_TYPE_ALIASES: Record<string, CustomFieldValueType> = {
  text: "text",
  string: "text",
  number: "number",
  numeric: "number",
  date: "date",
  amount: "amount",
  currency: "amount",
  money: "amount",
  yesno: "yes_no",
  boolean: "yes_no",
  dropdown: "dropdown",
  select: "dropdown",
  list: "dropdown",
};

const ACCESS_ALIASES: Record<string, CustomFieldAccess> = {
  adminonly: "admin_only",
  admin: "admin_only",
  supervisorview: "supervisor_view",
  supervisorcanview: "supervisor_view",
  supervisoredit: "supervisor_edit",
  supervisorcanedit: "supervisor_edit",
  supervisorcanviewandedit: "supervisor_edit",
};

export type CustomFieldImportRow = {
  rowNumber: number;
  label: string;
  groupName: string;
  valueType: CustomFieldValueType;
  dropdownOptions: string[];
  required: boolean;
  supervisorAccess: CustomFieldAccess;
  sortOrder?: number;
  issues: string[];
  warnings: string[];
};

function requireImportAccess(user: CurrentUser) {
  if (user.role !== "super_admin" && user.role !== "admin") {
    throw new Error("Only admin users can import field definitions");
  }
}

function normalizeRow(rowNumber: number, values: Record<string, unknown>): CustomFieldImportRow {
  const fields: Partial<Record<ImportField, unknown>> = {};
  for (const [header, value] of Object.entries(values)) {
    const target = HEADER_ALIASES[canonicalHeader(header)];
    if (target) fields[target] = value;
  }

  const label = normalizeText(fields.label);
  const groupName = normalizeText(fields.groupName) || "General";
  const valueTypeRaw = normalizeText(fields.valueType);
  const valueType = valueTypeRaw ? VALUE_TYPE_ALIASES[canonicalHeader(valueTypeRaw)] : "text";
  const requiredRaw = normalizeText(fields.required).toLowerCase();
  const required = ["yes", "true", "1", "y"].includes(requiredRaw);
  const accessRaw = normalizeText(fields.supervisorAccess);
  const supervisorAccess = (accessRaw && ACCESS_ALIASES[canonicalHeader(accessRaw)]) || "admin_only";
  const optionsRaw = normalizeText(fields.dropdownOptions);
  const dropdownOptions = optionsRaw
    ? optionsRaw
        .split(/[,|;]/)
        .map((option) => option.trim())
        .filter(Boolean)
    : [];
  const sortOrderRaw = normalizeText(fields.sortOrder);
  const sortOrder = sortOrderRaw ? Number(sortOrderRaw) : undefined;

  const issues: string[] = [];
  const warnings: string[] = [];

  if (!label) issues.push("Label is required");
  if (valueTypeRaw && !valueType) issues.push(`Unknown value type "${valueTypeRaw}"`);
  if (valueType === "dropdown" && !dropdownOptions.length) {
    issues.push("Dropdown fields need at least one option");
  }
  if (sortOrderRaw && Number.isNaN(sortOrder)) issues.push("Position must be a number");

  return {
    rowNumber,
    label,
    groupName,
    valueType: valueType ?? "text",
    dropdownOptions,
    required,
    supervisorAccess,
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : undefined,
    issues,
    warnings,
  };
}

async function existingLabelSet() {
  const db = getDb();
  const rows = await db.select({ label: customFieldDefinitions.label }).from(customFieldDefinitions);
  return new Set(rows.map((row) => normalizeKey(row.label)));
}

function resolveUniqueKey(label: string, takenKeys: Set<string>) {
  const base = buildCustomFieldKey(label) || `field${Date.now()}`;
  if (!takenKeys.has(base)) return base;

  let suffix = 2;
  while (takenKeys.has(`${base}${suffix}`)) suffix += 1;
  return `${base}${suffix}`;
}

export const customFieldsImportService = {
  async preview(file: File, currentUser: CurrentUser) {
    requireImportAccess(currentUser);

    const rawRows = await readSheetRows(file);
    const existingLabels = await existingLabelSet();
    const seenInFile = new Set<string>();

    const rows = rawRows.map((row) => {
      const normalized = normalizeRow(row.rowNumber, row.values);
      const normLabel = normalizeKey(normalized.label);

      if (normLabel) {
        if (existingLabels.has(normLabel)) {
          normalized.warnings.push("A field with this label already exists - will be skipped");
        } else if (seenInFile.has(normLabel)) {
          normalized.warnings.push("Duplicate label within this file - will be skipped");
        } else {
          seenInFile.add(normLabel);
        }
      }

      return normalized;
    });

    return {
      fileName: file.name,
      rows,
      totals: {
        total: rows.length,
        valid: rows.filter((row) => !row.issues.length && !row.warnings.length).length,
        warning: rows.filter((row) => !row.issues.length && row.warnings.length).length,
        error: rows.filter((row) => row.issues.length).length,
      },
    };
  },

  async confirm(rows: CustomFieldImportRow[], currentUser: CurrentUser) {
    requireImportAccess(currentUser);
    if (!rows.length) return { created: 0, skipped: 0 };

    const db = getDb();
    let created = 0;
    let skipped = 0;

    await db.transaction(async (tx) => {
      const existing = await tx.select({ key: customFieldDefinitions.key, label: customFieldDefinitions.label }).from(customFieldDefinitions);
      const takenKeys = new Set(existing.map((row) => row.key));
      const takenLabels = new Set(existing.map((row) => normalizeKey(row.label)));

      for (const row of rows) {
        const normLabel = normalizeKey(row.label);
        if (row.issues.length || !normLabel || takenLabels.has(normLabel)) {
          skipped += 1;
          continue;
        }

        const key = resolveUniqueKey(row.label, takenKeys);
        takenKeys.add(key);
        takenLabels.add(normLabel);

        await tx.insert(customFieldDefinitions).values({
          key,
          label: row.label,
          groupName: row.groupName || "General",
          width: 150,
          valueType: row.valueType,
          dropdownOptions: row.valueType === "dropdown" ? row.dropdownOptions : null,
          required: row.required,
          sortOrder: row.sortOrder ?? 0,
          supervisorAccess: row.supervisorAccess,
          status: "active",
          createdBy: currentUser.id,
          updatedBy: currentUser.id,
        });
        created += 1;
      }
    });

    return { created, skipped };
  },
};
