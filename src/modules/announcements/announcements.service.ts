import { and, count, desc, eq } from "drizzle-orm";
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

    await notificationService.queue({
      userIds: recipients.map((recipient) => recipient.id),
      title: row.title,
      message: row.message,
      category: "system",
      sourceType: "announcement",
      sourceId: row.id,
      route: { pathname: "/notifications" },
    });

    return row;
  },
};
