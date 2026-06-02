import "server-only";
import { getRetrieveServiceClient } from "@/lib/retrieve/supabase-server";
import { RETRIEVE_PHOTO_BUCKET } from "@/lib/retrieve/supabase";

/**
 * SERVER-ONLY storage helpers for the gym "Retrieve" tenant. Centralizes item
 * photo uploads to the PRIVATE bucket so intake (POST) and photo-retry (PATCH)
 * stay in sync.
 */

const TENANT_PREFIX = "livefitgym";
const MAX_DATA_URL_BYTES = 8 * 1024 * 1024;

/**
 * Upload a data-URL photo to the private bucket at {tenant}/{itemId}.{ext}.
 * Returns the stored path. Throws on oversize / upload failure (callers decide
 * whether that's fatal).
 */
export async function uploadItemPhoto(itemId: string, dataUrl: string): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  if (blob.size > MAX_DATA_URL_BYTES) throw new Error("Image too large");
  const ext = blob.type.includes("png") ? "png" : "jpg";
  const path = `${TENANT_PREFIX}/${itemId}.${ext}`;
  const supabase = getRetrieveServiceClient();
  const { error } = await supabase.storage
    .from(RETRIEVE_PHOTO_BUCKET)
    .upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: true });
  if (error) throw error;
  return path;
}
