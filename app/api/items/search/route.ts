import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { extractTextContent, getAnthropicClient, getAnthropicModel, parseJsonFromModel } from "@/lib/anthropic";

const SEARCH_SYSTEM_PROMPT =
  "You are a lost and found search assistant. Given a search query and a list of items, return the IDs of items that match or are relevant to the query. Match on item name, description, the location where it was found, and the department name. Be generous — if someone searches 'watch' match any timepiece; 'keys' matches keychains and fobs; 'Marriott' matches items found at the Marriott Library. Return a JSON array of matching item IDs only.";

type SearchBody = {
  query?: string;
};

type ActiveItem = {
  id: string;
  name: string;
  description: string;
  location: string;
  date_found: string;
  department_name: string | null;
};

// ── Date parsing ─────────────────────────────────────────────────────────────

const MONTH_MAP: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const MONTH_RE =
  "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

// Patterns that are ONLY a date (no other meaningful text)
const PURE_DATE_RE = new RegExp(
  `^(?:today|yesterday|\\d{4}-\\d{2}-\\d{2}|${MONTH_RE}\\.?\\s+\\d{1,2})$`,
  "i"
);

// Patterns that may appear inside a longer query
const EMBEDDED_DATE_RE = new RegExp(
  `\\b(?:today|yesterday|\\d{4}-\\d{2}-\\d{2}|${MONTH_RE}\\.?\\s+\\d{1,2})\\b`,
  "i"
);

function toISODate(d: Date): string {
  // Use local date parts to avoid UTC drift
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Returns an ISO date string (YYYY-MM-DD) if the token is a recognised date, else null. */
function parseToken(token: string): string | null {
  const t = token.trim().toLowerCase();
  if (!t) return null;

  const now = new Date();

  if (t === "today") return toISODate(now);

  if (t === "yesterday") {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return toISODate(d);
  }

  // ISO date  2026-04-05
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;

  // "April 5" / "Apr 5" / "Apr. 5"
  const md = t.match(new RegExp(`^${MONTH_RE}\\.?\\s+(\\d{1,2})$`, "i"));
  if (md) {
    const month = MONTH_MAP[md[1].toLowerCase()];
    const day = parseInt(md[2] ?? md[md.length - 1], 10);
    if (month && day >= 1 && day <= 31) {
      return `${now.getFullYear()}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  return null;
}

/** Extracts a date from anywhere in the query string (for combined queries). */
function extractDate(query: string): string | null {
  const match = query.match(EMBEDDED_DATE_RE);
  if (!match) return null;
  return parseToken(match[0]);
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as SearchBody;
    const query = body.query?.trim() ?? "";
    if (!query) return NextResponse.json({ itemIds: [] as string[] });

    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("items")
      .select("id, name, description, location, date_found, departments(name)")
      .is("returned_at", null)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const items: ActiveItem[] = (data ?? []).map((row) => {
      const r = row as unknown as {
        id: string;
        name: string;
        description: string;
        location: string;
        date_found: string;
        departments: { name: string | null } | null;
      };
      return {
        id: r.id,
        name: r.name,
        description: r.description,
        location: r.location,
        date_found: r.date_found,
        department_name: r.departments?.name ?? null,
      };
    });

    if (items.length === 0) return NextResponse.json({ itemIds: [] as string[] });

    const matchedIds = new Set<string>();

    // ── 1. Date matching ──────────────────────────────────────────────────────
    const parsedDate = extractDate(query);
    if (parsedDate) {
      for (const item of items) {
        if (item.date_found === parsedDate) matchedIds.add(item.id);
      }
    }

    // ── 2. AI text search (name + description + location + department) ────────
    // Skip the AI call only when the entire query is purely a date token —
    // running AI on "today" / "2026-04-05" would just add latency with no benefit.
    const isPureDateQuery = PURE_DATE_RE.test(query);

    if (!isPureDateQuery) {
      const client = getAnthropicClient();
      const message = await client.messages.create({
        model: getAnthropicModel(),
        max_tokens: 1200,
        system: SEARCH_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: JSON.stringify({
              query,
              items: items.map((i) => ({
                id: i.id,
                name: i.name,
                description: i.description,
                location: i.location,
                department: i.department_name,
              })),
            }),
          },
        ],
      });

      const text = extractTextContent(message);
      let parsed: unknown;
      try {
        parsed = parseJsonFromModel(text);
      } catch {
        parsed = [];
      }

      if (Array.isArray(parsed)) {
        const valid = new Set(items.map((i) => i.id));
        for (const v of parsed) {
          if (typeof v === "string" && valid.has(v)) matchedIds.add(v);
        }
      }
    }

    return NextResponse.json({ itemIds: Array.from(matchedIds) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Search failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
