import { inArray } from "drizzle-orm";
import { getDb } from "@db";
import { notificationCategoryEnum, notifications, pushTokens } from "@db/schema";
import type { NotificationRoutePayload } from "@db/schema";

type NotificationCategory = (typeof notificationCategoryEnum.enumValues)[number];

type NotificationInput = {
  userIds: string[];
  title: string;
  message: string;
  category?: NotificationCategory;
  sourceType?: string;
  sourceId?: string;
  route?: NotificationRoutePayload;
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

async function sendExpoPush(tokens: string[], title: string, message: string) {
  if (!tokens.length) return;

  try {
    await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(
        tokens.map((token) => ({
          to: token,
          title,
          body: message,
          sound: "default",
        })),
      ),
    });
  } catch (error) {
    console.error("[notification] Failed to send Expo push", error);
  }
}

export const notificationService = {
  async queue(input: NotificationInput) {
    if (!input.userIds.length) return;

    try {
      const db = getDb();
      await db.insert(notifications).values(
        input.userIds.map((userId) => ({
          userId,
          title: input.title,
          message: input.message,
          category: input.category ?? "system",
          sourceType: input.sourceType || null,
          sourceId: input.sourceId || null,
          route: input.route,
        })),
      );

      const tokenRows = await db
        .select({ token: pushTokens.token })
        .from(pushTokens)
        .where(inArray(pushTokens.userId, input.userIds));

      await sendExpoPush(
        tokenRows.map((row) => row.token),
        input.title,
        input.message,
      );
    } catch (error) {
      console.error("[notification] Failed to queue notification", error);
    }
  },
};
