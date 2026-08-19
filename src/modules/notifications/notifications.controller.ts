import type { AuthTokenPayload } from "@types";
import type { SetContext } from "@modules/auth/auth.helpers";
import { errorMessage, ok, statusFromError } from "@utils";
import { notificationsService, pushTokensService } from "./notifications.service";
import type { NotificationListQuery, RegisterPushTokenBody } from "./notifications.types";

export const notificationsController = {
  async list({
    query,
    currentUser,
    set,
  }: {
    query: NotificationListQuery;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      return ok(await notificationsService.list(currentUser.id, query));
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to list notifications") };
    }
  },

  async markRead({
    params,
    currentUser,
    set,
  }: {
    params: { id: string };
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      return ok(await notificationsService.markRead(params.id, currentUser.id), "Notification marked as read");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to mark notification as read") };
    }
  },

  async markAllRead({ currentUser, set }: { currentUser: AuthTokenPayload | null; set: SetContext }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      return ok(await notificationsService.markAllRead(currentUser.id), "All notifications marked as read");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to mark notifications as read") };
    }
  },

  async remove({
    params,
    currentUser,
    set,
  }: {
    params: { id: string };
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      return ok(await notificationsService.remove(params.id, currentUser.id), "Notification deleted");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to delete notification") };
    }
  },
};

export const pushTokensController = {
  async register({
    body,
    currentUser,
    set,
  }: {
    body: RegisterPushTokenBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      set.status = 201;
      return ok(await pushTokensService.register(currentUser.id, body), "Push token registered");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to register push token") };
    }
  },

  async remove({
    body,
    currentUser,
    set,
  }: {
    body: RegisterPushTokenBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      return ok(await pushTokensService.remove(currentUser.id, body), "Push token removed");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to remove push token") };
    }
  },
};
