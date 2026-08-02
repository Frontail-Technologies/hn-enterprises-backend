import type {
  customFieldStatusEnum,
  customFieldValueTypeEnum,
  holidayStatusEnum,
  holidayTypeEnum,
  masterValueCategoryEnum,
  masterValueStatusEnum,
} from "@db/schema";

export type MasterValueCategory = (typeof masterValueCategoryEnum.enumValues)[number];
export type MasterValueStatus = (typeof masterValueStatusEnum.enumValues)[number];
export type CustomFieldValueType = (typeof customFieldValueTypeEnum.enumValues)[number];
export type CustomFieldStatus = (typeof customFieldStatusEnum.enumValues)[number];
export type HolidayType = (typeof holidayTypeEnum.enumValues)[number];
export type HolidayStatus = (typeof holidayStatusEnum.enumValues)[number];

export type MasterValueListQuery = {
  category?: MasterValueCategory;
  status?: MasterValueStatus;
  search?: string;
};

export type CreateMasterValueBody = {
  category: MasterValueCategory;
  value: string;
  description?: string;
  status?: MasterValueStatus;
};

export type UpdateMasterValueBody = Partial<Omit<CreateMasterValueBody, "category">>;

export type CustomFieldListQuery = {
  status?: CustomFieldStatus;
};

export type CreateCustomFieldBody = {
  key: string;
  label: string;
  groupName: string;
  width?: number;
  valueType?: CustomFieldValueType;
  dropdownOptions?: string[];
  required?: boolean;
  status?: CustomFieldStatus;
};

export type UpdateCustomFieldBody = Partial<Omit<CreateCustomFieldBody, "key">>;

export type HolidayListQuery = {
  status?: HolidayStatus;
  search?: string;
};

export type CreateHolidayBody = {
  name: string;
  date: string;
  type?: HolidayType;
  status?: HolidayStatus;
};

export type UpdateHolidayBody = Partial<CreateHolidayBody>;
