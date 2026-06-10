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
import { readFileSync } from "node:fs";

// Floor annotations are read from lib/search.ts so the diagnostic labels can't
// drift from the code under test. The floor is length-aware (short vs long
// queries) — mirror that rule here for labelling only.
const FLOORS = (() => {
  const fallback = { short: 0.2, long: 0.3 };
  try {
    const src = readFileSync(new URL("../lib/search.ts", import.meta.url), "utf8");
    const s = src.match(/BROWSE_VECTOR_FLOOR_SHORT\s*=\s*([0-9.]+)/);
    const l = src.match(/BROWSE_VECTOR_FLOOR_LONG\s*=\s*([0-9.]+)/);
    return { short: s ? Number(s[1]) : fallback.short, long: l ? Number(l[1]) : fallback.long };
  } catch {
    return fallback;
  }
})();
const floorFor = (q) => (q.trim().split(/\s+/).filter(Boolean).length <= 2 ? FLOORS.short : FLOORS.long);

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function finalStage(query) {
  // The prod endpoint shares the per-IP aiLimiter (20/min): back-to-back runs
  // (BEFORE/AFTER, fix-and-rerun loops) can trip 429. Wait and retry so a rate
  // limit can never masquerade as a search regression.
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${BASE}/api/items/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (res.status === 429 && attempt <= 3) {
      console.log(`   (rate limited — waiting 30s, attempt ${attempt}/3)`);
      await sleep(30_000);
      continue;
    }
    if (!res.ok) throw new Error(`API ${BASE}/api/items/search -> ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.itemIds) ? data.itemIds : [];
  }
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
      const floorNote = r.pos === null && r.v < floorFor(spec.q) ? " (below vector floor)" : r.pos === null ? " (MISSING from final)" : "";
      console.log(
        `   ${fmt(r.pos ?? "—", 5)}${fmt(r.v.toFixed(3), 9)}${fmt(r.l === null ? "n/a" : r.l.toFixed(3), 9)}${r.name}${floorNote}`
      );
    }

    // Expectations
    const finalNames = finalIds.map((id) => (nameById.get(id) ?? "").toLowerCase());
    const finalIdSet = new Set(finalIds);
    const problems = [];

    // STRICT semantics: each mustInclude entry resolves to EVERY catalog item
    // whose name contains it, and every one of those items must be present by
    // id — so "Keys" can't be satisfied by "Key fob with keys" while the
    // actual Keys item silently drops out.
    for (const want of spec.mustInclude ?? []) {
      const w = want.toLowerCase();
      const candidates = catalog.filter((r) => r.name.toLowerCase().includes(w));
      if (candidates.length === 0) {
        problems.push(`mustInclude "${want}" matches no catalog item — fix the query set`);
        continue;
      }
      for (const r of candidates) {
        if (finalIdSet.has(r.id)) continue;
        const v = vec.get(r.id) ?? 0;
        const inLex = (lex?.get(r.id) ?? 0) > 0;
        const why =
          v < floorFor(spec.q) && !inLex ? `vector ${v.toFixed(3)} below floor, no lexical hit`
          : v < floorFor(spec.q) ? `vector ${v.toFixed(3)} below floor (lexical found it — union/rank stage dropped it)`
          : `vector ${v.toFixed(3)} ABOVE floor — lost after vector stage (limit/rerank)`;
        problems.push(`missing "${r.name}" — ${why}`);
      }
    }

    // Negative-control bound: catches "match everything" behavior (e.g. a
    // wildcard query or a broken floor returning the whole catalog).
    if (typeof spec.maxResults === "number" && finalIds.length > spec.maxResults) {
      problems.push(`returned ${finalIds.length} results, max allowed ${spec.maxResults}`);
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
  // Exit 2 = infrastructure failure (network, env, API down) — distinct from
  // exit 1, which means the search QUALITY expectations failed.
  console.error("eval crashed (infrastructure, not a quality failure):", e.message);
  process.exit(2);
});
