import { Elysia } from "elysia";
import cors from "@elysiajs/cors";
import { CORS_CONFIGS, HOST, PORT } from "@constants";
import { apiModules } from "@modules";
import { errorHandler, requestLogger } from "@plugins";

const app = new Elysia()
  .use(cors(CORS_CONFIGS))
  .use(requestLogger)
  .use(errorHandler)
  .group("/api", (api) =>
    api.use(apiModules).get("/", () => ({
      success: true,
      message: "HN Enterprises API",
    })),
  )
  .listen({ hostname: HOST, port: PORT });

console.log(`HN Enterprises API running at ${app.server?.hostname}:${app.server?.port}`);
