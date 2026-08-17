import type { AuthTokenPayload } from "@types";
import type { SetContext } from "@modules/auth/auth.helpers";
import { errorCode, errorMessage, ok, paginated, statusFromError } from "@utils";
import { projectsService } from "./projects.service";
import { projectsDeletionService } from "./projects-deletion.service";
import { projectsSummaryService } from "./projects-summary.service";
import { projectsTeamService } from "./projects-team.service";
import type {
  CreateProjectBody,
  CreateProjectDocumentBody,
  CreateProjectSiteBody,
  ProjectListQuery,
  UpdateProjectBody,
  UpdateProjectSiteBody,
} from "./projects.types";

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

  async delete({ params, currentUser, set }: { params: { id: string }; currentUser: AuthTokenPayload | null; set: SetContext }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      await projectsService.delete(params.id, currentUser.id);
      return ok(null, "Project deleted");
    } catch (error) {
      set.status = statusFromError(error);
      const code = errorCode(error);
      return { success: false, message: errorMessage(error, "Unable to delete project"), ...(code ? { code } : {}) };
    }
  },

  // Delete Impact Preview (§2) - what deleting this project would affect, before
  // the user commits to it. Read-only; the actual delete still re-checks this same
  // data inside its own transaction rather than trusting this snapshot.
  async deleteImpact({ params, set }: { params: { id: string }; set: SetContext }) {
    try {
      const impact = await projectsDeletionService.getDeleteImpact(params.id);
      return ok(impact);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to compute delete impact") };
    }
  },

  async bulkDelete({
    body,
    currentUser,
    set,
  }: {
    body: { ids: string[] };
    currentUser: AuthTokenPayload | null;
    set: SetContext;
  }) {
    try {
      if (!currentUser) throw new Error("Authentication required");
      const result = await projectsService.bulkDelete(body.ids, currentUser.id);
      return ok(result, `${result.count} project${result.count === 1 ? "" : "s"} deleted`);
    } catch (error) {
      set.status = statusFromError(error);
      const code = errorCode(error);
      return { success: false, message: errorMessage(error, "Unable to delete projects"), ...(code ? { code } : {}) };
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

  async deleteSite({ params, set }: { params: { id: string; siteId: string }; set: SetContext }) {
    try {
      await projectsService.deleteSite(params.id, params.siteId);
      return ok(null, "Project site deleted");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to delete project site") };
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

  async deleteDocument({ params, set }: { params: { id: string; documentId: string }; set: SetContext }) {
    try {
      await projectsService.deleteDocument(params.id, params.documentId);
      return ok(null, "Project document deleted");
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to delete project document") };
    }
  },

  async getSummary({ params, set }: { params: { id: string }; set: SetContext }) {
    try {
      const summary = await projectsSummaryService.getSummary(params.id);
      return ok(summary);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to load project summary") };
    }
  },

  async getTeam({ params, set }: { params: { id: string }; set: SetContext }) {
    try {
      const team = await projectsTeamService.getTeam(params.id);
      return ok(team);
    } catch (error) {
      set.status = statusFromError(error);
      return { success: false, message: errorMessage(error, "Unable to load project team") };
    }
  },
};
