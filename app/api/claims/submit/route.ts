import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import {
  extractTextContent,
  getAnthropicClient,
  getAnthropicModel,
  parseJsonFromModel,
} from "@/lib/anthropic";
import { verifyPin } from "@/lib/pin";

async function computeMatchScore(
  officialDescription: string,
  studentDescription: string,
): Promise<number> {
  const client = getAnthropicClient();
  const prompt = `You compare a student's description of their lost item to the official logged description.

Official (staff/AI) description:
${officialDescription}

Student's description:
${studentDescription}

Return ONLY valid JSON: {"score": <number>} where score is an integer from 0 to 100 meaning how likely both descriptions refer to the same physical item. Be strict: generic matches should score low.`;

  const message = await client.messages.create({
    model: getAnthropicModel(),
    max_tokens: 256,
    messages: [{ role: "user", content: prompt }],
  });
  const text = extractTextContent(message);
  const parsed = parseJsonFromModel(text) as { score?: unknown };
  const raw = Number(parsed?.score);
  if (!Number.isFinite(raw)) throw new Error("Invalid match response");
  const score = Math.round(raw);
  return Math.min(100, Math.max(0, score));
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      itemId?: string;
      studentDescription?: string;
      pin?: string;
    };
    const itemId = body.itemId?.trim();
    const studentDescription = body.studentDescription?.trim();
    const pin = body.pin?.trim() ?? "";

    if (!itemId || !studentDescription) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (studentDescription.length > 4000) {
      return NextResponse.json({ error: "Description too long" }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const { data: item, error: fetchErr } = await supabase
      .from("items")
      .select("id, name, description, returned_at, claim_description, pin_hash, pin_salt")
      .eq("id", itemId)
      .maybeSingle();

    if (fetchErr || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    if (item.returned_at) {
      return NextResponse.json({ error: "Item no longer available" }, { status: 410 });
    }
    if (item.claim_description) {
      return NextResponse.json({ error: "This item already has a submitted claim" }, { status: 409 });
    }

    if (item.pin_hash && item.pin_salt) {
      if (!pin || !verifyPin(pin, item.pin_hash, item.pin_salt)) {
        return NextResponse.json({ error: "Invalid PIN" }, { status: 403 });
      }
    }

    const score = await computeMatchScore(item.description, studentDescription);
    if (score <= 60) {
      return NextResponse.json(
        { error: "Match score too low to submit a claim. Refine your description.", score },
        { status: 403 },
      );
    }

    const { error: upErr } = await supabase
      .from("items")
      .update({
        claim_description: studentDescription,
      })
      .eq("id", itemId)
      .is("claim_description", null);

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, score });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Submit failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
