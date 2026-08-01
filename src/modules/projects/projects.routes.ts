import { Elysia, t } from "elysia";
import { auth } from "@plugins";
import { projectsController } from "./projects.controller";
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
  .get("/", ({ query, set }) => projectsController.list({ query, set }), {
    query: projectListQuerySchema,
    requireAuth: true,
  })
  .post("/", ({ body, currentUser, set }) => projectsController.create({ body, currentUser, set }), {
    body: createProjectBodySchema,
    requireRole: ["super_admin", "admin"],
  })
  .get(
    "/:id",
    ({ params, set }) => projectsController.get({ params, set }),
    { params: t.Object({ id: t.String() }), requireAuth: true },
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
    "/:id/sites",
    ({ params, set }) => projectsController.listSites({ params, set }),
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
    ({ params, set }) => projectsController.deleteSite({ params, set }),
    {
      params: t.Object({ id: t.String(), siteId: t.String() }),
      requireRole: ["super_admin", "admin"],
    },
  )
  .get(
    "/:id/documents",
    ({ params, set }) => projectsController.listDocuments({ params, set }),
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
