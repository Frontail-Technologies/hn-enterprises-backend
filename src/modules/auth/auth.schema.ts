import { t } from "elysia";

export const loginBodySchema = t.Object({
  identifier: t.String({ minLength: 1 }),
  password: t.String({ minLength: 1 }),
  clientType: t.Optional(t.Union([t.Literal("admin"), t.Literal("mobile")])),
});

export const changePasswordBodySchema = t.Object({
  currentPassword: t.String({ minLength: 1 }),
  newPassword: t.String({ minLength: 8 }),
});

export const requestPasswordResetBodySchema = t.Object({
  identifier: t.String({ minLength: 1 }),
});

export const resetPasswordBodySchema = t.Object({
  token: t.String({ minLength: 20 }),
  newPassword: t.String({ minLength: 8 }),
});

export type LoginBody = {
  identifier: string;
  password: string;
  clientType?: "admin" | "mobile";
};

export type ChangePasswordBody = {
  currentPassword: string;
  newPassword: string;
};

export type RequestPasswordResetBody = {
  identifier: string;
};

export type ResetPasswordBody = {
  token: string;
  newPassword: string;
};
