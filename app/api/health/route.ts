import { NextResponse } from "next/server";
import { getAnthropicClient, getAnthropicModel } from "@/lib/anthropic";

export const maxDuration = 15;
export const dynamic = "force-dynamic";

export async function GET() {
  const model = getAnthropicModel();

  try {
    const client = getAnthropicClient();
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 10_000);

    try {
      await client.messages.create(
        {
          model,
          max_tokens: 5,
          messages: [{ role: "user", content: "hi" }],
        },
        { signal: ac.signal }
      );
    } finally {
      clearTimeout(timeout);
    }

    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
