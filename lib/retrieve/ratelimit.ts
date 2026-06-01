import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Gym-scoped rate limiting. Self-contained copy of the campus pattern; uses the
 * shared Upstash creds if present, otherwise fails open (returns "not limited").
 * Login is keyed by client IP. Fails open only when Redis is unconfigured —
 * acceptable for the pilot's login path.
 */

function makeRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return new Redis({ url, token });
}

const redis = makeRedis();

export const retrieveLoginLimiter = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, "60 s"), analytics: false })
  : null;

export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return "unknown";
}

export async function isRateLimited(limiter: Ratelimit | null, key: string): Promise<boolean> {
  if (!limiter) return false;
  try {
    const { success } = await limiter.limit(key);
    return !success;
  } catch (err) {
    console.error("[retrieve ratelimit] check failed, failing open:", err);
    return false;
  }
}
