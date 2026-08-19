import { inArray } from "drizzle-orm";
import { getDb } from "@db";
import { notificationCategoryEnum, notifications, pushTokens } from "@db/schema";
import type { NotificationRoutePayload } from "@db/schema";
import { EXPO_ACCESS_TOKEN } from "@constants";

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

// Reported back to the caller instead of swallowed, so a screen like
// Announcements can tell an admin "sent, but push delivery failed" rather
// than silently showing success either way.
export type NotificationQueueResult = {
  notifiedCount: number;
  notifyError?: string;
  pushTokenCount: number;
  pushSuccess: boolean;
  pushError?: string;
};

type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  sound: "default";
  data: {
    notificationId?: string;
    type?: string;
    entityId?: string;
    route?: NotificationRoutePayload;
  };
};

type ExpoPushResult = { success: boolean; error?: string };

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

async function sendExpoPush(messages: ExpoPushMessage[]): Promise<ExpoPushResult> {
  if (!messages.length) return { success: true };

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${EXPO_ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      return { success: false, error: `Expo push API responded with status ${response.status}` };
    }

    const payload = (await response.json().catch(() => null)) as
      | { data?: { status?: string; details?: { error?: string } }[] }
      | null;
    const tickets = payload?.data;
    if (!Array.isArray(tickets)) {
      return { success: false, error: "Expo push API returned an unexpected response" };
    }

    // Tokens Expo reports as no longer registered can never be delivered to
    // again, so drop them instead of retrying.
    const deadTokens = tickets
      .map((ticket, index) =>
        ticket?.status === "error" && ticket?.details?.error === "DeviceNotRegistered"
          ? messages[index]?.to
          : undefined,
      )
      .filter((token): token is string => Boolean(token));

    if (deadTokens.length) {
      await getDb().delete(pushTokens).where(inArray(pushTokens.token, deadTokens));
    }

    const erroredTickets = tickets.filter((ticket) => ticket?.status === "error");
    if (erroredTickets.length) {
      const sample = erroredTickets[0]?.details?.error;
      return {
        success: false,
        error: `${erroredTickets.length} of ${tickets.length} push message(s) failed${sample ? ` (${sample})` : ""}`,
      };
    }

    return { success: true };
  } catch (error) {
    console.error("[notification] Failed to send Expo push", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to reach the push service" };
  }
}

export const notificationService = {
  async queue(input: NotificationInput): Promise<NotificationQueueResult> {
    if (!input.userIds.length) {
      return { notifiedCount: 0, pushTokenCount: 0, pushSuccess: true };
    }

    const db = getDb();

    // The in-app notification list is the first-class record of "this was
    // sent" - a failure here is real and reported, but still doesn't throw,
    // so a push-service hiccup below can't leave the caller (e.g. Announcement
    // publish, which already committed `status: "sent"`) in an inconsistent
    // state where the DB says sent but the API call reports an error.
    let notifiedCount = 0;
    let notifyError: string | undefined;
    let notificationIdByUser = new Map<string, string>();

    try {
      const inserted = await db
        .insert(notifications)
        .values(
          input.userIds.map((userId) => ({
            userId,
            title: input.title,
            message: input.message,
            category: input.category ?? "system",
            sourceType: input.sourceType || null,
            sourceId: input.sourceId || null,
            route: input.route,
          })),
        )
        .returning({ id: notifications.id, userId: notifications.userId });

      notifiedCount = inserted.length;
      notificationIdByUser = new Map(inserted.map((row) => [row.userId, row.id]));
    } catch (error) {
      console.error("[notification] Failed to insert notifications", error);
      notifyError = error instanceof Error ? error.message : "Failed to create notifications";
    }

    const tokenRows = await db
      .select({ token: pushTokens.token, userId: pushTokens.userId })
      .from(pushTokens)
      .where(inArray(pushTokens.userId, input.userIds));

    const messages: ExpoPushMessage[] = tokenRows.map((row) => ({
      to: row.token,
      title: input.title,
      body: input.message,
      sound: "default",
      data: {
        notificationId: notificationIdByUser.get(row.userId),
        type: input.sourceType || undefined,
        entityId: input.sourceId || undefined,
        route: input.route,
      },
    }));

    const pushResult = await sendExpoPush(messages);

    return {
      notifiedCount,
      notifyError,
      pushTokenCount: tokenRows.length,
      pushSuccess: pushResult.success,
      pushError: pushResult.error,
    };
  },
};
