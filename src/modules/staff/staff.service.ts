import { and, count, eq, ilike, or } from "drizzle-orm";
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

const staffSelection = {
  id: staff.id,
  userId: staff.userId,
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
    .innerJoin(users, eq(staff.userId, users.id))
    .where(eq(staff.id, id))
    .limit(1);

  if (!row) throw new Error("Staff record not found");
  return row;
}

export const staffService = {
  async list(query: StaffListQuery) {
    const db = getDb();
    const { page, limit, offset } = parsePagination(query);
    const searchPattern = toSearchPattern(query.search);

    const conditions = [
      query.role ? eq(users.role, query.role) : undefined,
      query.status ? eq(users.status, query.status) : undefined,
      searchPattern
        ? or(ilike(users.name, searchPattern), ilike(users.mobile, searchPattern))
        : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select(staffSelection)
        .from(staff)
        .innerJoin(users, eq(staff.userId, users.id))
        .where(where)
        .limit(limit)
        .offset(offset)
        .orderBy(users.name),
      db.select({ value: count() }).from(staff).innerJoin(users, eq(staff.userId, users.id)).where(where),
    ]);

    return { rows, pagination: buildPaginationMeta(page, limit, total) };
  },

  async get(id: string) {
    return getStaffOrThrow(id);
  },

  async create(input: CreateStaffBody, actorId: string, actorRole: UserRole) {
    const db = getDb();

    const newId = await db.transaction(async (tx) => {
      let userId = input.userId;

      if (!userId) {
        if (!input.newUser) throw new Error("Either userId or newUser is required");
        assertCanAssignRole(actorRole, input.newUser.role);
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
            passwordHash: await hashPassword(input.newUser.password),
            role: input.newUser.role,
            status: "active",
            passwordChangedAt: new Date(),
          })
          .returning();
        if (!createdUser) throw new Error("Unable to create user");
        userId = createdUser.id;
      } else {
        const [existingStaff] = await tx.select({ id: staff.id }).from(staff).where(eq(staff.userId, userId)).limit(1);
        if (existingStaff) throw new Error("This user already has a staff record");
      }

      const [staffRow] = await tx
        .insert(staff)
        .values({
          userId,
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

    if (input.user) {
      if (input.user.role) assertCanAssignRole(actorRole, input.user.role);
      const userPatch = cleanObject({
        name: input.user.name,
        mobile: input.user.mobile,
        role: input.user.role,
        status: input.user.status,
      });
      if (Object.keys(userPatch).length) {
        await db.update(users).set({ ...userPatch, updatedAt: new Date() }).where(eq(users.id, existing.userId));
      }
    }

    const patch = cleanObject({
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
};
