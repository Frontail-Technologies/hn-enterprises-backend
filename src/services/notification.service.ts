type NotificationInput = {
  userId?: string;
  title: string;
  message: string;
  type?: "info" | "success" | "warning" | "error";
  metadata?: Record<string, unknown>;
};

export const notificationService = {
  async queue(input: NotificationInput) {
    console.info("[notification]", {
      type: input.type ?? "info",
      ...input,
      queuedAt: new Date().toISOString(),
    });
  },
};
