import { NextResponse } from "next/server";
import { getStaffSession } from "@/lib/staff-api";
import {
  extractTextContent,
  getAnthropicClient,
  getAnthropicModel,
  parseJsonFromModel,
} from "@/lib/anthropic";
import { parseValueTier } from "@/lib/value-tier";

const SYSTEM_PROMPT = `You analyze photos for a university lost-and-found desk. Respond with ONLY valid JSON (no markdown fences) in exactly this shape:
{"name":"...","description":"...","color":"...","value_tier":"low_value" or "high_value"}

FIELD RULES:
- "description": Brief description with color and distinguishing features (wear, stickers, text, material).
- "color": Primary color as a short phrase (e.g. "black", "navy blue").

VALUE TIER — classify every item as "low_value" or "high_value". If uncertain, use "high_value".

HIGH_VALUE (expensive, sensitive, or easily resold — student-facing listing will hide photo detail):
- Laptops, tablets, iPads
- Phones, smartphones
- Cameras, lenses
- Wallets, purses
- AirPods, headphones, earbuds
- Jewelry, watches
- Passports, IDs
- Graphing calculators
- External hard drives, USB drives
- Designer-looking sunglasses

For HIGH_VALUE items, "name" MUST be maximally generic (no brand/model in the name). Examples:
- "Laptop" not "MacBook Pro"
- "Headphones" not "AirPods Pro"
- "Phone" not "iPhone 14"
- "Wallet" not "Brown leather bifold wallet"
- "Watch" not "Apple Watch Series 8"

LOW_VALUE (common left-behinds — photo can be shown clearly):
- Water bottles, mugs, cups
- Umbrellas
- Jackets, hoodies, sweaters
- Keys without expensive fobs
- Notebooks, textbooks, folders
- Hats, caps, beanies
- Chargers, cables
- Scarves, gloves
- Reusable bags, plain totes
- Shoes

For LOW_VALUE items, "name" may be slightly descriptive (still short):
- "Blue water bottle", "Black umbrella", "Gray hoodie", "House keys"`;

function toMediaType(mime: string): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  if (mime === "image/png" || mime === "image/gif" || mime === "image/webp") return mime;
  return "image/jpeg";
}

export async function POST(req: Request) {
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

  const client = getAnthropicClient();
  const message = await client.messages.create({
    model: getAnthropicModel(),
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          {
            type: "text",
            text: "Analyze this lost item photo. Output only the JSON object with name, description, color, and value_tier.",
          },
        ],
      },
    ],
  });

  const text = extractTextContent(message);
  let parsed: unknown;
  try {
    parsed = parseJsonFromModel(text);
  } catch {
    return NextResponse.json(
      { error: "Could not parse AI response", raw: text.slice(0, 500) },
      { status: 502 },
    );
  }
  if (typeof parsed !== "object" || parsed === null) {
    return NextResponse.json({ error: "Invalid AI JSON shape", raw: text.slice(0, 500) }, { status: 502 });
  }
  const o = parsed as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const description = typeof o.description === "string" ? o.description.trim() : "";
  const color = typeof o.color === "string" ? o.color.trim() : "";
  const value_tier = parseValueTier(o.value_tier);

  if (!name || !description || !color || !value_tier) {
    return NextResponse.json({ error: "Invalid AI JSON shape", raw: text.slice(0, 500) }, { status: 502 });
  }

  return NextResponse.json({ name, description, color, value_tier });
}
