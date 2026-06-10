// Browse-search regression harness.
//
//   npm run eval:search                       -> evaluates the LIVE site
//   EVAL_BASE_URL=http://localhost:3000 \
//   npm run eval:search                       -> evaluates a local/preview build
//
// For every query in scripts/search-eval-queries.json it prints the full
// per-stage picture against the live catalog:
//   - pgvector cosine similarity for EVERY active item (RPC called with a
//     near-zero floor so nothing is hidden from the diagnostic view)
//   - lexical/trigram score from lexical_search_items (n/a until that
//     migration exists on the target DB)
//   - the FINAL ranked position returned by the real /api/items/search
//     endpoint — the production pipeline, not a reimplementation
// then checks the expectations (mustInclude / topOne / topThree) and exits
// non-zero on any failure, so CI or a manual run gives a hard PASS/FAIL.
//
// PIPELINE CONSTANTS mirrored for annotation only (the API enforces them):
const ANNOTATE_VECTOR_FLOOR = 0.2; // browse floor; keep in sync with lib/search.ts

import { readFileSync } from "node:fs";

const SB_URL = need("NEXT_PUBLIC_SUPABASE_URL");
const SB_KEY = need("SUPABASE_SERVICE_ROLE_KEY");
const OPENAI = need("OPENAI_API_KEY");
const UNI = need("NEXT_PUBLIC_UNIVERSITY_ID");
const BASE = (process.env.EVAL_BASE_URL ?? "https://founditcampus.com").replace(/\/$/, "");

function need(k) {
  const v = process.env[k]?.trim();
  if (!v) {
    console.error(`Missing env ${k} (run via: node --env-file=.env.local scripts/search-eval.mjs)`);
    process.exit(1);
  }
  return v;
}

async function sb(path, init) {
  const res = await fetch(`${SB_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function embed(text) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI}` },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
  });
  if (!res.ok) throw new Error(`embedding -> ${res.status}`);
  return (await res.json()).data[0].embedding;
}

async function vectorStage(query) {
  const embedding = await embed(query);
  const rows = await sb("/rest/v1/rpc/search_items", {
    method: "POST",
    body: JSON.stringify({
      query_embedding: embedding,
      match_threshold: 0.001, // diagnostic: show everything
      match_count: 200,
      p_university_id: UNI,
    }),
  });
  return new Map(rows.map((r) => [r.id, r.similarity ?? 0]));
}

async function lexicalStage(query) {
  try {
    const rows = await sb("/rest/v1/rpc/lexical_search_items", {
      method: "POST",
      body: JSON.stringify({ p_query: query, p_university_id: UNI, p_limit: 200 }),
    });
    return new Map(rows.map((r) => [r.id, r.lex_score ?? 0]));
  } catch {
    return null; // function not deployed on this DB yet
  }
}

async function finalStage(query) {
  const res = await fetch(`${BASE}/api/items/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`API ${BASE}/api/items/search -> ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.itemIds) ? data.itemIds : [];
}

function fmt(n, width) {
  return String(n).padEnd(width);
}

async function main() {
  const { queries } = JSON.parse(readFileSync(new URL("./search-eval-queries.json", import.meta.url), "utf8"));

  const catalog = await sb(`/rest/v1/items?select=id,name&university_id=eq.${UNI}&returned_at=is.null&order=name`);
  const nameById = new Map(catalog.map((r) => [r.id, r.name]));
  console.log(`Catalog: ${catalog.length} active items · API under test: ${BASE}\n`);

  let failures = 0;

  for (const spec of queries) {
    const [vec, lex, finalIds] = [await vectorStage(spec.q), await lexicalStage(spec.q), await finalStage(spec.q)];
    const finalPos = new Map(finalIds.map((id, i) => [id, i + 1]));

    console.log(`\n━━ [${spec.class}] "${spec.q}" ── final results: ${finalIds.length}`);
    console.log(`   ${fmt("#", 5)}${fmt("vector", 9)}${fmt("lexical", 9)}name`);

    // Show every item with any signal, ordered by final position then vector.
    const interesting = catalog
      .map((r) => ({
        id: r.id,
        name: r.name,
        v: vec.get(r.id) ?? 0,
        l: lex?.get(r.id) ?? null,
        pos: finalPos.get(r.id) ?? null,
      }))
      .filter((r) => r.pos !== null || r.v >= 0.15 || (r.l ?? 0) > 0)
      .sort((a, b) => (a.pos ?? 999) - (b.pos ?? 999) || b.v - a.v);

    for (const r of interesting) {
      const floorNote = r.pos === null && r.v < ANNOTATE_VECTOR_FLOOR ? " (below vector floor)" : r.pos === null ? " (MISSING from final)" : "";
      console.log(
        `   ${fmt(r.pos ?? "—", 5)}${fmt(r.v.toFixed(3), 9)}${fmt(r.l === null ? "n/a" : r.l.toFixed(3), 9)}${r.name}${floorNote}`
      );
    }

    // Expectations
    const finalNames = finalIds.map((id) => (nameById.get(id) ?? "").toLowerCase());
    const problems = [];

    for (const want of spec.mustInclude ?? []) {
      const w = want.toLowerCase();
      if (!finalNames.some((n) => n.includes(w))) {
        // Pinpoint the losing stage.
        const cand = catalog.filter((r) => r.name.toLowerCase().includes(w));
        const why = cand
          .map((r) => {
            const v = vec.get(r.id) ?? 0;
            const inLex = (lex?.get(r.id) ?? 0) > 0;
            if (v < ANNOTATE_VECTOR_FLOOR && !inLex) return `${r.name}: vector ${v.toFixed(3)} below floor, no lexical hit`;
            if (v < ANNOTATE_VECTOR_FLOOR) return `${r.name}: vector ${v.toFixed(3)} below floor (lexical found it — union/rank stage dropped it)`;
            return `${r.name}: vector ${v.toFixed(3)} ABOVE floor — lost after vector stage (limit/rerank)`;
          })
          .join("; ");
        problems.push(`missing "${want}" — ${why || "no catalog item matches this name"}`);
      }
    }
    for (const want of spec.topOne ?? []) {
      if (!finalNames[0]?.includes(want.toLowerCase())) {
        problems.push(`top-1 should be "${want}", got "${finalNames[0] ?? "(none)"}"`);
        break;
      }
    }
    for (const want of spec.topThree ?? []) {
      if (!finalNames.slice(0, 3).some((n) => n.includes(want.toLowerCase()))) {
        problems.push(`"${want}" not in top 3 (top 3: ${finalNames.slice(0, 3).join(" | ")})`);
      }
    }

    if (problems.length === 0) {
      console.log(`   PASS`);
    } else {
      failures += 1;
      for (const p of problems) console.log(`   FAIL: ${p}`);
    }
  }

  console.log(`\n${"━".repeat(60)}\n${failures === 0 ? "ALL QUERIES PASS" : `${failures} QUERY(IES) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("eval crashed:", e.message);
  process.exit(1);
});
