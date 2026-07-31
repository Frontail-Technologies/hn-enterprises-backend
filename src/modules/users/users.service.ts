import { inArray } from "drizzle-orm";
import { getDb } from "@db";
import { users, type userRoleEnum } from "@db/schema";
import type { UserListQuery } from "./users.types";

type UserRole = (typeof userRoleEnum.enumValues)[number];

function parseRoles(role?: string): UserRole[] | undefined {
  if (!role) return undefined;
  const allowed = new Set<string>(["super_admin", "admin", "supervisor", "field_executive", "viewer"]);
  const roles = role
    .split(",")
    .map((value) => value.trim())
    .filter((value) => allowed.has(value)) as UserRole[];

  return roles.length ? roles : undefined;
}

export const usersService = {
  async list(query: UserListQuery) {
    const db = getDb();
    const roles = parseRoles(query.role);

    return db
      .select({ id: users.id, name: users.name, role: users.role, status: users.status })
      .from(users)
      .where(roles ? inArray(users.role, roles) : undefined)
      .orderBy(users.name);
  },
};
