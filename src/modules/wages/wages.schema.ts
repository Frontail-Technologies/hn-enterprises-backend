import { t } from "elysia";
import { wageCategoryEnum, wageStatusEnum } from "@db/schema";

const wageCategorySchema = t.Union(wageCategoryEnum.enumValues.map((value) => t.Literal(value)));
const wageStatusSchema = t.Union(wageStatusEnum.enumValues.map((value) => t.Literal(value)));

export const wageListQuerySchema = t.Object({
  page: t.Optional(t.String()),
  limit: t.Optional(t.String()),
  month: t.Optional(t.String()),
  plumberId: t.Optional(t.String()),
  status: t.Optional(wageStatusSchema),
  category: t.Optional(wageCategorySchema),
});

export const upsertWageBodySchema = t.Object({
  plumberId: t.String({ minLength: 1 }),
  month: t.String({ minLength: 1 }),
  category: wageCategorySchema,
  wageRate: t.Number(),
  daysWorked: t.Number(),
  pf: t.Optional(t.Number()),
  esic: t.Optional(t.Number()),
  status: t.Optional(wageStatusSchema),
  remarks: t.Optional(t.String()),
});
