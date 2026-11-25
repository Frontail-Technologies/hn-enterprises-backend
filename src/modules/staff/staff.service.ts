import { and, count, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@db";
import { staff, users } from "@db/schema";
import {
  assertCanAssignRole,
  assertStrongPassword,
  buildPaginationMeta,
  cleanObject,
  hashPassword,
  parsePagination,
  toSearchPattern,
} from "@utils";
import type { UserRole } from "@types";
import type { CreateStaffBody, StaffListQuery, UpdateStaffBody } from "./staff.types";
import { forgetAuthUser } from "@plugins";

const staffName = sql<string>`coalesce(${users.name}, ${staff.name}, '')`;
const staffMobile = sql<string | null>`coalesce(${users.mobile}, ${staff.mobile})`;
const staffStatus = sql<string>`coalesce(${users.status}::text, ${staff.status}::text)`;

const staffSelection = {
  id: staff.id,
  userId: staff.userId,
  designation: staff.designation,
  /** Resolved from the login account for supervisors, from the staff row otherwise. */
  name: staffName,
  mobile: staffMobile,
  avatarUrl: sql<string | null>`coalesce(${users.avatarUrl}, ${staff.avatarUrl})`,
  status: staffStatus,
  assignedProjectId: staff.assignedProjectId,
  salaryType: staff.salaryType,
  monthlySalary: staff.monthlySalary,
  allowance: staff.allowance,
  paymentAccountType: staff.paymentAccountType,
  bankType: staff.bankType,
  bankName: staff.bankName,
  accountHolderName: staff.accountHolderName,
  accountNumber: staff.accountNumber,
  ifscCode: staff.ifscCode,
  upiType: staff.upiType,
  upiId: staff.upiId,
  salaryEffectiveFrom: staff.salaryEffectiveFrom,
  lastSalaryRevisionDate: staff.lastSalaryRevisionDate,
  nextSalaryReviewDate: staff.nextSalaryReviewDate,
  remarks: staff.remarks,
  createdAt: staff.createdAt,
  updatedAt: staff.updatedAt,
  user: {
    id: users.id,
    name: users.name,
    username: users.username,
    email: users.email,
    mobile: users.mobile,
    avatarUrl: users.avatarUrl,
    role: users.role,
    status: users.status,
    lastLoginAt: users.lastLoginAt,
  },
};

async function getStaffOrThrow(id: string) {
  const db = getDb();
  const [row] = await db
    .select(staffSelection)
    .from(staff)
    .leftJoin(users, eq(staff.userId, users.id))
    .where(eq(staff.id, id))
    .limit(1);

  if (!row) throw new Error("Staff record not found");
  return row;
}

function payrollValues(input: CreateStaffBody) {
  return {
    assignedProjectId: input.assignedProjectId || null,
    salaryType: input.salaryType ?? "monthly",
    monthlySalary: String(input.monthlySalary ?? 0),
    allowance: String(input.allowance ?? 0),
    paymentAccountType: input.paymentAccountType ?? "bank_account",
    bankType: input.bankType || null,
    bankName: input.bankName || null,
    accountHolderName: input.accountHolderName || null,
    accountNumber: input.accountNumber || null,
    ifscCode: input.ifscCode || null,
    upiType: input.upiType || null,
    upiId: input.upiId || null,
    salaryEffectiveFrom: input.salaryEffectiveFrom ? new Date(input.salaryEffectiveFrom) : null,
    lastSalaryRevisionDate: input.lastSalaryRevisionDate ? new Date(input.lastSalaryRevisionDate) : null,
    nextSalaryReviewDate: input.nextSalaryReviewDate ? new Date(input.nextSalaryReviewDate) : null,
    remarks: input.remarks || null,
  };
}

export const staffService = {
  async list(query: StaffListQuery) {
    const db = getDb();
    const { page, limit, offset } = parsePagination(query, 1000); // pickers load the whole roster
    const searchPattern = toSearchPattern(query.search);

    const conditions = [
      query.role ? eq(users.role, query.role) : undefined,
      query.designation ? eq(staff.designation, query.designation) : undefined,
      query.status ? sql`${staffStatus} = ${query.status}` : undefined,
      searchPattern ? or(ilike(staffName, searchPattern), ilike(staffMobile, searchPattern)) : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select(staffSelection)
        .from(staff)
        .leftJoin(users, eq(staff.userId, users.id))
        .where(where)
        .limit(limit)
        .offset(offset)
        .orderBy(staffName),
      db.select({ value: count() }).from(staff).leftJoin(users, eq(staff.userId, users.id)).where(where),
    ]);

    return { rows, pagination: buildPaginationMeta(page, limit, total) };
  },

  async get(id: string) {
    return getStaffOrThrow(id);
  },

  async create(input: CreateStaffBody, actorId: string, actorRole: UserRole) {
    const db = getDb();

    const designation = input.designation ?? "supervisor";
    if (designation !== "supervisor") {
      // Staff without app access: no login account, details live on the staff row.
      const name = input.name?.trim();
      if (!name) throw new Error("Name is required");
      const [row] = await db
        .insert(staff)
        .values({
          ...payrollValues(input),
          designation,
          name,
          mobile: input.mobile?.trim() || null,
          avatarUrl: input.avatarUrl || null,
          status: input.status ?? "active",
          createdBy: actorId,
          updatedBy: actorId,
        })
        .returning({ id: staff.id });
      if (!row) throw new Error("Unable to create staff record");
      return getStaffOrThrow(row.id);
    }

    const newId = await db.transaction(async (tx) => {
      let userId = input.userId;

      if (!userId) {
        if (!input.newUser) throw new Error("Either userId or newUser is required");
        assertStrongPassword(input.newUser.password);
        const email = input.newUser.email.toLowerCase().trim();
        const username = input.newUser.username.toLowerCase().trim();

        const [existingUser] = await tx
          .select({ id: users.id })
          .from(users)
          .where(or(eq(users.email, email), eq(users.username, username)))
          .limit(1);
        if (existingUser) throw new Error("A user with this email or username already exists");

        const [createdUser] = await tx
          .insert(users)
          .values({
            name: input.newUser.name,
            username,
            email,
            mobile: input.newUser.mobile || null,
            avatarUrl: input.avatarUrl || null,
            passwordHash: await hashPassword(input.newUser.password),
            role: "supervisor",
            status: "active",
            passwordChangedAt: new Date(),
          })
          .returning();
        if (!createdUser) throw new Error("Unable to create user");
        userId = createdUser.id;
      } else {
        const [existingStaff] = await tx.select({ id: staff.id }).from(staff).where(eq(staff.userId, userId)).limit(1);
        if (existingStaff) throw new Error("This user already has a staff record");

        const [linkUser] = await tx.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
        if (!linkUser) throw new Error("User not found");
        if (linkUser.role !== "supervisor") throw new Error("Only supervisor accounts can be linked as staff");
        // A photo picked while linking replaces the account's photo.
        if (input.avatarUrl) await tx.update(users).set({ avatarUrl: input.avatarUrl, updatedAt: new Date() }).where(eq(users.id, userId));
      }

      const [staffRow] = await tx
        .insert(staff)
        .values({
          ...payrollValues(input),
          userId,
          designation: "supervisor",
          createdBy: actorId,
          updatedBy: actorId,
        })
        .returning();

      if (!staffRow) throw new Error("Unable to create staff record");
      return staffRow.id;
    });

    return getStaffOrThrow(newId);
  },

  async update(id: string, input: UpdateStaffBody, actorId: string, actorRole: UserRole) {
    const existing = await getStaffOrThrow(id);
    const db = getDb();

    if (input.designation && input.designation !== existing.designation) {
      // Supervisors are login accounts; the others have none, so a record can't switch between the two.
      if (existing.userId || input.designation === "supervisor") {
        throw new Error("A supervisor can't be changed to another designation (or back). Add a new staff member instead.");
      }
    }

    if (input.user && !existing.userId) {
      const own = input.user;
      if (own.name !== undefined && !own.name.trim()) throw new Error("Name is required");
      await db
        .update(staff)
        .set({
          ...(own.name !== undefined ? { name: own.name.trim() } : {}),
          ...(own.mobile !== undefined ? { mobile: own.mobile.trim() || null } : {}),
          ...(own.avatarUrl !== undefined ? { avatarUrl: own.avatarUrl || null } : {}),
          ...(own.status ? { status: own.status } : {}),
        })
        .where(eq(staff.id, id));
    } else if (input.user && existing.userId) {
      const userId = existing.userId;
      if (input.user.role) assertCanAssignRole(actorRole, input.user.role);
      const userPatch = {
        ...cleanObject({
          name: input.user.name,
          mobile: input.user.mobile,
          role: input.user.role,
          status: input.user.status,
        }),
        // cleanObject drops "" and null, so the photo is handled explicitly: "" removes it.
        ...(input.user.avatarUrl !== undefined ? { avatarUrl: input.user.avatarUrl || null } : {}),
      };
      if (Object.keys(userPatch).length) {
        await db.update(users).set({ ...userPatch, updatedAt: new Date() }).where(eq(users.id, userId));
        forgetAuthUser(userId);
      }
    }

    const patch = cleanObject({
      designation: existing.userId ? undefined : input.designation,
      assignedProjectId: input.assignedProjectId,
      salaryType: input.salaryType,
      monthlySalary: input.monthlySalary != null ? String(input.monthlySalary) : undefined,
      allowance: input.allowance != null ? String(input.allowance) : undefined,
      paymentAccountType: input.paymentAccountType,
      bankType: input.bankType,
      bankName: input.bankName,
      accountHolderName: input.accountHolderName,
      accountNumber: input.accountNumber,
      ifscCode: input.ifscCode,
      upiType: input.upiType,
      upiId: input.upiId,
      salaryEffectiveFrom: input.salaryEffectiveFrom ? new Date(input.salaryEffectiveFrom) : undefined,
      lastSalaryRevisionDate: input.lastSalaryRevisionDate ? new Date(input.lastSalaryRevisionDate) : undefined,
      nextSalaryReviewDate: input.nextSalaryReviewDate ? new Date(input.nextSalaryReviewDate) : undefined,
      remarks: input.remarks,
    });

    await db
      .update(staff)
      .set({ ...patch, updatedBy: actorId, updatedAt: new Date() })
      .where(eq(staff.id, id));

    return getStaffOrThrow(id);
  },

  /**
   * Delete staff without a login. Supervisors (login accounts) are deleted
   * through the user hard-delete workflow, keyed by staff.userId (see below).
   */
  async remove(id: string) {
    const existing = await getStaffOrThrow(id);
    if (existing.userId) throw new Error("Supervisors are deleted with their login account");
    await getDb().delete(staff).where(eq(staff.id, id));
    return { id, name: existing.name };
  },

  async bulkRemove(ids: string[]) {
    const unique = Array.from(new Set(ids));
    if (!unique.length) return { count: 0 };
    const rows = await getDb()
      .delete(staff)
      .where(and(inArray(staff.id, unique), isNull(staff.userId)))
      .returning({ id: staff.id });
    return { count: rows.length };
  },

  // No delete/bulkDelete here anymore - deleting a staff-linked supervisor
  // goes through the canonical user hard-delete workflow
  // (usersDeletionService.execute / usersService.bulkDelete), keyed by
  // staff.userId. staff.userId is ON DELETE CASCADE, so the staff row is
  // removed automatically when the user is hard-deleted. See
  // remove-staff-block brief §8.
};
