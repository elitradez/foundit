import { NextResponse } from "next/server";
import { getRetrieveServiceClient } from "@/lib/retrieve/supabase-server";
import { RETRIEVE_PHOTO_BUCKET } from "@/lib/retrieve/supabase";
import { decodeImageDataUrl } from "@/lib/retrieve/storage";

export const runtime = "nodejs";

const MAX_PHOTOS = 5;

type ClaimBody = {
  itemId?: string;
  description?: string;
  photos?: string[]; // data URLs (member-supplied proof — PII)
  contactName?: string;
  contactValue?: string;
  fulfillment?: "pickup" | "ship";
};

/**
 * Member claim submission. Login-free (members stay low-friction), but the
 * upload runs server-side with the service client so member proof photos land
 * in the PRIVATE bucket — never the anon client touching storage directly.
 */
export async function POST(req: Request) {
  let body: ClaimBody;
  try {
    body = (await req.json()) as ClaimBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const itemId = body.itemId?.trim();
  const description = body.description?.trim();
  const contactName = body.contactName?.trim();
  const contactValue = body.contactValue?.trim();
  const fulfillment = body.fulfillment === "ship" ? "ship" : "pickup";
  if (!itemId || !description || !contactName || !contactValue) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const supabase = getRetrieveServiceClient();
  const photos = Array.isArray(body.photos) ? body.photos.slice(0, MAX_PHOTOS) : [];
  const photo_paths: string[] = [];

  try {
    for (const dataUrl of photos) {
      const { buffer, contentType, ext } = decodeImageDataUrl(dataUrl);
      const path = `claims/${itemId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from(RETRIEVE_PHOTO_BUCKET)
        .upload(path, buffer, { contentType, upsert: false });
      if (error) throw error;
      photo_paths.push(path);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Photo upload failed";
    console.error(`[retrieve/claim] proof photo upload failed for item ${itemId}:`, msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { error } = await supabase.from("claims").insert({
    item_id: itemId,
    description,
    photo_paths,
    contact_name: contactName,
    contact_value: contactValue,
    fulfillment,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
