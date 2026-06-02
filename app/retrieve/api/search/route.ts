import { NextResponse } from "next/server";
import { getRetrieveServiceClient } from "@/lib/retrieve/supabase-server";
import { embedText, rerankCandidates, type RerankCandidate } from "@/lib/retrieve/ai";
import { getClientIp, isRateLimited, retrieveSearchLimiter } from "@/lib/retrieve/ratelimit";
import type { CategoryKey } from "@/lib/retrieve/config";

export const runtime = "nodejs";
export const maxDuration = 30;

const TENANT = "livefitgym";
const CANDIDATE_COUNT = 20;

type ItemRow = {
  id: string;
  name: string;
  category: string;
  location: string;
  date_found: string;
  notes: string | null;
  photo_path: string | null;
  status: string;
  created_at: string;
  similarity: number;
};

/** Client-facing item shape (mirrors RetrieveItem + an optional match reason). */
type SearchItem = {
  id: string;
  name: string;
  category: string;
  location: string;
  dateFound: string;
  notes: string;
  photo: string | null;
  status: string;
  reason?: string;
};

function toSearchItem(row: ItemRow): SearchItem {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    location: row.location,
    dateFound: row.date_found,
    notes: row.notes ?? "",
    photo: row.photo_path ? `/retrieve/api/photo/${row.id}` : null,
    status: row.status,
  };
}

export async function POST(req: Request) {
  if (await isRateLimited(retrieveSearchLimiter, `retrieve-search:${getClientIp(req)}`)) {
    return NextResponse.json({ error: "Too many searches. Please wait a moment." }, { status: 429 });
  }

  let query = "";
  let category: CategoryKey | "all" = "all";
  try {
    const body = (await req.json()) as { query?: string; category?: string };
    query = (body.query ?? "").trim();
    if (body.category && body.category !== "all") category = body.category as CategoryKey;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (query.length < 2) {
    return NextResponse.json({ mode: "empty", noStrongMatch: false, results: [], candidates: [] });
  }

  // 1. Embed the query. If embedding is unavailable, degrade — the client keeps
  //    its instant FTS results rather than showing nothing.
  const queryEmbedding = await embedText(query);
  if (!queryEmbedding) {
    return NextResponse.json({ mode: "degraded", noStrongMatch: false, results: [], candidates: [] });
  }

  // 2. Tenant-scoped pgvector retrieval (top ~20 candidates).
  const supabase = getRetrieveServiceClient();
  const { data, error } = await supabase.rpc("search_items", {
    query_embedding: JSON.stringify(queryEmbedding),
    match_tenant: TENANT,
    filter_status: "active",
    filter_category: category === "all" ? null : category,
    match_count: CANDIDATE_COUNT,
  });
  if (error) {
    console.error("[retrieve/search] RPC failed:", error.message);
    return NextResponse.json({ mode: "degraded", noStrongMatch: false, results: [], candidates: [] });
  }
  const rows = (data ?? []) as ItemRow[];
  const candidates = rows.map(toSearchItem);
  if (candidates.length === 0) {
    return NextResponse.json({ mode: "ai", noStrongMatch: true, results: [], candidates: [] });
  }

  // 3. Haiku rerank with honest no-match.
  const rerankInput: RerankCandidate[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    location: r.location,
    notes: r.notes ?? "",
    dateFound: r.date_found,
  }));

  let reranked;
  try {
    reranked = await rerankCandidates(query, rerankInput);
  } catch (e) {
    console.error("[retrieve/search] rerank failed:", e instanceof Error ? e.message : e);
    reranked = null;
  }

  // Rerank unavailable (no Anthropic key) or errored → fall back to vector order.
  if (!reranked) {
    return NextResponse.json({ mode: "vector", noStrongMatch: false, results: candidates, candidates });
  }

  const byId = new Map(candidates.map((c) => [c.id, c]));
  const results: SearchItem[] = [];
  for (const { id, reason } of reranked.ranked) {
    const item = byId.get(id);
    if (item) results.push({ ...item, reason });
  }

  return NextResponse.json({
    mode: "ai",
    noStrongMatch: reranked.noStrongMatch,
    results,
    candidates,
  });
}
