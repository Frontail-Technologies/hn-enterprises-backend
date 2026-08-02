import type { userRoleEnum, userStatusEnum } from "@db/schema";

export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type UserStatus = (typeof userStatusEnum.enumValues)[number];

export type UserListQuery = {
  page?: number | string;
  limit?: number | string;
  search?: string;
  role?: string;
  status?: UserStatus;
};

export type CreateUserBody = {
  name: string;
  username: string;
  email: string;
  mobile?: string;
  role: UserRole;
  status?: UserStatus;
  password: string;
};

export type UpdateUserBody = {
  name?: string;
  mobile?: string;
  role?: UserRole;
  status?: UserStatus;
};

export type ResetPasswordBody = {
  password: string;
};
