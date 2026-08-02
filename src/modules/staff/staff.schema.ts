import { t } from "elysia";
import { staffPaymentAccountTypeEnum, staffSalaryTypeEnum, userRoleEnum, userStatusEnum } from "@db/schema";

const userRoleSchema = t.Union(userRoleEnum.enumValues.map((value) => t.Literal(value)));
const userStatusSchema = t.Union(userStatusEnum.enumValues.map((value) => t.Literal(value)));
const salaryTypeSchema = t.Union(staffSalaryTypeEnum.enumValues.map((value) => t.Literal(value)));
const paymentAccountTypeSchema = t.Union(staffPaymentAccountTypeEnum.enumValues.map((value) => t.Literal(value)));

export const staffListQuerySchema = t.Object({
  page: t.Optional(t.String()),
  limit: t.Optional(t.String()),
  search: t.Optional(t.String()),
  role: t.Optional(userRoleSchema),
  status: t.Optional(userStatusSchema),
});

const newStaffUserSchema = t.Object({
  name: t.String({ minLength: 1 }),
  email: t.String({ minLength: 1 }),
  username: t.String({ minLength: 1 }),
  mobile: t.Optional(t.String()),
  role: userRoleSchema,
  password: t.String({ minLength: 8 }),
});

const staffPayrollFieldsSchema = t.Object({
  assignedProjectId: t.Optional(t.String()),
  salaryType: t.Optional(salaryTypeSchema),
  monthlySalary: t.Optional(t.Number()),
  allowance: t.Optional(t.Number()),
  paymentAccountType: t.Optional(paymentAccountTypeSchema),
  bankType: t.Optional(t.String()),
  bankName: t.Optional(t.String()),
  accountHolderName: t.Optional(t.String()),
  accountNumber: t.Optional(t.String()),
  ifscCode: t.Optional(t.String()),
  upiType: t.Optional(t.String()),
  upiId: t.Optional(t.String()),
  salaryEffectiveFrom: t.Optional(t.String()),
  lastSalaryRevisionDate: t.Optional(t.String()),
  nextSalaryReviewDate: t.Optional(t.String()),
  remarks: t.Optional(t.String()),
});

export const createStaffBodySchema = t.Composite([
  t.Object({
    userId: t.Optional(t.String()),
    newUser: t.Optional(newStaffUserSchema),
  }),
  staffPayrollFieldsSchema,
]);

export const updateStaffBodySchema = t.Composite([
  t.Object({
    user: t.Optional(
      t.Object({
        name: t.Optional(t.String({ minLength: 1 })),
        mobile: t.Optional(t.String()),
        role: t.Optional(userRoleSchema),
        status: t.Optional(userStatusSchema),
      }),
    ),
  }),
  t.Partial(staffPayrollFieldsSchema),
]);
