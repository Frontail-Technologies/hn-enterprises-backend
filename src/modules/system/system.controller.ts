import { systemService } from "./system.service";

export const systemController = {
  health() {
    return {
      success: true,
      data: systemService.getHealth(),
    };
  },

  ready() {
    return {
      success: true,
      data: systemService.getReadiness(),
    };
  },
};
