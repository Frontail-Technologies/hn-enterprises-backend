import path from "node:path";
import { Elysia } from "elysia";

/**
 * Desktop app auto-update feed: the files `npm run dist` produces in the
 * frontend (latest.yml + HN-Enterprises-Setup-<version>.exe) are copied into
 * this folder on the server, and installed apps download them from
 * https://<api host>/desktop-updates/. Public: the installer is not secret.
 */
const updatesDir = path.resolve(process.cwd(), process.env.DESKTOP_UPDATES_DIR || "desktop-updates");

export const desktopUpdatesStaticRoutes = new Elysia().get("/desktop-updates/*", async ({ params, set }) => {
  let name = params["*"] ?? "";
  try {
    name = decodeURIComponent(name);
  } catch {
    // keep the raw value; the path check below still applies
  }
  const requestedPath = path.resolve(updatesDir, name);
  if (!requestedPath.startsWith(updatesDir + path.sep)) {
    set.status = 403;
    return { success: false, message: "Forbidden" };
  }

  const file = Bun.file(requestedPath);
  if (!(await file.exists())) {
    set.status = 404;
    return { success: false, message: "File not found" };
  }

  // The feed file must never be cached, or apps would miss new versions.
  set.headers["Cache-Control"] = name.endsWith(".yml") ? "no-cache, no-store" : "public, max-age=3600";
  return file;
});
