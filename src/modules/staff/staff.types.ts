import type { staffDesignationEnum, staffPaymentAccountTypeEnum, staffSalaryTypeEnum } from "@db/schema";
import type { UserRole, UserStatus } from "../users/users.types";

export type StaffSalaryType = (typeof staffSalaryTypeEnum.enumValues)[number];
export type StaffDesignation = (typeof staffDesignationEnum.enumValues)[number];
export type StaffPaymentAccountType = (typeof staffPaymentAccountTypeEnum.enumValues)[number];

export type StaffListQuery = {
  page?: number | string;
  limit?: number | string;
  search?: string;
  role?: UserRole;
  designation?: StaffDesignation;
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
  /** Default "supervisor" (needs userId or newUser); others use name/mobile below. */
  designation?: StaffDesignation;
  name?: string;
  mobile?: string;
  avatarUrl?: string;
  status?: UserStatus;
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
  /** Profile photo URL; "" removes it. */
  avatarUrl?: string;
  role?: UserRole;
  status?: UserStatus;
};

export type UpdateStaffBody = Omit<Partial<CreateStaffBody>, "userId" | "newUser" | "name" | "mobile" | "avatarUrl" | "status"> & {
  user?: UpdateStaffUserInput;
};
