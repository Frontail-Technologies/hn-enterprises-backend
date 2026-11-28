import { Elysia, t } from "elysia";
import { auth } from "@plugins";
import type { AuthTokenPayload } from "@types";
import { errorMessage, ok, statusFromError } from "@utils";
import { systemController } from "./system.controller";
import { getMaintenance, setMaintenance } from "./maintenance.service";

export const systemRoutes = new Elysia({ prefix: "/system" })
  .get("/health", () => systemController.health())
  .get("/ready", () => systemController.ready())
  // Public: the mobile app checks this on start / resume (also before login).
  .get("/status", async () => {
    const maintenance = await getMaintenance();
    return ok({ maintenance: { enabled: maintenance.enabled, message: maintenance.message } });
  })
  .use(auth)
  .get("/maintenance", async () => ok(await getMaintenance()), { requireRole: ["super_admin", "admin"] })
  .put(
    "/maintenance",
    async ({ body, currentUser, set }) => {
      try {
        const state = await setMaintenance(body, (currentUser as AuthTokenPayload).id);
        return ok(state, state.enabled ? "Maintenance mode is on: the mobile app is blocked" : "Maintenance mode is off");
      } catch (error) {
        set.status = statusFromError(error);
        return { success: false, message: errorMessage(error, "Unable to change maintenance mode") };
      }
    },
    {
      body: t.Object({ enabled: t.Boolean(), message: t.Optional(t.String({ maxLength: 300 })) }),
      requireRole: ["super_admin", "admin"],
    },
  );
