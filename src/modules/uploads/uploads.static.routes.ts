import path from "node:path";
import { Elysia } from "elysia";
import { UPLOAD_DIR } from "@constants";

const uploadRoot = path.resolve(process.cwd(), UPLOAD_DIR);

export const uploadsStaticRoutes = new Elysia().get(`/${UPLOAD_DIR}/*`, async ({ params, set }) => {
  const requestedPath = path.resolve(uploadRoot, params["*"] ?? "");

  if (requestedPath !== uploadRoot && !requestedPath.startsWith(uploadRoot + path.sep)) {
    set.status = 403;
    return { success: false, message: "Forbidden" };
  }

  const file = Bun.file(requestedPath);
  if (!(await file.exists())) {
    set.status = 404;
    return { success: false, message: "File not found" };
  }

  return file;
});
