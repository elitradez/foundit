import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

function makeRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return new Redis({ url, token });
}

const redis = makeRedis();

export type RateLimiter = {
  name: string;
  requests: number;
  windowSeconds: number;
  upstash: Ratelimit | null;
};

function makeLimiter(name: string, requests: number, windowSeconds: number): RateLimiter {
  const upstash = redis
    ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(requests, `${windowSeconds} s`),
        analytics: false,
        // Distinct prefix per limiter so different surfaces don't share counters.
        prefix: `rl:${name}`,
      })
    : null;
  return { name, requests, windowSeconds, upstash };
}

export const loginLimiter = makeLimiter("login", 5, 60);
export const aiLimiter = makeLimiter("ai", 20, 60);
export const claimLimiter = makeLimiter("claim", 8, 60);

// ---------------------------------------------------------------------------
// In-memory fallback. Used when Upstash is not configured, or when an Upstash
// call fails. This is per-instance (Vercel may run several), so it is weaker
// than the shared Redis counter — but it guarantees there is ALWAYS some
// brute-force / cost-abuse ceiling rather than failing fully open.
// ---------------------------------------------------------------------------
type Hit = { count: number; reset: number };
const memBuckets = new Map<string, Map<string, Hit>>();

function memLimited(name: string, ip: string, requests: number, windowSeconds: number): boolean {
  const now = Date.now();
  let bucket = memBuckets.get(name);
  if (!bucket) {
    bucket = new Map();
    memBuckets.set(name, bucket);
  }
  // Opportunistic cleanup so the map can't grow without bound under many IPs.
  if (bucket.size > 5000) {
    for (const [k, v] of bucket) if (now > v.reset) bucket.delete(k);
  }
  const hit = bucket.get(ip);
  if (!hit || now > hit.reset) {
    bucket.set(ip, { count: 1, reset: now + windowSeconds * 1000 });
    return false;
  }
  hit.count += 1;
  return hit.count > requests;
}

export function getClientIp(req: Request): string {
  // On Vercel, x-forwarded-for is set by the platform; the first hop is the
  // client. x-real-ip is a single trusted value when present.
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return "unknown";
}

/**
 * Returns true if the request should be blocked (limit exceeded).
 * Prefers the shared Upstash counter; falls back to a per-instance in-memory
 * counter when Upstash is unconfigured or unavailable. Never fails fully open.
 */
export async function isRateLimited(
  limiter: RateLimiter | null,
  ip: string
): Promise<boolean> {
  if (!limiter) return false;
  if (limiter.upstash) {
    try {
      const { success } = await limiter.upstash.limit(ip);
      return !success;
    } catch (err) {
      console.error("[ratelimit] upstash failed, using in-memory fallback:", err);
      // fall through to the in-memory limiter instead of failing open
    }
  }
  return memLimited(limiter.name, ip, limiter.requests, limiter.windowSeconds);
}
