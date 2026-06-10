import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { getUniversityId } from "@/lib/university-config";
import { aiLimiter, getClientIp, isRateLimited } from "@/lib/ratelimit";

type SearchBody = { query?: string };

// Students search from memory with vague, imperfect descriptions — "blue
// water bottle" for a teal one, or just "water bottle". We optimise for
// RECALL: surface every plausible match and let the student's eye (and the
// in-person staff check) pick out their item. A missed match means someone
// never gets their property back; an extra item just costs a glance.
//   - A low absolute floor keeps near-matches (teal ≈ blue) in the results.
//   - Relevance ORDER (best first) surfaces the strongest matches at the top;
//     it does NOT shrink the set, so the floor is the real narrowing lever.
// TUNING: text-embedding-3-small produces compressed cosine scores, so on a
// homogeneous lost-and-found catalog a low floor can let a vague query ("black",
// "jacket") clear it against much of the catalog. 0.3 favors recall; if vague
// queries feel unfiltered against the live data, raise the floor a little —
// but cautiously, since real near-matches (the teal bottle) sit around ~0.5.
const VECTOR_MATCH_THRESHOLD = 0.3; // recall floor — tune against the live catalog
const VECTOR_MATCH_COUNT = 50;

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

    // 1. Date matching — preserve existing behavior
    const parsedDate = extractDate(query);
    if (parsedDate) {
      const { data } = await supabase
        .from("items")
        .select("id")
        .eq("date_found", parsedDate)
        .eq("university_id", universityId)
        .is("returned_at", null);
      for (const row of data ?? []) matchedIds.add(row.id);
    }

    // 2. Vector search
    const embRes = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model: "text-embedding-3-small", input: query }),
    });

    if (embRes.ok) {
      const embData = await embRes.json();
      const embedding = embData?.data?.[0]?.embedding;
      if (Array.isArray(embedding)) {
        const { data: vectorResults } = await supabase.rpc("search_items", {
          query_embedding: embedding,
          match_threshold: VECTOR_MATCH_THRESHOLD,
          match_count: VECTOR_MATCH_COUNT,
          p_university_id: universityId,
        });
        // Keep EVERY item above the recall floor, ordered best-first. We use
        // the `similarity` score only to RANK (so the closest match leads),
        // never to trim — a teal bottle that's a plausible "blue" match stays
        // in the list, just below the exact ones. Date matches added above
        // sit first (an exact date is a strong, intentional signal).
        type VectorRow = { id: string; similarity?: number };
        const ranked = ((vectorResults ?? []) as VectorRow[])
          .filter((r) => r && typeof r.id === "string")
          .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));
        for (const row of ranked) matchedIds.add(row.id);
      }
    }

    // 3. Fallback: if no vector results (items not yet embedded), use SQL ILIKE
    if (matchedIds.size === 0) {
      const pattern = `%${query.replace(/[%_]/g, "\\$&")}%`;
      const nameQ = supabase.from("items").select("id").ilike("name", pattern).eq("university_id", universityId).is("returned_at", null);
      const descQ = supabase.from("items").select("id").ilike("description", pattern).eq("university_id", universityId).is("returned_at", null);
      const [{ data: nameData }, { data: descData }] = await Promise.all([nameQ, descQ]);
      for (const row of [...(nameData ?? []), ...(descData ?? [])]) matchedIds.add(row.id);
    }

    return NextResponse.json({ itemIds: Array.from(matchedIds) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Search failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
