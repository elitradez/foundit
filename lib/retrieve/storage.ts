import "server-only";
import { getRetrieveServiceClient } from "@/lib/retrieve/supabase-server";
import { RETRIEVE_PHOTO_BUCKET } from "@/lib/retrieve/supabase";

/**
 * SERVER-ONLY storage helpers for the gym "Retrieve" tenant. Centralizes item
 * photo uploads to the PRIVATE bucket so intake (POST), photo-retry (PATCH), and
 * member claim proof uploads stay in sync.
 *
 * IMPORTANT: we decode the data URL to a Buffer ourselves rather than using
 * `fetch(dataUrl)`. `fetch()` of a `data:` URL behaves inconsistently in
 * serverless runtimes (it was the cause of silent prod photo-upload failures);
 * a manual base64 decode is runtime-independent.
 */

const TENANT_PREFIX = "livefitgym";
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

type DecodedImage = { buffer: Buffer; contentType: string; ext: "png" | "jpg" };

/** Parse a `data:[mime];base64,<payload>` URL into a Buffer + content type. */
export function decodeImageDataUrl(dataUrl: string): DecodedImage {
  const m = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(dataUrl);
  if (!m) throw new Error("Invalid image data URL");
  const mime = (m[1] || "image/jpeg").toLowerCase();
  const isBase64 = Boolean(m[2]);
  const payload = m[3];
  if (!payload) throw new Error("Empty image data URL");
  const buffer = isBase64 ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "utf8");
  if (buffer.byteLength === 0) throw new Error("Decoded image is empty");
  if (buffer.byteLength > MAX_UPLOAD_BYTES) throw new Error("Image too large");
  const ext: "png" | "jpg" = mime.includes("png") ? "png" : "jpg";
  return { buffer, contentType: mime.startsWith("image/") ? mime : "image/jpeg", ext };
}

/**
 * Upload a data-URL photo to the private bucket at {tenant}/{itemId}.{ext}.
 * Returns the stored path. Throws on decode / oversize / upload failure.
 */
export async function uploadItemPhoto(itemId: string, dataUrl: string): Promise<string> {
  const { buffer, contentType, ext } = decodeImageDataUrl(dataUrl);
  const path = `${TENANT_PREFIX}/${itemId}.${ext}`;
  const supabase = getRetrieveServiceClient();
  const { error } = await supabase.storage
    .from(RETRIEVE_PHOTO_BUCKET)
    .upload(path, buffer, { contentType, upsert: true });
  if (error) throw error;
  return path;
}
