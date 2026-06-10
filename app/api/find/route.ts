import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { getUniversityId } from "@/lib/university-config";
import { aiLimiter, getClientIp, isRateLimited } from "@/lib/ratelimit";
import { embedQuery, lexicalSearchItems, rerankByRelevance, vectorSearchItems, type VectorRow } from "@/lib/search";
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

// Gate 1's lexical signal: a score of 0.5+ means a genuine word-level hit on
// the item's name/description ("knife" -> "Pocket Knife"), not trigram noise.
// Qualifies a match to be SHOWN only — never to be unblurred.
const FIND_LEX_SCORE = 0.5;

// Gate 2 — the strict AI match score required to UNBLUR a shown match's photo.
// Same bar as the existing browse reveal (/api/claims/match). Anti-fraud: the
// photo stays blurred unless the committed description corroborates specific
// details of this exact item.
const UNBLUR_MATCH_SCORE = 60;

const MAX_MATCHES = 5;
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
  // PIN items never unblur (existing rule) — the client uses this to offer the
  // add-more-detail verify step only where it can actually succeed.
  requiresPin: boolean;
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

    // No minimum length — "knife" is a valid search. The unblur gates carry
    // the anti-fraud burden; terse descriptions just stay blurred.
    if (description.length === 0) {
      return NextResponse.json({ error: "Please describe your item." }, { status: 400 });
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

    // 2. Recall for gate 1 — two signals, either qualifies a match to be SHOWN:
    //    - pgvector similarity >= FIND_MATCH_SIMILARITY (conservative, in SQL)
    //    - a real lexical word hit (>= FIND_LEX_SCORE): embeddings compress
    //      hard on one-word queries, so "knife" scores the catalog's Pocket
    //      Knife below the vector gate even though it's an obvious match.
    // This widens only WHAT IS SHOWN (name + blurred photo — the same data
    // browse shows publicly). The UNBLUR gates below are completely unchanged:
    // revealing a photo still requires the strict per-item scorer, and PIN
    // items never unblur.
    const [embedding, lexRows] = await Promise.all([
      embedQuery(description),
      lexicalSearchItems(supabase, description, universityId),
    ]);

    const vecRows = embedding
      ? await vectorSearchItems(supabase, embedding, universityId, {
          matchThreshold: FIND_MATCH_SIMILARITY,
        })
      : [];
    if (!embedding) {
      console.error("[find] embedding unavailable; using lexical-only recall");
    }
    // Defense in depth: re-apply the gate-1 threshold app-side too, so a
    // mis-set RPC default can never widen what this flow shows.
    const candidateById = new Map<string, VectorRow>();
    for (const r of vecRows) {
      if ((r.similarity ?? 0) >= FIND_MATCH_SIMILARITY) candidateById.set(r.id, r);
    }
    for (const l of lexRows) {
      if ((l.lex_score ?? 0) < FIND_LEX_SCORE) continue;
      const existing = candidateById.get(l.id);
      if (existing) existing.lexScore = l.lex_score;
      else candidateById.set(l.id, { id: l.id, name: l.name, description: l.description, similarity: 0, lexScore: l.lex_score });
    }
    const aboveThreshold = [...candidateById.values()].sort(
      (a, b) => (b.similarity ?? 0) - (a.similarity ?? 0) || (b.lexScore ?? 0) - (a.lexScore ?? 0),
    );

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
          requiresPin: item.pin_hash !== null,
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
