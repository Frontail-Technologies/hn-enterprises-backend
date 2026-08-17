import { and, count, eq, ilike, inArray, or } from "drizzle-orm";
import { getDb } from "@db";
import { users, type userRoleEnum } from "@db/schema";
import {
  assertCanAssignRole,
  assertStrongPassword,
  buildPaginationMeta,
  cleanObject,
  EntityInUseError,
  hashPassword,
  parsePagination,
  toSearchPattern,
} from "@utils";
import { usersDeletionService } from "./users-deletion.service";
import type { CreateUserBody, ResetPasswordBody, UpdateUserBody, UserListQuery } from "./users.types";

type UserRole = (typeof userRoleEnum.enumValues)[number];

function parseRoles(role?: string): UserRole[] | undefined {
  if (!role) return undefined;
  const allowed = new Set<string>(["super_admin", "admin", "supervisor", "viewer"]);
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

  // Delegates to the Delete Impact architecture (users-deletion.service.ts): blocks
  // whenever the user has attendance, a staff/payroll profile, or is the recorded
  // creator/supervisor of complaints, site plans, DPR records, or work progress
  // updates - all of which are `ON DELETE CASCADE` at the DB level and would
  // otherwise be silently destroyed by a raw delete (see that file for the audit).
  async delete(id: string, currentUserId: string) {
    return usersDeletionService.execute(id, currentUserId);
  },

  /**
   * Same self-delete guard as the single-user delete - the actor's own id is
   * silently excluded rather than failing the whole batch. Every other target is
   * checked against the same policy as the single-delete flow (§11: no bulk path
   * bypasses the audited dependency rules) - one blocked user fails the whole
   * batch rather than silently skipping it or risking a partial cascade.
   */
  async bulkDelete(ids: string[], currentUserId: string) {
    const db = getDb();
    const uniqueIds = Array.from(new Set(ids));
    const skippedSelf = uniqueIds.includes(currentUserId);
    const targetIds = uniqueIds.filter((id) => id !== currentUserId);
    if (!targetIds.length) return { count: 0, skippedSelf };

    const existing = await db.select({ id: users.id }).from(users).where(inArray(users.id, targetIds));
    if (!existing.length) return { count: 0, skippedSelf };

    const resolvedIds = existing.map((row) => row.id);
    await db.transaction(async (tx) => {
      for (const id of resolvedIds) {
        const impact = await usersDeletionService.getDeleteImpactWithHandle(tx, id);
        if (!impact.canDelete) {
          throw new EntityInUseError(
            `Some selected users cannot be deleted: "${impact.entity.label}" ${impact.blockers.map((b) => b.reason).join(" ")} Please deactivate them instead.`,
          );
        }
      }
      await tx.delete(users).where(inArray(users.id, resolvedIds));
    });

    return { count: resolvedIds.length, skippedSelf };
  },
};
