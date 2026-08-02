import type { staffPaymentAccountTypeEnum, staffSalaryTypeEnum } from "@db/schema";
import type { UserRole, UserStatus } from "../users/users.types";

export type StaffSalaryType = (typeof staffSalaryTypeEnum.enumValues)[number];
export type StaffPaymentAccountType = (typeof staffPaymentAccountTypeEnum.enumValues)[number];

export type StaffListQuery = {
  page?: number | string;
  limit?: number | string;
  search?: string;
  role?: UserRole;
  status?: UserStatus;
};

export type NewStaffUserInput = {
  name: string;
  email: string;
  username: string;
  mobile?: string;
  role: UserRole;
  password: string;
};

export type CreateStaffBody = {
  userId?: string;
  newUser?: NewStaffUserInput;
  assignedProjectId?: string;
  salaryType?: StaffSalaryType;
  monthlySalary?: number;
  allowance?: number;
  paymentAccountType?: StaffPaymentAccountType;
  bankType?: string;
  bankName?: string;
  accountHolderName?: string;
  accountNumber?: string;
  ifscCode?: string;
  upiType?: string;
  upiId?: string;
  salaryEffectiveFrom?: string;
  lastSalaryRevisionDate?: string;
  nextSalaryReviewDate?: string;
  remarks?: string;
};

export type UpdateStaffUserInput = {
  name?: string;
  mobile?: string;
  role?: UserRole;
  status?: UserStatus;
};

export type UpdateStaffBody = Omit<Partial<CreateStaffBody>, "userId" | "newUser"> & {
  user?: UpdateStaffUserInput;
};
