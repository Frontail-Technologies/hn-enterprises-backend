import type { AuthTokenPayload } from "@types";
import type { SetContext } from "@modules/auth/auth.helpers";
import { ok, paginated } from "@utils";
import { projectsService } from "./projects.service";
import type {
  CreateProjectBody,
  CreateProjectDocumentBody,
  CreateProjectSiteBody,
  ProjectListQuery,
  UpdateProjectBody,
  UpdateProjectSiteBody,
} from "./projects.types";

function statusFromError(error: unknown) {
  if (error instanceof Error && error.message.includes("not found")) return 404;
  return 400;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export const projectsController = {
  async list({ query, set }: { query: ProjectListQuery; set: SetContext }) {
    try {
      const { rows, pagination } = await projectsService.list(query);
      return paginated(rows, pagination);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to list projects") };
    }
  },

  async get({ params, set }: { params: { id: string }; set: SetContext }) {
    try {
      const project = await projectsService.get(params.id);
      return ok(project);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to fetch project") };
    }
  },

  async create({
    body,
    currentUser,
    set,
  }: {
    body: CreateProjectBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const project = await projectsService.create(body, currentUser.id);
      set.status = 201;
      return ok(project, "Project created");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to create project") };
    }
  },

  async update({
    params,
    body,
    currentUser,
    set,
  }: {
    params: { id: string };
    body: UpdateProjectBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const project = await projectsService.update(params.id, body, currentUser.id);
      return ok(project, "Project updated");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to update project") };
    }
  },

  async listSites({ params, set }: { params: { id: string }; set: SetContext }) {
    try {
      const sites = await projectsService.listSites(params.id);
      return ok(sites);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to list project sites") };
    }
  },

  async createSite({
    params,
    body,
    currentUser,
    set,
  }: {
    params: { id: string };
    body: CreateProjectSiteBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const site = await projectsService.createSite(params.id, body, currentUser.id);
      set.status = 201;
      return ok(site, "Project site created");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to create project site") };
    }
  },

  async updateSite({
    params,
    body,
    currentUser,
    set,
  }: {
    params: { id: string; siteId: string };
    body: UpdateProjectSiteBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const site = await projectsService.updateSite(params.id, params.siteId, body, currentUser.id);
      return ok(site, "Project site updated");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to update project site") };
    }
  },

  async listDocuments({ params, set }: { params: { id: string }; set: SetContext }) {
    try {
      const documents = await projectsService.listDocuments(params.id);
      return ok(documents);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to list project documents") };
    }
  },

  async createDocument({
    params,
    body,
    currentUser,
    set,
  }: {
    params: { id: string };
    body: CreateProjectDocumentBody;
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const document = await projectsService.createDocument(params.id, body, currentUser.id);
      set.status = 201;
      return ok(document, "Project document created");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to create project document") };
    }
  },
};
