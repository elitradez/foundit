#!/usr/bin/env node
/**
 * Reembed gym "Retrieve" items into items.embedding (retrieve-gym-dev ONLY).
 *
 * Backfills/refreshes embeddings for the seeded items (and any row missing one).
 * Uses OpenAI text-embedding-3-small (1536-dim) — must match the items.embedding
 * vector(1536) column and lib/retrieve/ai.ts.
 *
 * RUN (loads gym keys from .env.local without printing them):
 *   node --env-file=.env.local scripts/retrieve/reembed-items.mjs            # only rows missing an embedding
 *   node --env-file=.env.local scripts/retrieve/reembed-items.mjs --all      # re-embed every row
 *
 * Requires in env: NEXT_PUBLIC_RETRIEVE_SUPABASE_URL,
 *                  RETRIEVE_SUPABASE_SERVICE_ROLE_KEY, RETRIEVE_OPENAI_API_KEY.
 */
import { createClient } from "@supabase/supabase-js";

const TENANT = "livefitgym";
const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIM = 1536;
const ALL = process.argv.includes("--all");

const url = process.env.NEXT_PUBLIC_RETRIEVE_SUPABASE_URL;
const serviceKey = process.env.RETRIEVE_SUPABASE_SERVICE_ROLE_KEY;
const openaiKey = process.env.RETRIEVE_OPENAI_API_KEY;

function requireEnv(name, val) {
  if (!val || !val.trim()) {
    console.error(`Missing ${name}. Run with: node --env-file=.env.local scripts/retrieve/reembed-items.mjs`);
    process.exit(1);
  }
}
requireEnv("NEXT_PUBLIC_RETRIEVE_SUPABASE_URL", url);
requireEnv("RETRIEVE_SUPABASE_SERVICE_ROLE_KEY", serviceKey);
requireEnv("RETRIEVE_OPENAI_API_KEY", openaiKey);

// Safety: never let this point at the campus DB by accident.
if (!url.includes("tuqjckhmtlnyiqmxlroo")) {
  console.error(`Refusing to run: NEXT_PUBLIC_RETRIEVE_SUPABASE_URL is not the gym DB (tuqjckhmtlnyiqmxlroo). Got: ${url}`);
  process.exit(1);
}

// Keep IN SYNC with itemEmbeddingText() in lib/retrieve/ai.ts.
function itemEmbeddingText({ name, notes, category }) {
  return [name, notes, category].map((s) => (s ?? "").trim()).filter(Boolean).join(". ");
}

async function embed(text) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
    body: JSON.stringify({ model: EMBED_MODEL, input: text, dimensions: EMBED_DIM }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text().catch(() => "")}`);
  const json = await res.json();
  const vec = json?.data?.[0]?.embedding;
  if (!Array.isArray(vec) || vec.length !== EMBED_DIM) throw new Error("bad embedding shape");
  return vec;
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  let query = supabase.from("items").select("id, name, notes, category, embedding").eq("tenant_id", TENANT);
  if (!ALL) query = query.is("embedding", null);
  const { data: rows, error } = await query;
  if (error) {
    console.error("Failed to load items:", error.message);
    process.exit(1);
  }
  console.log(`Tenant ${TENANT}: ${rows.length} item(s) to embed (${ALL ? "all" : "missing-only"}).`);

  let ok = 0;
  let failed = 0;
  for (const row of rows) {
    const text = itemEmbeddingText(row);
    if (!text) {
      console.log(`  skip ${row.id} — no text to embed`);
      continue;
    }
    try {
      const vec = await embed(text);
      const { error: upErr } = await supabase
        .from("items")
        .update({ embedding: JSON.stringify(vec) })
        .eq("id", row.id);
      if (upErr) throw upErr;
      ok++;
      console.log(`  ok   ${row.id} — ${row.name}`);
    } catch (e) {
      failed++;
      console.error(`  FAIL ${row.id} — ${row.name}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`Done. embedded=${ok} failed=${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
