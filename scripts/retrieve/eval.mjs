#!/usr/bin/env node
/**
 * Hybrid-search eval for the gym "Retrieve" tenant (retrieve-gym-dev ONLY).
 *
 * Compares three strategies over scripts/retrieve/queries.json:
 *   A) FTS-only      — Postgres websearch full-text (the "instant" layer)
 *   B) Vector-only   — pgvector search_items top-20, similarity order
 *   C) Hybrid        — B candidates re-ranked by Haiku with honest no-match  [PRODUCTION]
 *
 * Metrics:
 *   recall@20         — (match queries) expected item present in the top-20 candidates
 *   top-1 / top-3     — (match queries) expected item ranked 1st / within top 3
 *   no-match precision— (no-match queries) strategy correctly returns NO confident match
 *
 * RUN (loads gym keys from .env.local without printing them):
 *   node --env-file=.env.local scripts/retrieve/eval.mjs
 *
 * Requires: NEXT_PUBLIC_RETRIEVE_SUPABASE_URL, RETRIEVE_SUPABASE_SERVICE_ROLE_KEY,
 *           RETRIEVE_OPENAI_API_KEY, RETRIEVE_ANTHROPIC_API_KEY.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const TENANT = "livefitgym";
const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIM = 1536;
const RERANK_MODEL = "claude-haiku-4-5-20251001";
const CANDIDATE_COUNT = 20;
const VEC_NOMATCH_THRESHOLD = 0.42; // B's "confident" cutoff on cosine similarity

const url = process.env.NEXT_PUBLIC_RETRIEVE_SUPABASE_URL;
const serviceKey = process.env.RETRIEVE_SUPABASE_SERVICE_ROLE_KEY;
const openaiKey = process.env.RETRIEVE_OPENAI_API_KEY;
const anthropicKey = process.env.RETRIEVE_ANTHROPIC_API_KEY;
for (const [n, v] of Object.entries({
  NEXT_PUBLIC_RETRIEVE_SUPABASE_URL: url,
  RETRIEVE_SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  RETRIEVE_OPENAI_API_KEY: openaiKey,
  RETRIEVE_ANTHROPIC_API_KEY: anthropicKey,
})) {
  if (!v || !v.trim()) { console.error(`Missing ${n}`); process.exit(1); }
}
if (!url.includes("tuqjckhmtlnyiqmxlroo")) {
  console.error(`Refusing to run: not the gym DB. Got ${url}`); process.exit(1);
}

const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const anthropic = new Anthropic({ apiKey: anthropicKey });

// Keep IN SYNC with RERANK_SYSTEM / RERANK_TOOL in lib/retrieve/ai.ts.
const RERANK_SYSTEM = `You help a member of a gym find their lost item. You are given the member's description and a list of candidate found-items. Select ONLY the candidates that could genuinely be the same item, ordered best match first, and give a one-sentence reason for each that cites concrete attributes (type, brand, color, where found).

BE HONEST — this is the most important rule:
- If NONE of the candidates is a genuinely plausible match, set noStrongMatch=true and return an empty matches list. Never force or invent a match to be helpful.
- A different category, or only a vague/topical resemblance, is NOT a match.
- Only use IDs that appear in the candidate list. Never fabricate an ID.`;
const RERANK_TOOL = {
  name: "rank_matches",
  description: "Return the genuinely-matching candidates, best first, with honest no-match handling.",
  input_schema: {
    type: "object",
    properties: {
      noStrongMatch: { type: "boolean" },
      matches: {
        type: "array",
        items: {
          type: "object",
          properties: { id: { type: "string" }, reason: { type: "string" } },
          required: ["id", "reason"],
        },
      },
    },
    required: ["noStrongMatch", "matches"],
  },
};

async function embed(text) {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
    body: JSON.stringify({ model: EMBED_MODEL, input: text, dimensions: EMBED_DIM }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}`);
  return (await r.json()).data[0].embedding;
}

async function vectorCandidates(queryEmbedding) {
  const { data, error } = await sb.rpc("search_items", {
    query_embedding: JSON.stringify(queryEmbedding),
    match_tenant: TENANT,
    filter_status: "active",
    filter_category: null,
    match_count: CANDIDATE_COUNT,
  });
  if (error) throw new Error("RPC: " + error.message);
  return data; // [{id,name,...,similarity}] desc by similarity
}

async function ftsCandidates(query) {
  const { data, error } = await sb
    .from("items")
    .select("id, name, category, location, notes, date_found")
    .eq("tenant_id", TENANT)
    .eq("status", "active")
    .textSearch("fts", query, { type: "websearch", config: "english" })
    .limit(CANDIDATE_COUNT);
  if (error) throw new Error("FTS: " + error.message);
  return data;
}

async function rerank(query, candidates) {
  const msg = await anthropic.messages.create({
    model: RERANK_MODEL,
    max_tokens: 1024,
    system: RERANK_SYSTEM,
    tools: [RERANK_TOOL],
    tool_choice: { type: "tool", name: "rank_matches" },
    messages: [
      {
        role: "user",
        content: `Member is looking for: "${query}"\n\nCandidates (JSON):\n${JSON.stringify(
          candidates.map((c) => ({ id: c.id, name: c.name, category: c.category, location: c.location, notes: c.notes ?? "", dateFound: c.date_found })),
        )}\n\nCall rank_matches.`,
      },
    ],
  });
  const tu = msg.content.find((b) => b.type === "tool_use");
  if (!tu) return { noStrongMatch: true, ranked: [] };
  const valid = new Set(candidates.map((c) => c.id));
  const ranked = (Array.isArray(tu.input.matches) ? tu.input.matches : [])
    .filter((m) => m && valid.has(m.id))
    .map((m) => ({ id: m.id, reason: m.reason ?? "" }));
  return { noStrongMatch: Boolean(tu.input.noStrongMatch), ranked };
}

function pct(n, d) { return d === 0 ? "n/a" : `${((100 * n) / d).toFixed(0)}%`; }

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const fixture = JSON.parse(readFileSync(join(here, "queries.json"), "utf8"));
  const queries = fixture.queries;

  // Resolve expected names -> ids.
  const { data: allItems, error } = await sb.from("items").select("id, name").eq("tenant_id", TENANT);
  if (error) { console.error(error.message); process.exit(1); }
  const idByName = new Map(allItems.map((i) => [i.name, i.id]));
  for (const q of queries) {
    if (q.expectName && !idByName.has(q.expectName)) {
      console.error(`Fixture error: no seeded item named "${q.expectName}"`); process.exit(1);
    }
  }

  const strat = {
    A: { label: "FTS-only", recallHit: 0, top1: 0, top3: 0, nomatchOk: 0 },
    B: { label: "Vector-only", recallHit: 0, top1: 0, top3: 0, nomatchOk: 0 },
    C: { label: "Hybrid (prod)", recallHit: 0, top1: 0, top3: 0, nomatchOk: 0 },
  };
  const matchQs = queries.filter((q) => q.expectName);
  const noMatchQs = queries.filter((q) => !q.expectName);

  console.log(`\nEval: ${queries.length} queries (${matchQs.length} match, ${noMatchQs.length} no-match) on ${TENANT}\n`);
  console.log("Per-query (✓/✗ = expected item at top-1 | C no-match honesty):\n");

  for (const q of queries) {
    const expectId = q.expectName ? idByName.get(q.expectName) : null;
    const e = await embed(q.query);
    const vec = await vectorCandidates(e);
    const fts = await ftsCandidates(q.query);
    const c = await rerank(q.query, vec);

    const ranks = {
      A: fts.map((r) => r.id),
      B: vec.map((r) => r.id),
      C: c.ranked.map((r) => r.id),
    };
    const topSim = vec.length ? vec[0].similarity : 0;

    if (q.expectName) {
      for (const k of ["A", "B", "C"]) {
        const idx = ranks[k].indexOf(expectId);
        // recall@20: A/C share the candidate pools they draw from (FTS set / vector set).
        const pool = k === "A" ? fts.map((r) => r.id) : vec.map((r) => r.id);
        if (pool.includes(expectId)) strat[k].recallHit++;
        if (idx === 0) strat[k].top1++;
        if (idx >= 0 && idx < 3) strat[k].top3++;
      }
      const cHit = ranks.C[0] === expectId ? "✓" : "✗";
      console.log(`  [match]    ${cHit} C  "${q.query}"  -> ${ranks.C.length ? nameOf(allItems, ranks.C[0]) : "(no match)"}  ${c.noStrongMatch ? "[C:noStrong]" : ""}`);
    } else {
      // no-match precision
      const aOk = fts.length === 0;
      const bOk = topSim < VEC_NOMATCH_THRESHOLD;
      const cOk = c.noStrongMatch && c.ranked.length === 0;
      if (aOk) strat.A.nomatchOk++;
      if (bOk) strat.B.nomatchOk++;
      if (cOk) strat.C.nomatchOk++;
      console.log(`  [no-match] ${cOk ? "✓" : "✗"} C  "${q.query}"  -> ${cOk ? "correctly returned no match" : `LEAKED ${ranks.C.length ? nameOf(allItems, ranks.C[0]) : "(none)"}`}  (B topSim=${topSim.toFixed(2)})`);
    }
  }

  const M = matchQs.length, N = noMatchQs.length;
  console.log(`\n${"Strategy".padEnd(16)} ${"recall@20".padStart(10)} ${"top-1".padStart(8)} ${"top-3".padStart(8)} ${"no-match prec".padStart(14)}`);
  console.log("-".repeat(60));
  for (const k of ["A", "B", "C"]) {
    const s = strat[k];
    console.log(
      `${s.label.padEnd(16)} ${pct(s.recallHit, M).padStart(10)} ${pct(s.top1, M).padStart(8)} ${pct(s.top3, M).padStart(8)} ${pct(s.nomatchOk, N).padStart(14)}`,
    );
  }

  // GATE evaluation (on C — the production pipeline).
  const cTop3 = strat.C.top3 / M;
  const cNoMatch = strat.C.nomatchOk / N;
  console.log(`\nGATE (production = Hybrid C):`);
  console.log(`  no-match honesty:  ${pct(strat.C.nomatchOk, N)}  (hard gate — must be high)`);
  console.log(`  top-3 accuracy:    ${pct(strat.C.top3, M)}  (should be reasonable)`);
  const pass = cNoMatch >= 0.8 && cTop3 >= 0.7;
  console.log(`  => ${pass ? "PASS ✅" : "REVIEW ⚠️"} (thresholds: no-match >=80%, top-3 >=70%)`);
}

function nameOf(items, id) {
  return items.find((i) => i.id === id)?.name ?? id;
}

main().catch((e) => { console.error(e); process.exit(1); });
