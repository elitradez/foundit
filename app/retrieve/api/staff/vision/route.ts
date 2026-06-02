import { NextResponse } from "next/server";
import { getRetrieveStaffSession } from "@/lib/retrieve/staff-session";
import {
  getRetrieveAnthropic,
  parseImageDataUrl,
  RETRIEVE_VISION_MODEL,
  type ImageMediaType,
} from "@/lib/retrieve/ai";
import { RETRIEVE_CATEGORIES, RETRIEVE_CONFIG, type CategoryKey } from "@/lib/retrieve/config";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_DATA_URL_BYTES = 8 * 1024 * 1024;

const CATEGORY_KEYS = RETRIEVE_CATEGORIES.map((c) => c.key) as CategoryKey[];
const CATEGORY_SET = new Set<string>(CATEGORY_KEYS);

/** A prefill the client can apply field-by-field. Empty string = "leave as-is". */
type Prefill = { name: string; category: CategoryKey | ""; notes: string };
const BLANK: Prefill = { name: "", category: "", notes: "" };

/** Strict: any unrecognized value collapses to "other" (never errors). */
function normalizeCategory(raw: unknown): CategoryKey {
  if (typeof raw === "string" && CATEGORY_SET.has(raw)) return raw as CategoryKey;
  return "other";
}

const SYSTEM_PROMPT = `You analyze photos for a ${RETRIEVE_CONFIG.venueKind} lost-and-found front desk. Identify the single most prominent lost item in the photo and record it via the record_item tool.

Items found at a ${RETRIEVE_CONFIG.venueKind} are typically personal electronics (phones, earbuds/AirPods, headphones, smartwatches, laptops, chargers), water bottles, gym/locker keys, wallets, ID/membership cards, clothing, bags/backpacks, jewelry/watches, and glasses/sunglasses. When the image is ambiguous, prefer the simpler, more common explanation.

FIELD RULES:
- name: The specific product when recognizable, including brand and model (e.g. "Apple AirPods Pro", "Hydro Flask 32oz", "Nike Pro hoodie"). Fall back to a plain noun only when the brand truly cannot be read (e.g. "Wireless earbuds").
- category: Choose the single best fit from the allowed list. Use "other" only when nothing fits.
- color: Primary color as a short phrase ("black", "navy blue").
- description: Distinguishing features — wear, stickers, engravings, text, material. Do not repeat the name.`;

const TOOL = {
  name: "record_item",
  description: "Record the identified lost item's details.",
  input_schema: {
    type: "object" as const,
    properties: {
      name: { type: "string", description: "Specific product name with brand/model when readable." },
      category: { type: "string", enum: CATEGORY_KEYS, description: "Best-fit category from the allowed list." },
      color: { type: "string", description: "Primary color, short phrase." },
      description: { type: "string", description: "Distinguishing features; do not repeat the name." },
    },
    required: ["name", "category", "color", "description"],
  },
};

function buildNotes(color: string, description: string): string {
  const c = color.trim();
  const d = description.trim();
  if (c && d) return `${c} — ${d}`;
  return c || d;
}

async function callVision(base64: string, mediaType: ImageMediaType): Promise<Prefill> {
  const client = getRetrieveAnthropic();
  if (!client) return BLANK;

  const message = await client.messages.create({
    model: RETRIEVE_VISION_MODEL,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    tools: [TOOL],
    tool_choice: { type: "tool", name: "record_item" },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: "Identify this lost item and call record_item with its details." },
        ],
      },
    ],
  });

  const toolUse = message.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") return BLANK;
  const o = (toolUse.input ?? {}) as Record<string, unknown>;

  const name = typeof o.name === "string" ? o.name.trim() : "";
  const color = typeof o.color === "string" ? o.color : "";
  const description = typeof o.description === "string" ? o.description : "";
  // Schema enforces category, but normalize defensively (invalid -> "other").
  const category = normalizeCategory(o.category);

  return { name, category, notes: buildNotes(color, description) };
}

export async function POST(req: Request) {
  // Staff-gated, same as the rest of /retrieve/api/staff/*.
  const session = await getRetrieveStaffSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // From here on: NEVER error the intake. Any failure returns a blank prefill so
  // the staffer just fills the form manually.
  let photo: string | undefined;
  try {
    const body = (await req.json()) as { photo?: string };
    photo = body.photo;
  } catch {
    return NextResponse.json({ ok: false, ...BLANK });
  }

  if (typeof photo !== "string" || photo.length > MAX_DATA_URL_BYTES) {
    return NextResponse.json({ ok: false, ...BLANK });
  }
  const parsed = parseImageDataUrl(photo);
  if (!parsed) return NextResponse.json({ ok: false, ...BLANK });

  try {
    const prefill = await callVision(parsed.base64, parsed.mediaType);
    return NextResponse.json({ ok: Boolean(prefill.name), ...prefill });
  } catch (err) {
    console.error("[retrieve/vision] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, ...BLANK });
  }
}
