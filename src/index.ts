import { Elysia } from "elysia";
import cors from "@elysiajs/cors";
import { assertRequiredEnv, CORS_CONFIGS, HOST, PORT } from "@constants";
import { apiModules } from "@modules";
import { uploadsStaticRoutes } from "@modules/uploads/uploads.static.routes";
import { errorHandler, requestLogger } from "@plugins";

assertRequiredEnv();

const app = new Elysia()
  .use(cors(CORS_CONFIGS))
  .use(requestLogger)
  .use(errorHandler)
  .use(uploadsStaticRoutes)
  .group("/api", (api) =>
    api.use(apiModules).get("/", () => ({
      success: true,
      message: "HN Enterprises API",
    })),
  )
  .listen({ hostname: HOST, port: PORT });

console.log(`HN Enterprises API running at ${app.server?.hostname}:${app.server?.port}`);
