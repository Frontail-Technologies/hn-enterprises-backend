import type { plumberCategoryEnum, plumberStatusEnum, plumberTypeEnum } from "@db/schema";

export type PlumberType = (typeof plumberTypeEnum.enumValues)[number];
export type PlumberCategory = (typeof plumberCategoryEnum.enumValues)[number];
export type PlumberStatus = (typeof plumberStatusEnum.enumValues)[number];

export type PlumberListQuery = {
  page?: number | string;
  limit?: number | string;
  search?: string;
  category?: PlumberCategory;
  type?: PlumberType;
  status?: PlumberStatus;
};

export type CreatePlumberBody = {
  name: string;
  category?: PlumberCategory;
  type?: PlumberType;
  contactNumber?: string;
  /** Profile photo URL; "" removes it. */
  avatarUrl?: string;
  status?: PlumberStatus;
  remarks?: string;
};

export type UpdatePlumberBody = Partial<CreatePlumberBody>;
