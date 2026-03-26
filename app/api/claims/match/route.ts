import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import {
  extractTextContent,
  getAnthropicClient,
  getAnthropicModel,
  parseJsonFromModel,
} from "@/lib/anthropic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { itemId?: string; studentDescription?: string };
    const itemId = body.itemId?.trim();
    const studentDescription = body.studentDescription?.trim();
    if (!itemId || !studentDescription) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (studentDescription.length > 4000) {
      return NextResponse.json({ error: "Description too long" }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const { data: item, error } = await supabase
      .from("items")
      .select("id, description, returned_at, photo_path")
      .eq("id", itemId)
      .maybeSingle();

    if (error || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    if (item.returned_at) {
      return NextResponse.json({ error: "Item no longer available" }, { status: 410 });
    }

    const client = getAnthropicClient();
    const prompt = `You compare a student's description of their lost item to the official logged description.

Official (staff/AI) description:
${item.description}

Student's description:
${studentDescription}

Return ONLY valid JSON: {"score": <number>} where score is an integer from 0 to 100 meaning how likely both descriptions refer to the same physical item. Be strict: generic matches should score low.`;

    const message = await client.messages.create({
      model: getAnthropicModel(),
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    });

    const text = extractTextContent(message);
    let parsed: unknown;
    try {
      parsed = parseJsonFromModel(text);
    } catch {
      return NextResponse.json({ error: "Could not parse match result" }, { status: 502 });
    }
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as { score?: unknown }).score !== "number"
    ) {
      return NextResponse.json({ error: "Invalid match JSON" }, { status: 502 });
    }
    const raw = Number((parsed as { score: unknown }).score);
    const score = Number.isFinite(raw) ? Math.round(raw) : 0;
    const clamped = Math.min(100, Math.max(0, score));

    let revealUrl: string | null = null;
    if (clamped > 60) {
      const { data: signed, error: signErr } = await supabase.storage
        .from("items")
        .createSignedUrl(item.photo_path, 60 * 10);
      if (!signErr && signed?.signedUrl) {
        revealUrl = signed.signedUrl;
      }
    }

    return NextResponse.json({ score: clamped, revealUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Match failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
