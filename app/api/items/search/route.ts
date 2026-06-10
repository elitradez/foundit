import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { getUniversityId } from "@/lib/university-config";
import { aiLimiter, getClientIp, isRateLimited } from "@/lib/ratelimit";
import {
  browseVectorFloor,
  countStrongCandidates,
  embedQuery,
  lexicalSearchItems,
  mergeHybridCandidates,
  rerankByRelevance,
  vectorSearchItems,
} from "@/lib/search";

type SearchBody = { query?: string };

// Hybrid search, tuned for how students actually search — from memory, with
// vague, imperfect, often misspelled queries:
//   1. RECALL — two in-database stages run in parallel and are UNIONED:
//      pgvector similarity (low floor: browse returns a ranked list, the floor
//      only cuts the true noise tail) and pg_trgm lexical matching (carries
//      short generic queries like "keys" and misspellings like "hydroflask").
//   2. RANKING — the AI reranker orders the merged head by true relevance, so
//      attributes (color, brand) win, not just object type. If it fails, the
//      deterministic hybrid order serves as fallback (AI -> hybrid -> ILIKE).

const MONTH_MAP: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
};

const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const EMBEDDED_DATE_RE = new RegExp(`\\b(?:today|yesterday|\\d{4}-\\d{2}-\\d{2}|${MONTH_RE}\\.?\\s+\\d{1,2})\\b`, "i");

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function extractDate(query: string): string | null {
  const match = query.match(EMBEDDED_DATE_RE);
  if (!match) return null;
  const t = match[0].trim().toLowerCase();
  const now = new Date();
  if (t === "today") return toISODate(now);
  if (t === "yesterday") { const d = new Date(now); d.setDate(d.getDate()-1); return toISODate(d); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const md = t.match(new RegExp(`^${MONTH_RE}\\.?\\s+(\\d{1,2})$`, "i"));
  if (md) {
    const month = MONTH_MAP[md[1].toLowerCase()];
    const day = parseInt(md[2] ?? md[md.length-1], 10);
    if (month && day >= 1 && day <= 31) {
      return `${now.getFullYear()}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    }
  }
  return null;
}

// Bound the whole request: embedding + 5s-capped rerank + queries fit well
// inside this; a hung upstream can't hold the function for minutes.
export const maxDuration = 15;

export async function POST(req: Request) {
  if (await isRateLimited(aiLimiter, getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests. Please try again in a minute." },
      { status: 429 }
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as SearchBody;
    const query = body.query?.trim() ?? "";
    if (!query) return NextResponse.json({ itemIds: [] });

    const supabase = createAdminSupabaseClient();
    const universityId = getUniversityId();
    const matchedIds = new Set<string>();

    // 1. Date matching — preserve existing behavior. Date matches are unranked
    // and sit ahead of the similarity-ranked results (an exact date is a
    // strong, intentional signal).
    const parsedDate = extractDate(query);
    let dateMatchCount = 0;
    if (parsedDate) {
      const { data } = await supabase
        .from("items")
        .select("id")
        .eq("date_found", parsedDate)
        .eq("university_id", universityId)
        .is("returned_at", null);
      for (const row of data ?? []) matchedIds.add(row.id);
      dateMatchCount = matchedIds.size;
    }

    // 2. Hybrid recall: pgvector + trigram lexical, in parallel, unioned.
    // Both stages run in the database; nothing loads the catalog into memory.
    const [embedding, lexicalRows] = await Promise.all([
      embedQuery(query),
      lexicalSearchItems(supabase, query, universityId),
    ]);
    const vectorRows = embedding
      ? await vectorSearchItems(supabase, embedding, universityId, { matchThreshold: browseVectorFloor(query) })
      : [];
    const candidates = mergeHybridCandidates(query, vectorRows, lexicalRows);
    // UI signal only — results are never trimmed by this. Lets the client say
    // "no close matches — showing similar items" instead of presenting a weak
    // best-effort tail as if it were confident matches. Exact date hits are
    // strong by definition.
    const strongCount = countStrongCandidates(candidates) + dateMatchCount;

    if (candidates.length > 0) {
      let orderedIds: string[];
      try {
        orderedIds = await rerankByRelevance(query, candidates);
      } catch (e) {
        console.error("[search] rerank failed, using hybrid order:", e instanceof Error ? e.message : e);
        orderedIds = candidates.map((r) => r.id);
      }
      for (const id of orderedIds) matchedIds.add(id);
    }

    // 3. Fallback: if no vector results (items not yet embedded), use SQL ILIKE
    if (matchedIds.size === 0) {
      const pattern = `%${query.replace(/[%_]/g, "\\$&")}%`;
      const nameQ = supabase.from("items").select("id").ilike("name", pattern).eq("university_id", universityId).is("returned_at", null);
      const descQ = supabase.from("items").select("id").ilike("description", pattern).eq("university_id", universityId).is("returned_at", null);
      const [{ data: nameData }, { data: descData }] = await Promise.all([nameQ, descQ]);
      for (const row of [...(nameData ?? []), ...(descData ?? [])]) matchedIds.add(row.id);
    }

    return NextResponse.json({ itemIds: Array.from(matchedIds), strongCount });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Search failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
