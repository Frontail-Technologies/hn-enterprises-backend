import { Elysia } from "elysia";
import { authRoutes } from "./auth/auth.routes";
import { customersRoutes } from "./customers/customers.routes";
import { masterImportRoutes } from "./master-import/master-import.routes";
import { projectsRoutes } from "./projects/projects.routes";
import { systemRoutes } from "./system/system.routes";
import { uploadsRoutes } from "./uploads/uploads.routes";

export const apiModules = new Elysia()
  .use(systemRoutes)
  .use(authRoutes)
  .use(masterImportRoutes)
  .use(projectsRoutes)
  .use(customersRoutes)
  .use(uploadsRoutes);
