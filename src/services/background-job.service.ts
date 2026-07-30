type BackgroundJob = {
  name: string;
  run: () => Promise<void>;
};

const queue: BackgroundJob[] = [];
let running = false;

async function drainQueue() {
  if (running) return;

  running = true;

  while (queue.length > 0) {
    const job = queue.shift();
    if (!job) continue;

    try {
      await job.run();
    } catch (error) {
      console.error("[background-job:error]", {
        name: job.name,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  running = false;
}

export const backgroundJobService = {
  enqueue(name: string, run: () => Promise<void>) {
    queue.push({ name, run });
    setTimeout(() => void drainQueue(), 0);
  },

  getStats() {
    return {
      pending: queue.length,
      running,
    };
  },
};
