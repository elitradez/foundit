import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { getStaffSession } from "@/lib/staff-api";
import {
  extractTextContent,
  getAnthropicClient,
  getAnthropicModel,
  parseJsonFromModel,
} from "@/lib/anthropic";

export const maxDuration = 30;

const SYSTEM_PROMPT = `You analyze photos for a university lost-and-found desk. Respond with ONLY valid JSON (no markdown fences) in exactly this shape:
{"name":"...","description":"...","color":"..."}

FIELD RULES:
- "name": Short generic name for the item (e.g. "Laptop", "Water bottle", "Hoodie"). Never include brand or model.
- "description": Brief description with color and distinguishing features (wear, stickers, text, material).
- "color": Primary color as a short phrase (e.g. "black", "navy blue").`;

type MediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

function toMediaType(mime: string): MediaType {
  if (mime === "image/png" || mime === "image/gif" || mime === "image/webp") return mime;
  return "image/jpeg";
}

async function callAnthropic(base64: string, mediaType: MediaType) {
  const client = getAnthropicClient();
  return client.messages.create({
    model: getAnthropicModel("PHOTO_ANALYSIS"),
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: "Analyze this lost item photo. Output only the JSON object with name, description, and color." },
        ],
      },
    ],
  });
}

async function callAnthropicWithRetry(base64: string, mediaType: MediaType) {
  try {
    return await callAnthropic(base64, mediaType);
  } catch (err) {
    console.error("[identify] call failed, retrying in 2s:", (err as { message?: string })?.message);
    await new Promise((r) => setTimeout(r, 2000));
    try {
      return await callAnthropic(base64, mediaType);
    } catch (retryErr) {
      Sentry.captureException(retryErr, { tags: { route: "identify", phase: "retry" } });
      throw retryErr;
    }
  }
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    console.error("[identify] ANTHROPIC_API_KEY is missing or empty");
    return NextResponse.json({ description: "" });
  }

  const session = await getStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const form = await req.formData();
  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Missing photo" }, { status: 400 });
  }
  const maxBytes = 8 * 1024 * 1024;
  if (file.size > maxBytes) {
    return NextResponse.json({ error: "Image too large" }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const base64 = buf.toString("base64");
  const mediaType = toMediaType(file.type || "image/jpeg");

  try {
    const message = await callAnthropicWithRetry(base64, mediaType);
    const text = extractTextContent(message);
    let parsed: unknown;
    try {
      parsed = parseJsonFromModel(text);
    } catch {
      return NextResponse.json({ description: "" });
    }
    if (typeof parsed !== "object" || parsed === null) {
      return NextResponse.json({ description: "" });
    }
    const o = parsed as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    const description = typeof o.description === "string" ? o.description.trim() : "";
    const color = typeof o.color === "string" ? o.color.trim() : "";

    if (!name || !description || !color) {
      return NextResponse.json({ description: "" });
    }

    return NextResponse.json({ name, description, color });
  } catch (err) {
    console.error("[identify] call failed after retry:", (err as { message?: string })?.message);
    Sentry.captureException(err, { tags: { route: "identify" } });
    return NextResponse.json({ description: "" });
  }
}
