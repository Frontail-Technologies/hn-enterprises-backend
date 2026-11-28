import { Elysia, t } from "elysia";
import { auth } from "@plugins";
import { bulkDeleteByIdsBodySchema } from "@utils";
import type { AuthTokenPayload } from "@types";
import { errorMessage, ok, statusFromError } from "@utils";
import { projectMembersService } from "./project-members.service";
import { projectsController } from "./projects.controller";

type SetContext = { status?: number | string };
async function run<T>(set: SetContext, fallback: string, action: () => Promise<T>, message?: string) {
  try {
    return ok(await action(), message);
  } catch (error) {
    set.status = statusFromError(error);
    return { success: false, message: errorMessage(error, fallback) };
  }
}
import {
  createProjectBodySchema,
  createProjectDocumentBodySchema,
  createProjectSiteBodySchema,
  projectListQuerySchema,
  updateProjectBodySchema,
  updateProjectSiteBodySchema,
} from "./projects.schema";

export const projectsRoutes = new Elysia({ prefix: "/projects" })
  .use(auth)
  .get("/", ({ query, currentUser, set }) => projectsController.list({ query, currentUser, set }), {
    query: projectListQuerySchema,
    requireAuth: true,
  })
  .post("/", ({ body, currentUser, set }) => projectsController.create({ body, currentUser, set }), {
    body: createProjectBodySchema,
    requireRole: ["super_admin", "admin"],
  })
  // Bulk delete - a static path, registered ahead of any future dynamic
  // collision risk even though Elysia already prioritizes static routes.
  .post(
    "/bulk/delete",
    ({ body, currentUser, set }) => projectsController.bulkDelete({ body, currentUser, set }),
    {
      body: bulkDeleteByIdsBodySchema,
      requireRole: ["super_admin", "admin"],
    },
  )
  // Static path, registered ahead of `/:id` for clarity (matches the bulk
  // route's convention above - Elysia already prioritizes static routes).
  .get(
    "/sites",
    ({ currentUser, set }) => projectsController.listAllSites({ currentUser, set }),
    { requireAuth: true },
  )
  .get(
    "/:id",
    ({ params, currentUser, set }) => projectsController.get({ params, currentUser, set }),
    { params: t.Object({ id: t.String() }), requireAuth: true },
  )
  .get(
    "/:id/summary",
    ({ params, currentUser, set }) => projectsController.getSummary({ params, currentUser, set }),
    { params: t.Object({ id: t.String() }), requireAuth: true },
  )
  .get(
    "/:id/team",
    ({ params, currentUser, set }) => projectsController.getTeam({ params, currentUser, set }),
    { params: t.Object({ id: t.String() }), requireAuth: true },
  )
  // Project members (supervisors, plumbers, labour). Admins only; removal keeps history.
  .get(
    "/:id/members",
    ({ params, set }) => run(set, "Unable to load project members", () => projectMembersService.list(params.id)),
    { params: t.Object({ id: t.String({ format: "uuid" }) }), requireRole: ["super_admin", "admin"] },
  )
  .post(
    "/:id/members",
    ({ params, body, currentUser, set }) =>
      run(set, "Unable to add members", () => projectMembersService.add(params.id, body, (currentUser as AuthTokenPayload).id), "Members added"),
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        supervisorIds: t.Optional(t.Array(t.String({ format: "uuid" }), { maxItems: 500 })),
        plumberIds: t.Optional(t.Array(t.String({ format: "uuid" }), { maxItems: 500 })),
      }),
      requireRole: ["super_admin", "admin"],
    },
  )
  .delete(
    "/:id/members/:memberId",
    ({ params, currentUser, set }) =>
      run(set, "Unable to remove member", () => projectMembersService.remove(params.id, params.memberId, (currentUser as AuthTokenPayload).id), "Removed from project"),
    {
      params: t.Object({ id: t.String({ format: "uuid" }), memberId: t.String({ format: "uuid" }) }),
      requireRole: ["super_admin", "admin"],
    },
  )
  .patch(
    "/:id",
    ({ params, body, currentUser, set }) =>
      projectsController.update({ params, body, currentUser, set }),
    {
      params: t.Object({ id: t.String() }),
      body: updateProjectBodySchema,
      requireRole: ["super_admin", "admin"],
    },
  )
  .get(
    "/:id/delete-impact",
    ({ params, set }) => projectsController.deleteImpact({ params, set }),
    {
      params: t.Object({ id: t.String() }),
      requireRole: ["super_admin", "admin"],
    },
  )
  .delete(
    "/:id",
    ({ params, currentUser, set }) => projectsController.delete({ params, currentUser, set }),
    {
      params: t.Object({ id: t.String() }),
      requireRole: ["super_admin", "admin"],
    },
  )
  .get(
    "/:id/sites",
    ({ params, currentUser, set }) => projectsController.listSites({ params, currentUser, set }),
    { params: t.Object({ id: t.String() }), requireAuth: true },
  )
  .post(
    "/:id/sites",
    ({ params, body, currentUser, set }) =>
      projectsController.createSite({ params, body, currentUser, set }),
    {
      params: t.Object({ id: t.String() }),
      body: createProjectSiteBodySchema,
      requireRole: ["super_admin", "admin"],
    },
  )
  .patch(
    "/:id/sites/:siteId",
    ({ params, body, currentUser, set }) =>
      projectsController.updateSite({ params, body, currentUser, set }),
    {
      params: t.Object({ id: t.String(), siteId: t.String() }),
      body: updateProjectSiteBodySchema,
      requireRole: ["super_admin", "admin"],
    },
  )
  .delete(
    "/:id/sites/:siteId",
    ({ params, currentUser, set }) => projectsController.deleteSite({ params, currentUser, set }),
    {
      params: t.Object({ id: t.String(), siteId: t.String() }),
      requireRole: ["super_admin", "admin"],
    },
  )
  .get(
    "/:id/documents",
    ({ params, currentUser, set }) => projectsController.listDocuments({ params, currentUser, set }),
    { params: t.Object({ id: t.String() }), requireAuth: true },
  )
  .post(
    "/:id/documents",
    ({ params, body, currentUser, set }) =>
      projectsController.createDocument({ params, body, currentUser, set }),
    {
      params: t.Object({ id: t.String() }),
      body: createProjectDocumentBodySchema,
      requireRole: ["super_admin", "admin"],
    },
  )
  .delete(
    "/:id/documents/:documentId",
    ({ params, set }) => projectsController.deleteDocument({ params, set }),
    {
      params: t.Object({ id: t.String(), documentId: t.String() }),
      requireRole: ["super_admin", "admin"],
    },
  );
