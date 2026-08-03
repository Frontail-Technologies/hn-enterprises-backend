import { t } from "elysia";
import { complaintPriorityEnum, complaintStatusEnum } from "@db/schema";

const complaintPrioritySchema = t.Union(complaintPriorityEnum.enumValues.map((value) => t.Literal(value)));
const complaintStatusSchema = t.Union(complaintStatusEnum.enumValues.map((value) => t.Literal(value)));

export const complaintListQuerySchema = t.Object({
  page: t.Optional(t.String()),
  limit: t.Optional(t.String()),
  customerId: t.Optional(t.String()),
  supervisorId: t.Optional(t.String()),
  status: t.Optional(complaintStatusSchema),
});

export const createComplaintBodySchema = t.Object({
  customerId: t.String({ minLength: 1 }),
  title: t.String({ minLength: 1 }),
  description: t.String({ minLength: 1 }),
  priority: t.Optional(complaintPrioritySchema),
});

export const updateComplaintBodySchema = t.Object({
  customerId: t.Optional(t.String({ minLength: 1 })),
  title: t.Optional(t.String({ minLength: 1 })),
  description: t.Optional(t.String({ minLength: 1 })),
  priority: t.Optional(complaintPrioritySchema),
  status: t.Optional(complaintStatusSchema),
  supervisorRemark: t.Optional(t.String()),
});
