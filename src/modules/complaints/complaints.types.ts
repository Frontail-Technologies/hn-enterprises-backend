import type { complaintPriorityEnum, complaintStatusEnum } from "@db/schema";

export type ComplaintPriority = (typeof complaintPriorityEnum.enumValues)[number];
export type ComplaintStatus = (typeof complaintStatusEnum.enumValues)[number];

export type ComplaintListQuery = {
  page?: number | string;
  limit?: number | string;
  customerId?: string;
  supervisorId?: string;
  status?: ComplaintStatus;
  search?: string;
};

export type CreateComplaintBody = {
  customerId: string;
  title: string;
  description: string;
  priority?: ComplaintPriority;
};

export type UpdateComplaintBody = {
  customerId?: string;
  title?: string;
  description?: string;
  priority?: ComplaintPriority;
  status?: ComplaintStatus;
  supervisorRemark?: string;
};
