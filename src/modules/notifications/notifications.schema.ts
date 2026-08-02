import { t } from "elysia";
import { notificationCategoryEnum } from "@db/schema";

const notificationCategorySchema = t.Union(notificationCategoryEnum.enumValues.map((value) => t.Literal(value)));

export const notificationListQuerySchema = t.Object({
  category: t.Optional(notificationCategorySchema),
  read: t.Optional(t.String()),
});

export const registerPushTokenBodySchema = t.Object({
  token: t.String({ minLength: 1 }),
});
