import { NextResponse } from "next/server";
import { getAnthropicClient, getAnthropicModel } from "@/lib/anthropic";
import { checkAdminSecret } from "@/lib/admin-auth";

export const maxDuration = 15;
export const dynamic = "force-dynamic";

// Shallow liveness check by default — must stay cheap and unauthenticated so
// uptime monitors can hit it freely. A deep dependency check that actually
// calls Anthropic (a paid, rate-limited API) is gated behind the admin secret
// so an anonymous flood cannot run up cost or exhaust quota.
export async function GET(req: Request) {
  if (!checkAdminSecret(req)) {
    return NextResponse.json({ status: "ok" }, { status: 200 });
  }

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

    return NextResponse.json({ status: "ok", anthropic: "ok" }, { status: 200 });
  } catch {
    return NextResponse.json({ status: "error", anthropic: "error" }, { status: 500 });
  }
}
