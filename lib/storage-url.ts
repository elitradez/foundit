export function publicItemPhotoUrl(photoPath: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base) return "";
  return `${base}/storage/v1/object/public/items/${encodeURI(photoPath)}`;
}
