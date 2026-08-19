import { and, count, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@db";
import { announcements, users } from "@db/schema";
import { notificationService } from "@services";
import { buildPaginationMeta, cleanObject, parsePagination } from "@utils";
import type { AnnouncementListQuery, CreateAnnouncementBody, UpdateAnnouncementBody } from "./announcements.types";

async function getAnnouncementOrThrow(id: string) {
  const db = getDb();
  const [row] = await db.select().from(announcements).where(eq(announcements.id, id)).limit(1);
  if (!row) throw new Error("Announcement not found");
  return row;
}

export const announcementsService = {
  async list(query: AnnouncementListQuery) {
    const db = getDb();
    const where = query.status ? eq(announcements.status, query.status) : undefined;
    const { page, limit, offset } = parsePagination(query);

    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select()
        .from(announcements)
        .where(where)
        .orderBy(desc(announcements.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ value: count() }).from(announcements).where(where),
    ]);

    return { rows, pagination: buildPaginationMeta(page, limit, total) };
  },

  async create(input: CreateAnnouncementBody, userId: string) {
    const db = getDb();
    const [row] = await db
      .insert(announcements)
      .values({
        title: input.title,
        message: input.message,
        imageUrl: input.imageUrl || null,
        imageFileName: input.imageFileName || null,
        status: "draft",
        createdBy: userId,
      })
      .returning();

    if (!row) throw new Error("Unable to create announcement");
    return row;
  },

  async update(id: string, input: UpdateAnnouncementBody) {
    const existing = await getAnnouncementOrThrow(id);
    if (existing.status !== "draft") throw new Error("Only draft announcements can be edited");

    const db = getDb();
    const patch = cleanObject({
      title: input.title,
      message: input.message,
      imageUrl: input.imageUrl,
      imageFileName: input.imageFileName,
    });

    const [row] = await db
      .update(announcements)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(announcements.id, id))
      .returning();

    if (!row) throw new Error("Unable to update announcement");
    return row;
  },

  async publish(id: string) {
    const existing = await getAnnouncementOrThrow(id);
    if (existing.status === "sent") throw new Error("Announcement already sent");

    const db = getDb();
    const recipients = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "supervisor"), eq(users.status, "active")));

    const [row] = await db
      .update(announcements)
      .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
      .where(eq(announcements.id, id))
      .returning();

    if (!row) throw new Error("Unable to publish announcement");

    const notifyResult = await notificationService.queue({
      userIds: recipients.map((recipient) => recipient.id),
      title: row.title,
      message: row.message,
      category: "system",
      sourceType: "announcement",
      sourceId: row.id,
      imageUrl: row.imageUrl ?? undefined,
      route: { pathname: "/notifications" },
    });

    // The announcement is already committed as "sent" above (it did reach the
    // in-app notification list for however many recipients that succeeded
    // for) - notify/push failures are reported on the result rather than
    // thrown, so the caller can show an accurate "sent, but delivery had
    // issues" state instead of either a false success or a misleading error
    // for an announcement that's actually already sent.
    return {
      ...row,
      recipientCount: recipients.length,
      notifiedCount: notifyResult.notifiedCount,
      notifyError: notifyResult.notifyError,
      pushTokenCount: notifyResult.pushTokenCount,
      pushSuccess: notifyResult.pushSuccess,
      pushError: notifyResult.pushError,
    };
  },

  // Re-sends an already-sent announcement: same recipients, a fresh
  // notification row for each (so it reappears unread in their list) and a
  // fresh push. sentAt is bumped to this run so "Sent On" reflects the most
  // recent push, not the original one.
  async republish(id: string) {
    const existing = await getAnnouncementOrThrow(id);
    if (existing.status !== "sent") throw new Error("Only sent announcements can be re-pushed");

    const db = getDb();
    const recipients = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "supervisor"), eq(users.status, "active")));

    const [row] = await db
      .update(announcements)
      .set({ sentAt: new Date(), updatedAt: new Date() })
      .where(eq(announcements.id, id))
      .returning();

    if (!row) throw new Error("Unable to re-push announcement");

    const notifyResult = await notificationService.queue({
      userIds: recipients.map((recipient) => recipient.id),
      title: row.title,
      message: row.message,
      category: "system",
      sourceType: "announcement",
      sourceId: row.id,
      imageUrl: row.imageUrl ?? undefined,
      route: { pathname: "/notifications" },
    });

    return {
      ...row,
      recipientCount: recipients.length,
      notifiedCount: notifyResult.notifiedCount,
      notifyError: notifyResult.notifyError,
      pushTokenCount: notifyResult.pushTokenCount,
      pushSuccess: notifyResult.pushSuccess,
      pushError: notifyResult.pushError,
    };
  },

  async delete(id: string) {
    const db = getDb();
    await getAnnouncementOrThrow(id); // Ensure it exists
    await db.delete(announcements).where(eq(announcements.id, id));
  },

  async bulkDelete(ids: string[]) {
    const db = getDb();
    const uniqueIds = Array.from(new Set(ids));
    const existing = await db.select({ id: announcements.id }).from(announcements).where(inArray(announcements.id, uniqueIds));
    if (!existing.length) return { count: 0 };

    const resolvedIds = existing.map((row) => row.id);
    await db.delete(announcements).where(inArray(announcements.id, resolvedIds));
    return { count: resolvedIds.length };
  },
};
