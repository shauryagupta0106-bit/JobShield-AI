import { createHash } from "node:crypto";
import type { RequestHandler } from "express";

type RateLimitOptions = {
  scope: string;
  windowMs: number;
  maxRequests: number;
  message: string;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
let nextCleanupAt = 0;

export function createJobShieldRateLimit(
  options: RateLimitOptions,
): RequestHandler {
  return (request, response, next) => {
    const now = Date.now();
    if (now >= nextCleanupAt) {
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
      }
      nextCleanupAt = now + 60_000;
    }

    const address = request.ip || request.socket.remoteAddress || "unknown";
    const fingerprint = createHash("sha256").update(address).digest("hex");
    const key = `${options.scope}:${fingerprint}`;
    const bucket = buckets.get(key);
    const current =
      bucket && bucket.resetAt > now
        ? bucket
        : { count: 0, resetAt: now + options.windowMs };
    current.count += 1;
    buckets.set(key, current);

    const remaining = Math.max(0, options.maxRequests - current.count);
    const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    response.setHeader("RateLimit-Limit", options.maxRequests);
    response.setHeader("RateLimit-Remaining", remaining);
    response.setHeader("RateLimit-Reset", retryAfter);

    if (current.count > options.maxRequests) {
      response.setHeader("Retry-After", retryAfter);
      response.status(429).json({ error: options.message });
      return;
    }
    next();
  };
}
