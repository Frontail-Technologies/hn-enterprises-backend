import { and, count, eq, ilike, inArray, or } from "drizzle-orm";
import { getDb } from "@db";
import { users, type userRoleEnum } from "@db/schema";
import {
  assertCanAssignRole,
  assertStrongPassword,
  buildPaginationMeta,
  cleanObject,
  hashPassword,
  parsePagination,
  toSearchPattern,
} from "@utils";
import type { CreateUserBody, ResetPasswordBody, UpdateUserBody, UserListQuery } from "./users.types";

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

function sanitizeUser<T extends { passwordHash: string }>(user: T) {
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}

async function getUserOrThrow(id: string) {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) throw new Error("User not found");
  return user;
}

export const usersService = {
  async list(query: UserListQuery) {
    const db = getDb();
    const roles = parseRoles(query.role);
    const searchPattern = toSearchPattern(query.search);

    const conditions = [
      roles ? inArray(users.role, roles) : undefined,
      query.status ? eq(users.status, query.status) : undefined,
      searchPattern
        ? or(ilike(users.name, searchPattern), ilike(users.username, searchPattern), ilike(users.email, searchPattern))
        : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

    const where = conditions.length ? and(...conditions) : undefined;

    if (query.page == null && query.limit == null) {
      return db
        .select({
          id: users.id,
          name: users.name,
          username: users.username,
          email: users.email,
          mobile: users.mobile,
          role: users.role,
          status: users.status,
          lastLoginAt: users.lastLoginAt,
        })
        .from(users)
        .where(where)
        .orderBy(users.name);
    }

    const { page, limit, offset } = parsePagination(query);
    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select({
          id: users.id,
          name: users.name,
          username: users.username,
          email: users.email,
          mobile: users.mobile,
          role: users.role,
          status: users.status,
          lastLoginAt: users.lastLoginAt,
        })
        .from(users)
        .where(where)
        .limit(limit)
        .offset(offset)
        .orderBy(users.name),
      db.select({ value: count() }).from(users).where(where),
    ]);

    return { rows, pagination: buildPaginationMeta(page, limit, total) };
  },

  async get(id: string) {
    const user = await getUserOrThrow(id);
    return sanitizeUser(user);
  },

  async create(input: CreateUserBody, actorRole: UserRole) {
    assertCanAssignRole(actorRole, input.role);
    assertStrongPassword(input.password);
    const db = getDb();
    const email = input.email.toLowerCase().trim();
    const username = input.username.toLowerCase().trim();

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(or(eq(users.email, email), eq(users.username, username)))
      .limit(1);
    if (existing) throw new Error("A user with this email or username already exists");

    const [user] = await db
      .insert(users)
      .values({
        name: input.name,
        username,
        email,
        mobile: input.mobile || null,
        passwordHash: await hashPassword(input.password),
        role: input.role,
        status: input.status ?? "active",
        passwordChangedAt: new Date(),
      })
      .returning();

    if (!user) throw new Error("Unable to create user");
    return sanitizeUser(user);
  },

  async update(id: string, input: UpdateUserBody, actorRole: UserRole) {
    if (input.role) assertCanAssignRole(actorRole, input.role);
    await getUserOrThrow(id);
    const db = getDb();

    const patch = cleanObject({
      name: input.name,
      mobile: input.mobile,
      role: input.role,
      status: input.status,
    });

    const [user] = await db
      .update(users)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    if (!user) throw new Error("Unable to update user");
    return sanitizeUser(user);
  },

  async resetPassword(id: string, input: ResetPasswordBody) {
    assertStrongPassword(input.password);
    await getUserOrThrow(id);
    const db = getDb();

    const [user] = await db
      .update(users)
      .set({
        passwordHash: await hashPassword(input.password),
        passwordChangedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();

    if (!user) throw new Error("Unable to reset password");
    return sanitizeUser(user);
  },

  async delete(id: string, currentUserId: string) {
    if (id === currentUserId) throw new Error("Cannot delete your own account");
    const db = getDb();
    await getUserOrThrow(id);

    try {
      await db.delete(users).where(eq(users.id, id));
    } catch (error: any) {
      if (error.code === "23503") {
        throw new Error("Cannot delete this user because they have associated records. Please reassign or delete them first.");
      }
      throw error;
    }
  },
};
