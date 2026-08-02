import type { AuthTokenPayload } from "@types";
import type { SetContext } from "@modules/auth/auth.helpers";
import { ok, paginated } from "@utils";
import { announcementsService } from "./announcements.service";
import type { AnnouncementListQuery, CreateAnnouncementBody, UpdateAnnouncementBody } from "./announcements.types";

function statusFromError(error: unknown) {
  if (error instanceof Error && error.message.includes("not found")) return 404;
  return 400;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export const announcementsController = {
  async list({ query, set }: { query: AnnouncementListQuery; set: SetContext }) {
    try {
      const { rows, pagination } = await announcementsService.list(query);
      return paginated(rows, pagination);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to list announcements") };
    }
  },

  async create({
    body,
    currentUser,
    set,
  }: {
    body: CreateAnnouncementBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      set.status = 201;
      return ok(await announcementsService.create(body, currentUser.id), "Announcement created");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to create announcement") };
    }
  },

  async update({
    params,
    body,
    set,
  }: {
    params: { id: string };
    body: UpdateAnnouncementBody;
    set: SetContext;
  }) {
    try {
      return ok(await announcementsService.update(params.id, body), "Announcement updated");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to update announcement") };
    }
  },

  async publish({ params, set }: { params: { id: string }; set: SetContext }) {
    try {
      return ok(await announcementsService.publish(params.id), "Announcement published");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to publish announcement") };
    }
  },
};
