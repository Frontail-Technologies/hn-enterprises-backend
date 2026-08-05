type Bucket = { count: number; resetAt: number };

// In-memory, per-process fixed-window limiter - fine for a single backend
// instance; move to a shared store (Redis) if this ever runs behind more
// than one process.
const buckets = new Map<string, Bucket>();

export function checkRateLimit(key: string, windowMs: number, max: number) {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (bucket.count >= max) {
    throw new Error("Too many attempts. Please try again later.");
  }

  bucket.count += 1;
}
