import { t } from "elysia";
import { plumberStatusEnum, plumberTypeEnum } from "@db/schema";

const plumberTypeSchema = t.Union(plumberTypeEnum.enumValues.map((value) => t.Literal(value)));
const plumberStatusSchema = t.Union(plumberStatusEnum.enumValues.map((value) => t.Literal(value)));

export const plumberListQuerySchema = t.Object({
  page: t.Optional(t.String()),
  limit: t.Optional(t.String()),
  search: t.Optional(t.String()),
  type: t.Optional(plumberTypeSchema),
  status: t.Optional(plumberStatusSchema),
});

export const createPlumberBodySchema = t.Object({
  name: t.String({ minLength: 1 }),
  type: t.Optional(plumberTypeSchema),
  contactNumber: t.Optional(t.String()),
  status: t.Optional(plumberStatusSchema),
  remarks: t.Optional(t.String()),
});

export const updatePlumberBodySchema = t.Partial(createPlumberBodySchema);
