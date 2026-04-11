import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

type SearchBody = { query?: string };

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
  try {
    const body = (await req.json().catch(() => ({}))) as SearchBody;
    const query = body.query?.trim() ?? "";
    if (!query) return NextResponse.json({ itemIds: [] });

    const supabase = createAdminSupabaseClient();
    const universityId = process.env.NEXT_PUBLIC_UNIVERSITY_ID?.trim() || null;
    const matchedIds = new Set<string>();

    // 1. Date matching — preserve existing behavior
    const parsedDate = extractDate(query);
    if (parsedDate) {
      let dateQuery = supabase
        .from("items")
        .select("id")
        .eq("date_found", parsedDate)
        .is("returned_at", null);
      if (universityId) dateQuery = dateQuery.eq("university_id", universityId);
      const { data } = await dateQuery;
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
          match_threshold: 0.3,
          match_count: 20,
          p_university_id: universityId,
        });
        for (const row of vectorResults ?? []) matchedIds.add(row.id);
      }
    }

    // 3. Fallback: if no vector results (items not yet embedded), use SQL ILIKE
    if (matchedIds.size === 0) {
      const pattern = `%${query.replace(/[%_]/g, "\\$&")}%`;
      let nameQ = supabase.from("items").select("id").ilike("name", pattern).is("returned_at", null);
      let descQ = supabase.from("items").select("id").ilike("description", pattern).is("returned_at", null);
      if (universityId) {
        nameQ = nameQ.eq("university_id", universityId);
        descQ = descQ.eq("university_id", universityId);
      }
      const [{ data: nameData }, { data: descData }] = await Promise.all([nameQ, descQ]);
      for (const row of [...(nameData ?? []), ...(descData ?? [])]) matchedIds.add(row.id);
    }

    return NextResponse.json({ itemIds: Array.from(matchedIds) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Search failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
