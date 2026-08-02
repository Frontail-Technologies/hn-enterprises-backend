import { t } from "elysia";
import { announcementStatusEnum } from "@db/schema";

const announcementStatusSchema = t.Union(announcementStatusEnum.enumValues.map((value) => t.Literal(value)));

export const announcementListQuerySchema = t.Object({
  page: t.Optional(t.Number()),
  limit: t.Optional(t.Number()),
  status: t.Optional(announcementStatusSchema),
});

export const createAnnouncementBodySchema = t.Object({
  title: t.String({ minLength: 1 }),
  message: t.String({ minLength: 1 }),
  imageUrl: t.Optional(t.String()),
  imageFileName: t.Optional(t.String()),
});

export const updateAnnouncementBodySchema = t.Partial(createAnnouncementBodySchema);
