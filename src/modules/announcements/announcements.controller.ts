import type { AuthTokenPayload } from "@types";
import type { SetContext } from "@modules/auth/auth.helpers";
import { uploadService } from "@services";
import { errorMessage, ok, paginated, statusFromError } from "@utils";
import { announcementsService } from "./announcements.service";
import type { AnnouncementListQuery, CreateAnnouncementBody, UpdateAnnouncementBody } from "./announcements.types";

// The image arrives embedded in the same request as the title/message
// (mobile/web) instead of via a separate /uploads call beforehand.
async function resolveAnnouncementImage<T extends { file?: File; imageUrl?: string; imageFileName?: string }>(
  body: T,
  uploadedBy: string,
): Promise<Omit<T, "file">> {
  const { file, ...rest } = body;
  if (!file) return rest;

  const stored = await uploadService.store(file, { module: "announcements", uploadedBy });
  return { ...rest, imageUrl: stored.url, imageFileName: stored.fileName };
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
      const resolved = await resolveAnnouncementImage(body, currentUser.id);
      set.status = 201;
      return ok(await announcementsService.create(resolved, currentUser.id), "Announcement created");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to create announcement") };
    }
  },

  async update({
    params,
    body,
    currentUser,
    set,
  }: {
    params: { id: string };
    body: UpdateAnnouncementBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const resolved = await resolveAnnouncementImage(body, currentUser.id);
      return ok(await announcementsService.update(params.id, resolved), "Announcement updated");
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

  async delete({ params, set }: { params: { id: string }; set: SetContext }) {
    try {
      await announcementsService.delete(params.id);
      return ok(null, "Announcement deleted");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to delete announcement") };
    }
  },
};
