import { Elysia } from "elysia";
import cors from "@elysiajs/cors";
import { assertRequiredEnv, CORS_CONFIGS, HOST, PORT } from "@constants";
import { apiModules } from "@modules";
import { uploadsStaticRoutes } from "@modules/uploads/uploads.static.routes";
import { desktopUpdatesStaticRoutes } from "@modules/uploads/desktop-updates.static.routes";
import { errorHandler, requestLogger } from "@plugins";

assertRequiredEnv();

const app = new Elysia()
  .use(cors(CORS_CONFIGS))
  .use(requestLogger)
  .use(errorHandler)
  .use(uploadsStaticRoutes)
  .use(desktopUpdatesStaticRoutes)
  .group("/api", (api) =>
    api.use(apiModules).get("/", () => ({
      success: true,
      message: "HN Enterprises API",
    })),
  )
  // Bun closes a request after 10 s of silence by default, which surfaced in the
  // admin as "Failed to fetch" on long imports/exports while the server carried
  // on working. 255 s is Bun's maximum.
  .listen({ hostname: HOST, port: PORT, idleTimeout: 255 });

console.log(`HN Enterprises API running at ${app.server?.hostname}:${app.server?.port}`);
