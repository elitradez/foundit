import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

function makeRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function makeLimiter(
  redis: Redis,
  requests: number,
  windowSeconds: number
): Ratelimit {
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, `${windowSeconds} s`),
    analytics: false,
  });
}

const redis = makeRedis();

export const loginLimiter = redis
  ? makeLimiter(redis, 5, 60)
  : null;

export const aiLimiter = redis
  ? makeLimiter(redis, 20, 60)
  : null;

export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return "unknown";
}

/**
 * Returns true if the request should be blocked (limit exceeded).
 * Returns false and fails open if the limiter is unavailable.
 */
export async function isRateLimited(
  limiter: Ratelimit | null,
  ip: string
): Promise<boolean> {
  if (!limiter) return false;
  try {
    const { success } = await limiter.limit(ip);
    return !success;
  } catch (err) {
    console.error("[ratelimit] check failed, failing open:", err);
    return false;
  }
}
