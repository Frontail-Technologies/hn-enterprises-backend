import type { notificationCategoryEnum } from "@db/schema";

export type NotificationCategory = (typeof notificationCategoryEnum.enumValues)[number];

export type NotificationListQuery = {
  category?: NotificationCategory;
  read?: string;
};

export type RegisterPushTokenBody = {
  token: string;
};
