import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { extractTextContent, getAnthropicClient, getAnthropicModel, parseJsonFromModel } from "@/lib/anthropic";

const SEARCH_SYSTEM_PROMPT =
  "You are a lost and found search assistant. Given a search query and a list of items, return the IDs of items that match or are relevant to the search. Be generous with matching - if someone searches 'watch' match any timepiece, wristwatch, smartwatch, or similar item. If someone searches 'keys' match any keys, keychains, fobs. Return a JSON array of matching item IDs only.";

type SearchBody = {
  query?: string;
};

type ActiveItem = {
  id: string;
  name: string;
  description: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as SearchBody;
    const query = body.query?.trim() ?? "";
    if (!query) {
      return NextResponse.json({ itemIds: [] as string[] });
    }

    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("items")
      .select("id, name, description")
      .is("returned_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const items = (data ?? []) as ActiveItem[];
    if (items.length === 0) {
      return NextResponse.json({ itemIds: [] as string[] });
    }

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
            items: items.map((i) => ({ id: i.id, name: i.name, description: i.description })),
          }),
        },
      ],
    });

    const text = extractTextContent(message);
    let parsed: unknown;
    try {
      parsed = parseJsonFromModel(text);
    } catch {
      return NextResponse.json({ error: "Could not parse AI search response" }, { status: 502 });
    }

    if (!Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid AI search response" }, { status: 502 });
    }

    const valid = new Set(items.map((i) => i.id));
    const itemIds = parsed.filter((v): v is string => typeof v === "string" && valid.has(v));
    return NextResponse.json({ itemIds });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Search failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

