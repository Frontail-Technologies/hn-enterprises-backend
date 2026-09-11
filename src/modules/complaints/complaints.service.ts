import { and, count, desc, eq, ilike, ne, or } from "drizzle-orm";
import { getDb } from "@db";
import { complaints, customers, staff, users } from "@db/schema";
import { notificationService } from "@services";
import { activityService } from "@modules/activity/activity.service";
import { humanizeToken } from "@modules/activity/activity.catalog";
import type { AuthTokenPayload } from "@types";
import { buildPaginationMeta, cleanObject, parsePagination, toSearchPattern } from "@utils";
import type { ComplaintListQuery, CreateComplaintBody, UpdateComplaintBody } from "./complaints.types";

async function getComplaintOrThrow(id: string) {
  const db = getDb();
  const complaint = await db.query.complaints.findFirst({
    where: eq(complaints.id, id),
    with: { customer: true },
  });
  if (!complaint) throw new Error("Complaint not found");
  return complaint;
}

const RESOLVED_STATUSES = new Set(["resolved", "closed"]);

/**
 * Customers no longer carry a fixed/assigned supervisor field (R1), and
 * complaints have no per-complaint assignment concept either - so there is
 * no reliable "the relevant supervisor(s) for this complaint" to scope to.
 * Complaint notifications therefore go to every active supervisor (i.e.
 * every mobile-app user), matching the same broadcast pattern used for
 * announcements. excludeUserId drops the acting user so an action never
 * notifies its own actor.
 */
async function resolveComplaintRecipients(excludeUserId?: string): Promise<string[]> {
  const db = getDb();
  const conditions = [eq(users.role, "supervisor"), eq(users.status, "active")];
  if (excludeUserId) conditions.push(ne(users.id, excludeUserId));

  const rows = await db.select({ id: users.id }).from(users).where(and(...conditions));
  return rows.map((row) => row.id);
}

function complaintAuthorized(currentUser: AuthTokenPayload) {
  return currentUser.role === "super_admin" || currentUser.role === "admin" || currentUser.role === "supervisor";
}

/**
 * Single notification-sending path shared by the automatic
 * create/status-change notifications and the manual "Push notification"
 * admin action - so recipient resolution and the queue payload shape never
 * drift between the two call sites. Never claims success when nobody was
 * actually notified.
 */
async function notifyComplaintRecipients(params: {
  complaintId: string;
  customerId: string;
  title: string;
  message: string;
  excludeUserId?: string;
}): Promise<{ recipientCount: number }> {
  const recipients = await resolveComplaintRecipients(params.excludeUserId);
  if (!recipients.length) return { recipientCount: 0 };

  await notificationService.queue({
    userIds: recipients,
    title: params.title,
    message: params.message,
    category: "work",
    sourceType: "complaint",
    sourceId: params.complaintId,
    // Tapping the notification opens the customer it's about, not the bare
    // complaints list, so the recipient lands on the relevant context.
    route: { pathname: "/customers/[id]", params: { id: params.customerId } },
  });

  return { recipientCount: recipients.length };
}

/**
 * "My complaints" for a supervisor now means complaints for customers in
 * whichever project that supervisor is CURRENTLY assigned to (staff.assignedProjectId),
 * not a stored per-customer owner. Returns undefined (no scoping) if the
 * given user has no current project assignment.
 */
async function resolveAssignedProjectId(supervisorUserId: string): Promise<string | undefined> {
  const db = getDb();
  const row = await db.query.staff.findFirst({
    where: eq(staff.userId, supervisorUserId),
    columns: { assignedProjectId: true },
  });
  return row?.assignedProjectId ?? undefined;
}

export const complaintsService = {
  async list(query: ComplaintListQuery) {
    const db = getDb();
    const { page, limit, offset } = parsePagination(query);

    const searchPattern = toSearchPattern(query.search);
    // A requested supervisorId that resolves to no current project assignment
    // must scope to nothing - never silently fall through to "no filter".
    const supervisorScope = query.supervisorId
      ? eq(customers.projectId, (await resolveAssignedProjectId(query.supervisorId)) ?? "00000000-0000-0000-0000-000000000000")
      : undefined;

    const conditions = [
      query.customerId ? eq(complaints.customerId, query.customerId) : undefined,
      supervisorScope,
      query.status ? eq(complaints.status, query.status) : undefined,
      searchPattern
        ? or(
            ilike(complaints.title, searchPattern),
            ilike(complaints.description, searchPattern),
            ilike(customers.customerName, searchPattern),
          )
        : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

    const where = conditions.length ? and(...conditions) : undefined;

    const selection = {
      id: complaints.id,
      customerId: complaints.customerId,
      customer: {
        id: customers.id,
        name: customers.customerName,
        trBpNumber: customers.trBpNumber,
        mobileNumber: customers.mobileNumber,
      },
      title: complaints.title,
      description: complaints.description,
      priority: complaints.priority,
      status: complaints.status,
      supervisorRemark: complaints.supervisorRemark,
      resolvedAt: complaints.resolvedAt,
      createdAt: complaints.createdAt,
    };

    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select(selection)
        .from(complaints)
        .leftJoin(customers, eq(complaints.customerId, customers.id))
        .where(where)
        .orderBy(desc(complaints.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ value: count() })
        .from(complaints)
        .leftJoin(customers, eq(complaints.customerId, customers.id))
        .where(where),
    ]);

    return { rows, pagination: buildPaginationMeta(page, limit, total) };
  },

  async statusCounts(query: { supervisorId?: string }) {
    const db = getDb();
    const where = query.supervisorId
      ? eq(customers.projectId, (await resolveAssignedProjectId(query.supervisorId)) ?? "00000000-0000-0000-0000-000000000000")
      : undefined;

    const rows = await db
      .select({ status: complaints.status, value: count() })
      .from(complaints)
      .leftJoin(customers, eq(complaints.customerId, customers.id))
      .where(where)
      .groupBy(complaints.status);

    const counts: Record<(typeof rows)[number]["status"], number> = {
      open: 0,
      in_progress: 0,
      resolved: 0,
      closed: 0,
    };
    for (const row of rows) counts[row.status] = row.value;
    return counts;
  },

  async create(input: CreateComplaintBody, adminId: string) {
    const db = getDb();
    // Immutable creator snapshot (safe-hard-delete brief §5) - survives a hard-deleted admin/supervisor.
    const [creator] = await db.select({ name: users.name }).from(users).where(eq(users.id, adminId)).limit(1);
    const [complaint] = await db
      .insert(complaints)
      .values({
        customerId: input.customerId,
        createdByAdminId: adminId,
        createdByName: creator?.name ?? null,
        title: input.title,
        description: input.description,
        priority: input.priority ?? "medium",
        status: "open",
      })
      .returning();

    if (!complaint) throw new Error("Unable to create complaint");

    const customer = await db.query.customers.findFirst({
      where: eq(customers.id, complaint.customerId),
      columns: { customerName: true, projectId: true },
    });

    await notifyComplaintRecipients({
      complaintId: complaint.id,
      customerId: complaint.customerId,
      title: "New complaint",
      message: `Complaint added for ${customer?.customerName ?? "customer"}`,
      excludeUserId: adminId,
    });

    await activityService.record({
      type: "complaint",
      action: "complaint.created",
      actorId: adminId,
      customerId: complaint.customerId,
      projectId: customer?.projectId ?? null,
      entityType: "complaint",
      entityId: complaint.id,
      sourceType: "complaint",
      sourceId: complaint.id,
      title: "Complaint created",
      description: `${complaint.title} · ${humanizeToken(complaint.priority)} priority`,
      metadata: { priority: complaint.priority, status: complaint.status },
      occurredAt: complaint.createdAt,
    });

    return complaint;
  },

  async update(id: string, input: UpdateComplaintBody, currentUser: AuthTokenPayload) {
    const existing = await getComplaintOrThrow(id);
    const db = getDb();
    const isAdmin = currentUser.role === "super_admin" || currentUser.role === "admin";

    if (!complaintAuthorized(currentUser)) {
      throw new Error("Not authorized to update this complaint");
    }

    const patch = isAdmin
      ? cleanObject({
          customerId: input.customerId,
          title: input.title,
          description: input.description,
          priority: input.priority,
          status: input.status,
          supervisorRemark: input.supervisorRemark,
        })
      : cleanObject({
          status: input.status,
          supervisorRemark: input.supervisorRemark,
        });

    const nextStatus = "status" in patch ? patch.status : undefined;

    const [complaint] = await db
      .update(complaints)
      .set({
        ...patch,
        ...(nextStatus
          ? { resolvedAt: RESOLVED_STATUSES.has(nextStatus) ? new Date() : null }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(complaints.id, id))
      .returning();

    if (!complaint) throw new Error("Unable to update complaint");

    const statusChanged = input.status !== undefined && input.status !== existing.status;
    const priorityChanged = input.priority !== undefined && input.priority !== existing.priority;
    if (statusChanged || priorityChanged) {
      const customerName = existing.customer?.customerName ?? "customer";
      const title = statusChanged
        ? RESOLVED_STATUSES.has(complaint.status)
          ? "Complaint resolved"
          : existing.status === "resolved" || existing.status === "closed"
            ? "Complaint reopened"
            : "Complaint status changed"
        : "Complaint priority changed";
      await notifyComplaintRecipients({
        complaintId: complaint.id,
        customerId: complaint.customerId,
        title,
        message: `${title} for ${customerName}`,
        excludeUserId: currentUser.id,
      });

      const action = statusChanged
        ? RESOLVED_STATUSES.has(complaint.status)
          ? "complaint.resolved"
          : existing.status === "resolved" || existing.status === "closed"
            ? "complaint.reopened"
            : "complaint.status_changed"
        : "complaint.priority_changed";
      await activityService.record({
        type: "complaint",
        action,
        actorId: currentUser.id,
        customerId: complaint.customerId,
        projectId: existing.customer?.projectId ?? null,
        entityType: "complaint",
        entityId: complaint.id,
        sourceType: "complaint",
        sourceId: complaint.id,
        title,
        description: `${title} for ${customerName}`,
        metadata: {
          priority: complaint.priority,
          status: complaint.status,
          previousStatus: statusChanged ? existing.status : undefined,
          previousPriority: priorityChanged ? existing.priority : undefined,
        },
        occurredAt: complaint.updatedAt,
      });
    }

    return complaint;
  },

  /**
   * Manual admin "Push notification" action (R6-R12) - reuses the exact
   * same recipient-resolution and notification-queueing path as the
   * automatic create/status-change notifications. Intentionally allowed
   * even if an automatic push already went out - this is a deliberate
   * admin re-notification, not deduplicated against prior sends.
   */
  async push(id: string, currentUser: AuthTokenPayload) {
    if (!complaintAuthorized(currentUser)) {
      throw new Error("Not authorized to push notifications for this complaint");
    }

    const complaint = await getComplaintOrThrow(id);
    const customerName = complaint.customer?.customerName ?? "customer";
    const trBpNumber = complaint.customer?.trBpNumber;
    const summary = complaint.title || "Complaint";
    const message = `${summary} — ${customerName}${trBpNumber ? ` (${trBpNumber})` : ""}`;

    const { recipientCount } = await notifyComplaintRecipients({
      complaintId: complaint.id,
      customerId: complaint.customerId,
      title: "Complaint notification",
      message,
      excludeUserId: currentUser.id,
    });

    if (recipientCount === 0) {
      return {
        sent: false,
        recipientCount: 0,
        message: "No active supervisor accounts exist to notify.",
      };
    }

    return { sent: true, recipientCount, message: "Complaint notification sent" };
  },

  async delete(id: string) {
    const db = getDb();
    await getComplaintOrThrow(id);
    await db.delete(complaints).where(eq(complaints.id, id));
  },
};
