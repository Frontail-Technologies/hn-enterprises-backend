import type { announcementStatusEnum } from "@db/schema";

export type AnnouncementStatus = (typeof announcementStatusEnum.enumValues)[number];

export type AnnouncementListQuery = {
  page?: number | string;
  limit?: number | string;
  status?: AnnouncementStatus;
};

export type CreateAnnouncementBody = {
  title: string;
  message: string;
  imageUrl?: string;
  imageFileName?: string;
};

export type UpdateAnnouncementBody = Partial<CreateAnnouncementBody>;
