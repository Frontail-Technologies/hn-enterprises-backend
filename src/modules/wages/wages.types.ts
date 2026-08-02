import type { wageCategoryEnum, wageStatusEnum } from "@db/schema";

export type WageCategory = (typeof wageCategoryEnum.enumValues)[number];
export type WageStatus = (typeof wageStatusEnum.enumValues)[number];

export type WageListQuery = {
  page?: number | string;
  limit?: number | string;
  month?: string;
  plumberId?: string;
  status?: WageStatus;
  category?: WageCategory;
};

export type UpsertWageBody = {
  plumberId: string;
  month: string;
  category: WageCategory;
  wageRate: number;
  daysWorked: number;
  pf?: number;
  esic?: number;
  status?: WageStatus;
  remarks?: string;
};
