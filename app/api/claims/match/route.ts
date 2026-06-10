import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { scoreMatch } from "@/lib/match-score";
import { aiLimiter, getClientIp, isRateLimited } from "@/lib/ratelimit";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
type CacheEntry = { score: number; revealUrl: string | null; ts: number };
const matchCache = new Map<string, CacheEntry>();

function getCacheKey(itemId: string, description: string): string {
  return createHash("sha256").update(`${itemId}:${description}`).digest("hex");
}

export async function POST(req: Request) {
  if (await isRateLimited(aiLimiter, getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests. Please try again in a minute." },
      { status: 429 }
    );
  }

  try {
    const body = (await req.json()) as { itemId?: string; studentDescription?: string };
    const itemId = body.itemId?.trim();
    const studentDescription = body.studentDescription?.trim();
    if (!itemId || !studentDescription) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (studentDescription.length > 4000) {
      return NextResponse.json({ error: "Description too long" }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const { data: item, error } = await supabase
      .from("items")
      .select("id, description, returned_at, photo_path, value_tier, pin_hash")
      .eq("id", itemId)
      .maybeSingle();

    if (error || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    if (item.returned_at) {
      return NextResponse.json({ error: "Item no longer available" }, { status: 410 });
    }

    const cacheKey = getCacheKey(itemId, studentDescription);
    const cached = matchCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return NextResponse.json({ score: cached.score, revealUrl: cached.revealUrl });
    }

    // Strict, prompt-injection-hardened scorer (shared with /api/find so the
    // describe-first flow applies the same anti-fraud bar). Default model
    // purpose preserves this endpoint's existing behavior exactly.
    let clamped: number;
    try {
      clamped = await scoreMatch(item.description, studentDescription);
    } catch {
      return NextResponse.json({ error: "Could not parse match result" }, { status: 502 });
    }

    let revealUrl: string | null = null;
    if (clamped > 60 && item.pin_hash === null) {
      const { data: signed, error: signErr } = await supabase.storage
        .from("items")
        .createSignedUrl(item.photo_path, 60 * 10);
      if (!signErr && signed?.signedUrl) {
        revealUrl = signed.signedUrl;
      }
    }

    // Bound the cache: drop expired entries, and hard-cap total size so it
    // can't grow without limit (it holds short-lived signed photo URLs).
    const now = Date.now();
    for (const [k, v] of matchCache) {
      if (now - v.ts >= CACHE_TTL_MS) matchCache.delete(k);
    }
    if (matchCache.size > 1000) {
      const oldest = matchCache.keys().next().value;
      if (oldest !== undefined) matchCache.delete(oldest);
    }
    matchCache.set(cacheKey, { score: clamped, revealUrl, ts: now });
    return NextResponse.json({ score: clamped, revealUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Match failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
