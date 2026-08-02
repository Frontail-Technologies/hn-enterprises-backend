import { t } from "elysia";
import { userRoleEnum, userStatusEnum } from "@db/schema";

const userRoleSchema = t.Union(userRoleEnum.enumValues.map((value) => t.Literal(value)));
const userStatusSchema = t.Union(userStatusEnum.enumValues.map((value) => t.Literal(value)));

export const userListQuerySchema = t.Object({
  page: t.Optional(t.String()),
  limit: t.Optional(t.String()),
  search: t.Optional(t.String()),
  role: t.Optional(t.String()),
  status: t.Optional(userStatusSchema),
});

export const createUserBodySchema = t.Object({
  name: t.String({ minLength: 1 }),
  username: t.String({ minLength: 1 }),
  email: t.String({ minLength: 1 }),
  mobile: t.Optional(t.String()),
  role: userRoleSchema,
  status: t.Optional(userStatusSchema),
  password: t.String({ minLength: 8 }),
});

export const updateUserBodySchema = t.Object({
  name: t.Optional(t.String({ minLength: 1 })),
  mobile: t.Optional(t.String()),
  role: t.Optional(userRoleSchema),
  status: t.Optional(userStatusSchema),
});

export const resetPasswordBodySchema = t.Object({
  password: t.String({ minLength: 8 }),
});
