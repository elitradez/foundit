import { NextResponse } from "next/server";
import { fetchActiveItemsForPublic } from "@/lib/public-items";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10));
    const items = await fetchActiveItemsForPublic(offset);
    return NextResponse.json({ items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load items";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
