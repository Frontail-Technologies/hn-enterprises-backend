import { Elysia } from "elysia";
import { systemController } from "./system.controller";

export const systemRoutes = new Elysia({ prefix: "/system" })
  .get("/health", () => systemController.health())
  .get("/ready", () => systemController.ready());
