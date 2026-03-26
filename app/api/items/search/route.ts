import { NextResponse } from "next/server";
import { fetchActiveItemsForPublic } from "@/lib/public-items";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q") ?? "";
    const limitRaw = Number(searchParams.get("limit") ?? "40");
    const limit = Number.isFinite(limitRaw) ? limitRaw : 40;

    const items = await fetchActiveItemsForPublic({ query, limit });
    return NextResponse.json({ items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Search failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

