import { NextResponse } from "next/server";
import { getRetrieveServiceClient } from "@/lib/retrieve/supabase-server";
import { getRetrieveStaffSession } from "@/lib/retrieve/staff-session";
import { RETRIEVE_PHOTO_BUCKET } from "@/lib/retrieve/supabase";
import { isSensitiveCategory, type CategoryKey } from "@/lib/retrieve/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGNED_URL_TTL_SECONDS = 120;

/**
 * Mints a short-lived signed URL for an item photo in the PRIVATE gym bucket.
 *
 * Gate (server-side, not cosmetic):
 *   - Sensitive categories (ID / wallet / phone) require a valid staff session.
 *     Unauthenticated requests get 403 — no signed URL is ever issued, so the
 *     member-facing UI falls back to a generic category icon.
 *   - Non-sensitive items are viewable by anyone (members browse them), but only
 *     ever via a 120s signed URL — the bucket itself is private.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await params;

  const supabase = getRetrieveServiceClient();
  const { data: item, error } = await supabase
    .from("items")
    .select("id, category, photo_path")
    .eq("id", itemId)
    .maybeSingle();

  if (error || !item || !item.photo_path) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (isSensitiveCategory(item.category as CategoryKey)) {
    const session = await getRetrieveStaffSession();
    if (!session) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { data: signed, error: signErr } = await supabase.storage
    .from(RETRIEVE_PHOTO_BUCKET)
    .createSignedUrl(item.photo_path, SIGNED_URL_TTL_SECONDS);

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: "Could not sign URL" }, { status: 500 });
  }

  // 302 to the signed URL so <img src="/retrieve/api/photo/:id"> works directly.
  return NextResponse.redirect(signed.signedUrl, { status: 302 });
}
