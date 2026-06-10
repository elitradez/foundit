import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { getUniversityId } from "@/lib/university-config";
import { aiLimiter, getClientIp, isRateLimited } from "@/lib/ratelimit";
import { embedQuery, rerankByRelevance, vectorSearchItems } from "@/lib/search";
import { scoreMatch } from "@/lib/match-score";

// ---------------------------------------------------------------------------
// Describe-first claim flow ("Find my item").
//
// ANTI-FRAUD DESIGN — the photo blur exists so someone can't browse photos and
// invent a matching story. This endpoint:
//   1. COMMITS the student's description to find_requests BEFORE any matching
//      runs, so staff can later compare what was said against what was claimed.
//   2. Shows at most MAX_MATCHES items, and ONLY those whose in-database
//      pgvector similarity clears FIND_MATCH_SIMILARITY.
//   3. Unblurs a shown match ONLY if the strict description-vs-description
//      scorer (the same gate the browse flow uses) ALSO clears
//      UNBLUR_MATCH_SCORE — and never for PIN-protected items. Matches that
//      clear gate 1 but not gate 2 are shown blurred and remain claimable.
// ---------------------------------------------------------------------------

// Gate 1 — similarity confidence floor for SHOWING a match at all. Anti-fraud:
// set conservatively so vague descriptions can't fish for photos. Measured on
// the live catalog (text-embedding-3-small): unrelated items top out ~0.34,
// genuine attribute-level matches start ~0.45, strong matches 0.54+. 0.45 sits
// above the noise ceiling with margin while keeping real matches.
const FIND_MATCH_SIMILARITY = 0.45;

// Gate 2 — the strict AI match score required to UNBLUR a shown match's photo.
// Same bar as the existing browse reveal (/api/claims/match). Anti-fraud: the
// photo stays blurred unless the committed description corroborates specific
// details of this exact item.
const UNBLUR_MATCH_SCORE = 60;

const MAX_MATCHES = 3;
const SIGNED_URL_TTL_S = 60 * 10; // same TTL as the existing browse reveal

export const maxDuration = 30; // embedding + rerank + up to 3 parallel scorer calls

type FindBody = {
  description?: string;
  locationLost?: string;
  dateLost?: string;
};

type FindMatch = {
  id: string;
  name: string;
  date_found: string | null;
  department_name: string | null;
  // Signed unblurred URL when both gates pass and the item has no PIN; null
  // means the client renders the existing blurred proxy instead.
  photoUrl: string | null;
};

export async function POST(req: Request) {
  // Same rate limiting as the existing match endpoint — this is also a
  // model-calling, reveal-gating route.
  if (await isRateLimited(aiLimiter, getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests. Please try again in a minute." },
      { status: 429 }
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as FindBody;
    const description = body.description?.trim() ?? "";
    const locationLost = body.locationLost?.trim() || null;
    const dateLost = body.dateLost?.trim() || null;

    if (description.length < 20) {
      return NextResponse.json(
        { error: "Please describe your item in a bit more detail (at least 20 characters)." },
        { status: 400 }
      );
    }
    if (description.length > 4000) {
      return NextResponse.json({ error: "Description too long" }, { status: 400 });
    }
    if (locationLost && locationLost.length > 200) {
      return NextResponse.json({ error: "Location too long" }, { status: 400 });
    }
    if (dateLost && !/^\d{4}-\d{2}-\d{2}$/.test(dateLost)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const universityId = getUniversityId();

    // 1. Commit the description FIRST — before any matching, before the user
    // can see anything. If this fails we abort: the committed record is the
    // anti-fraud control, not a nice-to-have.
    const { data: findReq, error: insertErr } = await supabase
      .from("find_requests")
      .insert({
        university_id: universityId,
        description,
        location_lost: locationLost,
        date_lost: dateLost,
      })
      .select("id")
      .single();

    if (insertErr || !findReq) {
      console.error("[find] could not commit description:", insertErr?.message);
      return NextResponse.json({ error: "Could not start your search. Please try again." }, { status: 500 });
    }
    const findRequestId = findReq.id as string;

    // 2. Recall: embedding -> in-database pgvector search with the
    // conservative gate-1 threshold applied in SQL.
    const embedding = await embedQuery(description);
    if (!embedding) {
      // Search degraded — keep the committed request, return no matches so the
      // student lands on the SMS-alert offer rather than an error dead-end.
      console.error("[find] embedding unavailable; returning no matches");
      return NextResponse.json({ findRequestId, matches: [] });
    }

    const rows = await vectorSearchItems(supabase, embedding, universityId, {
      matchThreshold: FIND_MATCH_SIMILARITY,
    });
    // Defense in depth: re-apply the gate-1 threshold app-side too, so a
    // mis-set RPC default can never widen what this flow shows.
    const aboveThreshold = rows.filter((r) => (r.similarity ?? 0) >= FIND_MATCH_SIMILARITY);

    if (aboveThreshold.length === 0) {
      return NextResponse.json({ findRequestId, matches: [] });
    }

    // 3. Rank with the existing hybrid reranker (attribute-aware order).
    let orderedIds: string[];
    try {
      orderedIds = await rerankByRelevance(description, aboveThreshold);
    } catch (e) {
      console.error("[find] rerank failed, using vector order:", e instanceof Error ? e.message : e);
      orderedIds = aboveThreshold.map((r) => r.id);
    }

    // 4. Fetch the real item rows for the ranked head: the vector RPC filters
    // on status='active', but the lifecycle source of truth is returned_at —
    // re-check it here so a returned item can never resurface in this flow.
    const headIds = orderedIds.slice(0, MAX_MATCHES * 2); // small buffer in case some are returned
    const { data: itemRows } = await supabase
      .from("items")
      .select("id, name, description, date_found, photo_path, pin_hash, returned_at, department_id, departments(name)")
      .in("id", headIds)
      .is("returned_at", null);

    type ItemRow = {
      id: string; name: string; description: string; date_found: string | null;
      photo_path: string; pin_hash: string | null;
      departments: { name: string | null } | null;
    };
    const byId = new Map(((itemRows ?? []) as unknown as ItemRow[]).map((r) => [r.id, r]));
    const top = orderedIds.map((id) => byId.get(id)).filter((r): r is ItemRow => Boolean(r)).slice(0, MAX_MATCHES);

    // 5. Gate 2 per shown match, in parallel: unblur only when the strict
    // scorer corroborates the committed description against THIS item. Scorer
    // failure fails CLOSED (blurred), never open.
    const matches: FindMatch[] = await Promise.all(
      top.map(async (item): Promise<FindMatch> => {
        let photoUrl: string | null = null;
        if (item.pin_hash === null) {
          let score = 0;
          try {
            score = await scoreMatch(item.description, description, {
              purpose: "SEMANTIC_SEARCH",
              timeoutMs: 5000,
              maxRetries: 0,
            });
          } catch (e) {
            console.error("[find] scorer failed (photo stays blurred):", e instanceof Error ? e.message : e);
          }
          if (score > UNBLUR_MATCH_SCORE) {
            const { data: signed } = await supabase.storage
              .from("items")
              .createSignedUrl(item.photo_path, SIGNED_URL_TTL_S);
            photoUrl = signed?.signedUrl ?? null;
          }
        }
        return {
          id: item.id,
          name: item.name,
          date_found: item.date_found,
          department_name: item.departments?.name ?? null,
          photoUrl,
        };
      })
    );

    return NextResponse.json({ findRequestId, matches });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Find failed";
    console.error("[find]", msg);
    return NextResponse.json({ error: "Search failed. Please try again." }, { status: 500 });
  }
}
