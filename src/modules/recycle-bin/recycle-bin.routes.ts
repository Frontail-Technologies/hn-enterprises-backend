import { Elysia, t } from "elysia";
import { auth } from "@plugins";
import { auditService } from "@services";
import type { AuthTokenPayload } from "@types";
import { errorMessage, ok, statusFromError } from "@utils";
import { recycleBinService } from "./recycle-bin.service";

const ADMINS: ["super_admin", "admin"] = ["super_admin", "admin"];
const idParams = t.Object({ id: t.String({ format: "uuid" }) });

type SetContext = { status?: number | string };

async function run<T>(set: SetContext, fallback: string, action: () => Promise<T>, message?: string) {
  try {
    return ok(await action(), message);
  } catch (error) {
    set.status = statusFromError(error);
    return { success: false, message: errorMessage(error, fallback) };
  }
}

/** Deleted customers kept for 30 days: list, restore, delete forever (admins only). */
export const recycleBinRoutes = new Elysia({ prefix: "/recycle-bin" })
  .use(auth)
  .get("/", ({ set }) => run(set, "Unable to load the recycle bin", () => recycleBinService.list()), { requireRole: ADMINS })
  .post(
    "/:id/restore",
    ({ params, currentUser, set }) =>
      run(set, "Unable to restore", async () => {
        const restored = await recycleBinService.restore(params.id);
        await auditService.log({
          userId: (currentUser as AuthTokenPayload).id,
          module: "Customers",
          action: "Restored Customer",
          recordId: restored.entityId,
          description: `Restored customer "${restored.label}" from the recycle bin`,
        });
        return restored;
      }, "Restored"),
    { params: idParams, requireRole: ADMINS },
  )
  // Registered before "/:id": empties the whole bin.
  .delete(
    "/",
    ({ currentUser, set }) =>
      run(set, "Unable to empty the recycle bin", async () => {
        const result = await recycleBinService.purgeAll();
        if (result.count) {
          await auditService.log({
            userId: (currentUser as AuthTokenPayload).id,
            module: "Customers",
            action: "Emptied Recycle Bin",
            description: `Permanently deleted ${result.count} item${result.count === 1 ? "" : "s"} from the recycle bin`,
          });
        }
        return result;
      }, "Recycle bin emptied"),
    { requireRole: ADMINS },
  )
  .delete(
    "/:id",
    ({ params, currentUser, set }) =>
      run(set, "Unable to delete", async () => {
        const purged = await recycleBinService.purge(params.id);
        await auditService.log({
          userId: (currentUser as AuthTokenPayload).id,
          module: "Customers",
          action: "Deleted Customer Permanently",
          recordId: params.id,
          description: `Removed "${purged.label}" from the recycle bin for good`,
        });
        return purged;
      }, "Deleted permanently"),
    { params: idParams, requireRole: ADMINS },
  );
