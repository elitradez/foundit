"use client";

import { getRetrieveSupabase, RETRIEVE_PHOTO_BUCKET } from "@/lib/retrieve/supabase";
import type { CategoryKey } from "@/lib/retrieve/config";
import type {
  ItemStatus,
  NewClaimInput,
  NewItemInput,
  RetrieveItem,
} from "@/lib/retrieve/types";

/** Shape of a row in public.items (retrieve-gym-dev). */
type ItemRow = {
  id: string;
  name: string;
  category: string;
  location: string;
  date_found: string;
  notes: string;
  photo_path: string | null;
  status: ItemStatus;
  created_at: string;
};

function client() {
  const c = getRetrieveSupabase();
  if (!c) throw new Error("Retrieve Supabase is not configured (missing NEXT_PUBLIC_RETRIEVE_SUPABASE_* env vars).");
  return c;
}

function publicUrl(path: string | null): string | null {
  if (!path) return null;
  return getRetrieveSupabase()!.storage.from(RETRIEVE_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

function rowToItem(row: ItemRow): RetrieveItem {
  return {
    id: row.id,
    tenantType: "gym",
    name: row.name,
    category: row.category as CategoryKey,
    location: row.location,
    dateFound: row.date_found,
    notes: row.notes ?? "",
    photo: publicUrl(row.photo_path),
    status: row.status,
    createdAt: Date.parse(row.created_at),
  };
}

/** Upload a data-URL photo to the gym bucket, returning its storage path. */
async function uploadDataUrl(dataUrl: string, prefix: string): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const ext = blob.type.includes("png") ? "png" : "jpg";
  const path = `${prefix}/${crypto.randomUUID()}.${ext}`;
  const { error } = await client().storage.from(RETRIEVE_PHOTO_BUCKET).upload(path, blob, {
    contentType: blob.type || "image/jpeg",
    upsert: false,
  });
  if (error) throw error;
  return path;
}

// ── Queries / mutations ────────────────────────────────────────────────────

export async function fetchItems(): Promise<RetrieveItem[]> {
  const { data, error } = await client()
    .from("items")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as ItemRow[]).map(rowToItem);
}

export async function insertItem(input: NewItemInput): Promise<RetrieveItem> {
  let photo_path: string | null = null;
  if (input.photo) photo_path = await uploadDataUrl(input.photo, "items");

  const { data, error } = await client()
    .from("items")
    .insert({
      name: input.name,
      category: input.category,
      location: input.location,
      date_found: input.dateFound,
      notes: input.notes,
      photo_path,
      status: input.status ?? "active",
    })
    .select("*")
    .single();
  if (error) throw error;
  return rowToItem(data as ItemRow);
}

export async function updateItemStatus(id: string, status: ItemStatus): Promise<void> {
  const { error } = await client().from("items").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function insertClaim(input: NewClaimInput): Promise<void> {
  const photo_paths: string[] = [];
  for (const p of input.photos) {
    photo_paths.push(await uploadDataUrl(p, "claims"));
  }
  const { error } = await client().from("claims").insert({
    item_id: input.itemId,
    description: input.description,
    photo_paths,
    contact_name: input.contactName,
    contact_value: input.contactValue,
    fulfillment: input.fulfillment,
  });
  if (error) throw error;
}
