import { Elysia } from "elysia";
import { attendanceRoutes } from "./attendance/attendance.routes";
import { authRoutes } from "./auth/auth.routes";
import { billsRoutes } from "./bills/bills.routes";
import { customersRoutes } from "./customers/customers.routes";
import { masterImportRoutes } from "./master-import/master-import.routes";
import { materialsRoutes } from "./materials/materials.routes";
import { planningRoutes } from "./planning/planning.routes";
import { plumbersRoutes } from "./plumbers/plumbers.routes";
import { projectsRoutes } from "./projects/projects.routes";
import { systemRoutes } from "./system/system.routes";
import { uploadsRoutes } from "./uploads/uploads.routes";
import { usersRoutes } from "./users/users.routes";

export const apiModules = new Elysia()
  .use(systemRoutes)
  .use(authRoutes)
  .use(masterImportRoutes)
  .use(projectsRoutes)
  .use(customersRoutes)
  .use(uploadsRoutes)
  .use(usersRoutes)
  .use(attendanceRoutes)
  .use(planningRoutes)
  .use(plumbersRoutes)
  .use(billsRoutes)
  .use(materialsRoutes);
