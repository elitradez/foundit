import { NextResponse } from "next/server";
import { getAnthropicClient, getAnthropicModel } from "@/lib/anthropic";

export const maxDuration = 15;
export const dynamic = "force-dynamic";

export async function GET() {
  const model = getAnthropicModel();
  const start = Date.now();

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

    return NextResponse.json(
      { status: "ok", model, latency_ms: Date.now() - start },
      { status: 200 }
    );
  } catch (err) {
    const e = err as { message?: string; status?: number; name?: string };
    return NextResponse.json(
      {
        status: "error",
        model,
        latency_ms: Date.now() - start,
        error: e?.message ?? "Unknown error",
        code: e?.status,
      },
      { status: 500 }
    );
  }
}
