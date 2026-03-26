import { NextResponse } from "next/server";
import { isStaffAuthenticated } from "@/lib/staff-api";
import {
  extractTextContent,
  getAnthropicClient,
  getAnthropicModel,
  parseJsonFromModel,
} from "@/lib/anthropic";

const PROMPT =
  "Identify this lost item. Return a JSON object with: name (short item name), description (detailed description including color, brand, condition, any identifying features)";

function toMediaType(mime: string): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  if (mime === "image/png" || mime === "image/gif" || mime === "image/webp") return mime;
  return "image/jpeg";
}

export async function POST(req: Request) {
  if (!(await isStaffAuthenticated())) {
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
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          { type: "text", text: PROMPT },
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
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as { name?: unknown }).name !== "string" ||
    typeof (parsed as { description?: unknown }).description !== "string"
  ) {
    return NextResponse.json({ error: "Invalid AI JSON shape", raw: text.slice(0, 500) }, { status: 502 });
  }
  const { name, description } = parsed as { name: string; description: string };
  return NextResponse.json({ name: name.trim(), description: description.trim() });
}
