import { Elysia, t } from "elysia";
import { auth } from "@plugins";
import { exportsController } from "./exports.controller";

const monthYearQuerySchema = t.Object({
  month: t.String(),
  year: t.String(),
});

const materialSourceQuerySchema = t.Optional(t.Union([t.Literal("purchase"), t.Literal("pbg")]));

export const exportsRoutes = new Elysia({ prefix: "/exports" })
  .use(auth)
  .get(
    "/attendance",
    ({ query, set }) => exportsController.attendance({ query, set }),
    {
      query: t.Object({ ...monthYearQuerySchema.properties, projectId: t.Optional(t.String()) }),
      requireRole: ["super_admin", "admin"],
    },
  )
  .get(
    "/dpr-planning",
    ({ query, set }) => exportsController.dprPlanning({ query, set }),
    {
      query: t.Object({
        date: t.String(),
        projectId: t.Optional(t.String()),
        supervisorId: t.Optional(t.String()),
      }),
      // Supervisors (mobile) never export; keep other projects' data out of reach.
      requireRole: ["super_admin", "admin", "viewer"],
    },
  )
  .get(
    "/inventory/stock",
    ({ query, set }) => exportsController.inventoryStock({ query, set }),
    {
      query: t.Object({ projectId: t.Optional(t.String()), source: materialSourceQuerySchema }),
      // Supervisors (mobile) never export; keep other projects' data out of reach.
      requireRole: ["super_admin", "admin", "viewer"],
    },
  )
  .get(
    "/inventory/purchases",
    ({ query, set }) => exportsController.inventoryPurchases({ query, set }),
    {
      query: t.Object({ projectId: t.Optional(t.String()), source: materialSourceQuerySchema, from: t.Optional(t.String()), to: t.Optional(t.String()) }),
      // Supervisors (mobile) never export; keep other projects' data out of reach.
      requireRole: ["super_admin", "admin", "viewer"],
    },
  )
  .get(
    "/inventory/pbg-issues",
    ({ query, set }) => exportsController.inventoryPbgIssues({ query, set }),
    {
      query: t.Object({ projectId: t.Optional(t.String()), source: materialSourceQuerySchema, from: t.Optional(t.String()), to: t.Optional(t.String()) }),
      // Supervisors (mobile) never export; keep other projects' data out of reach.
      requireRole: ["super_admin", "admin", "viewer"],
    },
  )
  .get(
    "/inventory/store-issues",
    ({ query, set }) => exportsController.inventoryStoreIssues({ query, set }),
    {
      query: t.Object({
        projectId: t.Optional(t.String()),
        source: materialSourceQuerySchema,
        plumberId: t.Optional(t.String()),
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
      }),
      // Supervisors (mobile) never export; keep other projects' data out of reach.
      requireRole: ["super_admin", "admin", "viewer"],
    },
  )
  .get(
    "/inventory/consumption",
    ({ query, set }) => exportsController.inventoryConsumption({ query, set }),
    {
      query: t.Object({
        projectId: t.Optional(t.String()),
        source: materialSourceQuerySchema,
        plumberId: t.Optional(t.String()),
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
      }),
      // Supervisors (mobile) never export; keep other projects' data out of reach.
      requireRole: ["super_admin", "admin", "viewer"],
    },
  )
  .get(
    "/inventory/pbg-consumption",
    ({ query, set }) => exportsController.inventoryPbgConsumption({ query, set }),
    {
      query: t.Object({
        projectId: t.Optional(t.String()),
        source: materialSourceQuerySchema,
        plumberId: t.Optional(t.String()),
        materialId: t.Optional(t.String()),
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
      }),
      // Supervisors (mobile) never export; keep other projects' data out of reach.
      requireRole: ["super_admin", "admin", "viewer"],
    },
  )
  .get(
    "/inventory/total-issue",
    ({ query, set }) => exportsController.inventoryTotalIssue({ query, set }),
    {
      query: t.Object({
        projectId: t.Optional(t.String()),
        source: materialSourceQuerySchema,
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
      }),
      // Supervisors (mobile) never export; keep other projects' data out of reach.
      requireRole: ["super_admin", "admin", "viewer"],
    },
  )
  .get(
    "/inventory/plumber-balance",
    ({ query, set }) => exportsController.inventoryPlumberBalance({ query, set }),
    {
      query: t.Object({
        projectId: t.Optional(t.String()),
        source: materialSourceQuerySchema,
        plumberId: t.Optional(t.String()),
        materialId: t.Optional(t.String()),
      }),
      // Supervisors (mobile) never export; keep other projects' data out of reach.
      requireRole: ["super_admin", "admin", "viewer"],
    },
  )
  .get(
    "/wages",
    ({ query, set }) => exportsController.wages({ query, set }),
    { query: monthYearQuerySchema, requireRole: ["super_admin", "admin"] },
  )
  .get(
    "/customers",
    ({ query, currentUser, set }) => exportsController.customers({ query, currentUser, set }),
    {
      query: t.Object({
        projectId: t.Optional(t.String()),
        siteId: t.Optional(t.String()),
        status: t.Optional(t.String()),
        city: t.Optional(t.String()),
        search: t.Optional(t.String()),
        statKey: t.Optional(t.String()),
      }),
      // Supervisors (mobile) never export; keep other projects' data out of reach.
      requireRole: ["super_admin", "admin", "viewer"],
    },
  )
  .get(
    "/users",
    ({ query, set }) => exportsController.users({ query, set }),
    {
      query: t.Object({
        role: t.Optional(t.String()),
        status: t.Optional(t.String()),
        search: t.Optional(t.String()),
      }),
      requireRole: ["super_admin", "admin"],
    },
  )
  .get(
    "/masters/values",
    ({ query, set }) => exportsController.masterValues({ query, set }),
    {
      query: t.Object({ category: t.String(), search: t.Optional(t.String()) }),
      // Supervisors (mobile) never export; keep other projects' data out of reach.
      requireRole: ["super_admin", "admin", "viewer"],
    },
  )
  .get(
    "/masters/holidays",
    ({ query, set }) => exportsController.holidays({ query, set }),
    {
      query: t.Object({ search: t.Optional(t.String()) }),
      // Supervisors (mobile) never export; keep other projects' data out of reach.
      requireRole: ["super_admin", "admin", "viewer"],
    },
  );
