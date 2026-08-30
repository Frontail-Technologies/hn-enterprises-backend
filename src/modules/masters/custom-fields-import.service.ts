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

export type CustomFieldEditableData = Pick<
  CustomFieldImportRow,
  "label" | "groupName" | "valueType" | "dropdownOptions" | "required" | "supervisorAccess" | "sortOrder"
>;

// Shared by the bulk preview loop's header-parsing path and the standalone
// validate-row endpoint (already-structured edited fields, no header parsing
// needed) - the exact same field-shape checks either way.
function validateFields(fields: CustomFieldEditableData, valueTypeRaw: string, sortOrderRaw: string): { issues: string[]; warnings: string[] } {
  const issues: string[] = [];
  if (!fields.label) issues.push("Label is required");
  if (valueTypeRaw && !VALUE_TYPE_ALIASES[canonicalHeader(valueTypeRaw)]) issues.push(`Unknown value type "${valueTypeRaw}"`);
  if (fields.valueType === "dropdown" && !fields.dropdownOptions.length) {
    issues.push("Dropdown fields need at least one option");
  }
  if (sortOrderRaw && Number.isNaN(Number(sortOrderRaw))) issues.push("Position must be a number");
  return { issues, warnings: [] };
}

/** Re-runs the label-required/value-type/dropdown-options/sort-order checks
 * plus the existing-label duplicate check against an already-edited row - no
 * raw header parsing involved, since the row is already in its typed shape
 * by the time it reaches "Save & Validate". */
export function validateCustomFieldRow(data: CustomFieldEditableData, existingLabels: Set<string>): { issues: string[]; warnings: string[] } {
  const { issues } = validateFields(data, data.valueType, data.sortOrder != null ? String(data.sortOrder) : "");
  const warnings: string[] = [];

  const normLabel = normalizeKey(data.label);
  if (normLabel && existingLabels.has(normLabel)) {
    warnings.push("A field with this label already exists - will be skipped");
  }

  return { issues, warnings };
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

  const { issues } = validateFields(
    { label, groupName, valueType: valueType ?? "text", dropdownOptions, required, supervisorAccess, sortOrder },
    valueTypeRaw,
    sortOrderRaw,
  );

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
    warnings: [],
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

  async validateRow(data: CustomFieldEditableData, currentUser: CurrentUser) {
    requireImportAccess(currentUser);
    const existingLabels = await existingLabelSet();
    return validateCustomFieldRow(data, existingLabels);
  },

  // Per-row isolated - each field definition is an independent insert, only
  // constrained by label/key uniqueness, already checked per-row against a
  // running in-memory set (so two rows in the same batch can't collide
  // either).
  async confirm(rows: CustomFieldImportRow[], currentUser: CurrentUser) {
    requireImportAccess(currentUser);
    if (!rows.length) return { created: 0, skipped: 0, imported: 0, failed: [] as { tempId: string; message: string }[] };

    const db = getDb();
    let created = 0;
    let skipped = 0;
    const failed: { tempId: string; message: string }[] = [];

    const existing = await db.select({ key: customFieldDefinitions.key, label: customFieldDefinitions.label }).from(customFieldDefinitions);
    const takenKeys = new Set(existing.map((row) => row.key));
    const takenLabels = new Set(existing.map((row) => normalizeKey(row.label)));

    for (const row of rows) {
      const tempId = String(row.rowNumber);
      const normLabel = normalizeKey(row.label);

      if (row.issues.length || !normLabel || takenLabels.has(normLabel)) {
        skipped += 1;
        continue;
      }

      try {
        const key = resolveUniqueKey(row.label, takenKeys);
        takenKeys.add(key);
        takenLabels.add(normLabel);

        await db.insert(customFieldDefinitions).values({
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
      } catch (error) {
        failed.push({ tempId, message: error instanceof Error ? error.message : "Unable to import this row" });
      }
    }

    return { created, skipped, imported: created, failed };
  },
};
