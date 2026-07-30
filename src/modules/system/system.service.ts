import { NODE_ENV } from "@constants";

const startedAt = new Date();

export const systemService = {
  getHealth() {
    return {
      status: "ok",
      service: "hn-enterprises-api",
      environment: NODE_ENV,
      startedAt,
      uptimeSeconds: Math.round(process.uptime()),
    };
  },

  getReadiness() {
    return {
      status: "ready",
      checks: {
        app: "ok",
      },
    };
  },
};
