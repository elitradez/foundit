import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * SERVER-ONLY AI helpers for the gym "Retrieve" tenant. Self-contained: does NOT
 * import the campus lib/anthropic or lib/models. Uses the gym-scoped keys
 * (RETRIEVE_ANTHROPIC_API_KEY / RETRIEVE_OPENAI_API_KEY) so the gym surface never
 * shares credentials or model config with campus.
 */

// Mirrors the campus defaults (Sonnet for photo analysis, Haiku for ranking),
// but pinned here independently and overridable per-tenant via env.
export const RETRIEVE_VISION_MODEL =
  process.env.RETRIEVE_VISION_MODEL?.trim() || "claude-sonnet-4-6";
export const RETRIEVE_RERANK_MODEL =
  process.env.RETRIEVE_RERANK_MODEL?.trim() || "claude-haiku-4-5-20251001";

/** OpenAI embedding model + dimensions — must match items.embedding vector(1536). */
export const RETRIEVE_EMBED_MODEL = "text-embedding-3-small";
export const RETRIEVE_EMBED_DIM = 1536;

let anthropic: Anthropic | null = null;

/** Gym Anthropic client. Returns null when the key is absent (callers degrade gracefully). */
export function getRetrieveAnthropic(): Anthropic | null {
  const key = process.env.RETRIEVE_ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  if (!anthropic) anthropic = new Anthropic({ apiKey: key });
  return anthropic;
}

export type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

/** Split a `data:` URL into a base64 payload + a supported image media type. */
export function parseImageDataUrl(
  dataUrl: string,
): { base64: string; mediaType: ImageMediaType } | null {
  const m = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(dataUrl);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const isBase64 = Boolean(m[2]);
  const payload = m[3];
  if (!isBase64 || !payload) return null;
  const mediaType: ImageMediaType =
    mime === "image/png" || mime === "image/gif" || mime === "image/webp"
      ? (mime as ImageMediaType)
      : "image/jpeg";
  return { base64: payload, mediaType };
}

/**
 * Embed text with OpenAI text-embedding-3-small (1536-dim) via fetch (no SDK dep).
 * Returns null on any failure or when the key is missing — callers must treat a
 * null embedding as "skip vector indexing for this row", never as a hard error.
 */
export async function embedText(text: string): Promise<number[] | null> {
  const key = process.env.RETRIEVE_OPENAI_API_KEY?.trim();
  if (!key) return null;
  const input = text.trim();
  if (!input) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: RETRIEVE_EMBED_MODEL, input, dimensions: RETRIEVE_EMBED_DIM }),
    });
    if (!res.ok) {
      console.error("[retrieve/ai] embedding HTTP", res.status, await res.text().catch(() => ""));
      return null;
    }
    const json = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
    const vec = json.data?.[0]?.embedding;
    if (!Array.isArray(vec) || vec.length !== RETRIEVE_EMBED_DIM) return null;
    return vec;
  } catch (e) {
    console.error("[retrieve/ai] embedding failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** The canonical text we embed for an item — keep IN SYNC with the reembed script. */
export function itemEmbeddingText(input: { name: string; notes: string; category: string }): string {
  return [input.name, input.notes, input.category]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(". ");
}

// ── Rerank ───────────────────────────────────────────────────────────────────
// NOTE: the prompt + tool below are mirrored in scripts/retrieve/eval.mjs so the
// eval measures the real pipeline. Keep them in sync if you change either.

export type RerankCandidate = {
  id: string;
  name: string;
  category: string;
  location: string;
  notes: string;
  dateFound: string;
};

export type RerankResult = { noStrongMatch: boolean; ranked: Array<{ id: string; reason: string }> };

export const RERANK_SYSTEM = `You help a member of a gym find their lost item. You are given the member's description and a list of candidate found-items. Select ONLY the candidates that could genuinely be the same item, ordered best match first, and give a one-sentence reason for each that cites concrete attributes (type, brand, color, where found).

BE HONEST — this is the most important rule:
- If NONE of the candidates is a genuinely plausible match, set noStrongMatch=true and return an empty matches list. Never force or invent a match to be helpful.
- A different category, or only a vague/topical resemblance, is NOT a match.
- Only use IDs that appear in the candidate list. Never fabricate an ID.`;

const RERANK_TOOL = {
  name: "rank_matches",
  description: "Return the genuinely-matching candidates, best first, with honest no-match handling.",
  input_schema: {
    type: "object" as const,
    properties: {
      noStrongMatch: {
        type: "boolean",
        description: "true when NONE of the candidates is a genuinely plausible match for the member's description.",
      },
      matches: {
        type: "array",
        description: "Genuinely-matching candidates, best match first. Empty when noStrongMatch is true.",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "An id copied exactly from the candidate list." },
            reason: { type: "string", description: "One short sentence citing concrete matching attributes." },
          },
          required: ["id", "reason"],
        },
      },
    },
    required: ["noStrongMatch", "matches"],
  },
};

/**
 * Haiku rerank with honest no-match. Returns null only when the Anthropic client
 * is unconfigured (caller degrades to vector order); throws on API/parse failure.
 */
export async function rerankCandidates(
  query: string,
  candidates: RerankCandidate[],
): Promise<RerankResult | null> {
  const client = getRetrieveAnthropic();
  if (!client) return null;
  if (candidates.length === 0) return { noStrongMatch: true, ranked: [] };

  const message = await client.messages.create({
    model: RETRIEVE_RERANK_MODEL,
    max_tokens: 1024,
    system: RERANK_SYSTEM,
    tools: [RERANK_TOOL],
    tool_choice: { type: "tool", name: "rank_matches" },
    messages: [
      {
        role: "user",
        content: `Member is looking for: "${query}"\n\nCandidates (JSON):\n${JSON.stringify(
          candidates.map((c) => ({
            id: c.id,
            name: c.name,
            category: c.category,
            location: c.location,
            notes: c.notes,
            dateFound: c.dateFound,
          })),
        )}\n\nCall rank_matches.`,
      },
    ],
  });

  const toolUse = message.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") return { noStrongMatch: true, ranked: [] };
  const o = (toolUse.input ?? {}) as { noStrongMatch?: unknown; matches?: unknown };

  const validIds = new Set(candidates.map((c) => c.id));
  const raw = Array.isArray(o.matches) ? o.matches : [];
  const ranked = raw
    .map((m) => (m && typeof m === "object" ? (m as Record<string, unknown>) : {}))
    .filter((m) => typeof m.id === "string" && validIds.has(m.id))
    .map((m) => ({ id: m.id as string, reason: typeof m.reason === "string" ? m.reason.trim() : "" }));

  return { noStrongMatch: Boolean(o.noStrongMatch), ranked };
}
