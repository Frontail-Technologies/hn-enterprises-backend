import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@db";
import { notifications, pushTokens } from "@db/schema";
import type { NotificationListQuery, RegisterPushTokenBody } from "./notifications.types";

export const notificationsService = {
  async list(userId: string, query: NotificationListQuery) {
    const db = getDb();
    const conditions = [
      eq(notifications.userId, userId),
      query.category ? eq(notifications.category, query.category) : undefined,
      query.read === "true" ? eq(notifications.read, true) : undefined,
      query.read === "false" ? eq(notifications.read, false) : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

    return db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt));
  },

  async markRead(id: string, userId: string) {
    const db = getDb();
    const [row] = await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
      .returning();

    if (!row) throw new Error("Notification not found");
    return row;
  },

  async markAllRead(userId: string) {
    const db = getDb();
    await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));

    return { updated: true };
  },
};

export const pushTokensService = {
  async register(userId: string, input: RegisterPushTokenBody) {
    const db = getDb();
    const [row] = await db
      .insert(pushTokens)
      .values({ userId, token: input.token })
      .onConflictDoUpdate({
        target: pushTokens.token,
        set: { userId, updatedAt: new Date() },
      })
      .returning();

    if (!row) throw new Error("Unable to register push token");
    return row;
  },

  async remove(userId: string, input: RegisterPushTokenBody) {
    const db = getDb();
    await db
      .delete(pushTokens)
      .where(and(eq(pushTokens.userId, userId), eq(pushTokens.token, input.token)));
    return { removed: true };
  },
};
