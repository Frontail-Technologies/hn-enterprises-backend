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
      requireAuth: true,
    },
  )
  .get(
    "/inventory/stock",
    ({ query, set }) => exportsController.inventoryStock({ query, set }),
    {
      query: t.Object({ projectId: t.Optional(t.String()), source: materialSourceQuerySchema }),
      requireAuth: true,
    },
  )
  .get(
    "/inventory/purchases",
    ({ query, set }) => exportsController.inventoryPurchases({ query, set }),
    {
      query: t.Object({ projectId: t.Optional(t.String()), from: t.Optional(t.String()), to: t.Optional(t.String()) }),
      requireAuth: true,
    },
  )
  .get(
    "/inventory/pbg-issues",
    ({ query, set }) => exportsController.inventoryPbgIssues({ query, set }),
    {
      query: t.Object({ projectId: t.Optional(t.String()), from: t.Optional(t.String()), to: t.Optional(t.String()) }),
      requireAuth: true,
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
      requireAuth: true,
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
      requireAuth: true,
    },
  )
  .get(
    "/inventory/pbg-consumption",
    ({ query, set }) => exportsController.inventoryPbgConsumption({ query, set }),
    {
      query: t.Object({
        projectId: t.Optional(t.String()),
        plumberId: t.Optional(t.String()),
        materialId: t.Optional(t.String()),
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
      }),
      requireAuth: true,
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
      requireAuth: true,
    },
  )
  .get(
    "/inventory/plumber-balance",
    ({ query, set }) => exportsController.inventoryPlumberBalance({ query, set }),
    {
      // No from/to (§5) - a running balance, not a period total.
      query: t.Object({
        projectId: t.Optional(t.String()),
        source: materialSourceQuerySchema,
        plumberId: t.Optional(t.String()),
        materialId: t.Optional(t.String()),
      }),
      requireAuth: true,
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
      // Matches the Customers list's own access (requireAuth) - anyone who can view
      // customers can export the register they're looking at.
      query: t.Object({
        projectId: t.Optional(t.String()),
        siteId: t.Optional(t.String()),
        status: t.Optional(t.String()),
        city: t.Optional(t.String()),
        search: t.Optional(t.String()),
        statKey: t.Optional(t.String()),
      }),
      requireAuth: true,
    },
  )
  .get(
    "/users",
    ({ query, set }) => exportsController.users({ query, set }),
    {
      // Matches the Users list's own access.
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
      // Matches the Master Values list's own access.
      query: t.Object({ category: t.String(), search: t.Optional(t.String()) }),
      requireAuth: true,
    },
  )
  .get(
    "/masters/holidays",
    ({ query, set }) => exportsController.holidays({ query, set }),
    {
      // Matches the Holidays list's own access.
      query: t.Object({ search: t.Optional(t.String()) }),
      requireAuth: true,
    },
  );
