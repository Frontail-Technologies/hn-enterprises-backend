import { t } from "elysia";
import {
  customFieldAccessEnum,
  customFieldStatusEnum,
  customFieldValueTypeEnum,
  holidayStatusEnum,
  holidayTypeEnum,
  masterValueCategoryEnum,
  masterValueStatusEnum,
} from "@db/schema";

const masterValueCategorySchema = t.Union(masterValueCategoryEnum.enumValues.map((value) => t.Literal(value)));
const masterValueStatusSchema = t.Union(masterValueStatusEnum.enumValues.map((value) => t.Literal(value)));
const customFieldValueTypeSchema = t.Union(customFieldValueTypeEnum.enumValues.map((value) => t.Literal(value)));
const customFieldStatusSchema = t.Union(customFieldStatusEnum.enumValues.map((value) => t.Literal(value)));
const customFieldAccessSchema = t.Union(customFieldAccessEnum.enumValues.map((value) => t.Literal(value)));
const holidayTypeSchema = t.Union(holidayTypeEnum.enumValues.map((value) => t.Literal(value)));
const holidayStatusSchema = t.Union(holidayStatusEnum.enumValues.map((value) => t.Literal(value)));

export const masterValueListQuerySchema = t.Object({
  category: t.Optional(masterValueCategorySchema),
  status: t.Optional(masterValueStatusSchema),
  search: t.Optional(t.String()),
});

export const createMasterValueBodySchema = t.Object({
  category: masterValueCategorySchema,
  value: t.String({ minLength: 1 }),
  description: t.Optional(t.String()),
  status: t.Optional(masterValueStatusSchema),
});

export const updateMasterValueBodySchema = t.Object({
  value: t.Optional(t.String({ minLength: 1 })),
  description: t.Optional(t.String()),
  status: t.Optional(masterValueStatusSchema),
});

export const customFieldListQuerySchema = t.Object({
  status: t.Optional(customFieldStatusSchema),
});

export const createCustomFieldBodySchema = t.Object({
  label: t.String({ minLength: 1 }),
  groupName: t.String({ minLength: 1 }),
  width: t.Optional(t.Number({ minimum: 60 })),
  sortOrder: t.Optional(t.Number()),
  valueType: t.Optional(customFieldValueTypeSchema),
  dropdownOptions: t.Optional(t.Array(t.String())),
  required: t.Optional(t.Boolean()),
  supervisorAccess: t.Optional(customFieldAccessSchema),
  status: t.Optional(customFieldStatusSchema),
});

export const updateCustomFieldBodySchema = t.Object({
  label: t.Optional(t.String({ minLength: 1 })),
  groupName: t.Optional(t.String({ minLength: 1 })),
  width: t.Optional(t.Number({ minimum: 60 })),
  sortOrder: t.Optional(t.Number()),
  valueType: t.Optional(customFieldValueTypeSchema),
  dropdownOptions: t.Optional(t.Array(t.String())),
  required: t.Optional(t.Boolean()),
  supervisorAccess: t.Optional(customFieldAccessSchema),
  status: t.Optional(customFieldStatusSchema),
});

export const reorderCustomFieldsBodySchema = t.Array(
  t.Object({
    id: t.String({ minLength: 1 }),
    groupName: t.String({ minLength: 1 }),
    sortOrder: t.Number(),
  }),
);

const customFieldImportRowSchema = t.Object({
  rowNumber: t.Number(),
  label: t.String(),
  groupName: t.String(),
  valueType: customFieldValueTypeSchema,
  dropdownOptions: t.Array(t.String()),
  required: t.Boolean(),
  supervisorAccess: customFieldAccessSchema,
  sortOrder: t.Optional(t.Number()),
  issues: t.Array(t.String()),
  warnings: t.Array(t.String()),
});

export const confirmCustomFieldsImportBodySchema = t.Object({
  rows: t.Array(customFieldImportRowSchema),
});

export const holidayListQuerySchema = t.Object({
  status: t.Optional(holidayStatusSchema),
  search: t.Optional(t.String()),
});

export const createHolidayBodySchema = t.Object({
  name: t.String({ minLength: 1 }),
  date: t.String({ minLength: 1 }),
  type: t.Optional(holidayTypeSchema),
  status: t.Optional(holidayStatusSchema),
});

export const updateHolidayBodySchema = t.Partial(createHolidayBodySchema);
