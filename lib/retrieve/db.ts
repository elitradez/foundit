"use client";

import { getRetrieveSupabase } from "@/lib/retrieve/supabase";
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
  if (!c) throw new Error("Retrieve Supabase is not configured (missing NEXT_PUBLIC_RETRIEVE_* env vars).");
  return c;
}

/**
 * Photos live in a PRIVATE bucket. We never embed a Supabase URL here; instead
 * we point at the server route, which checks sensitivity + staff auth and 302s
 * to a short-lived signed URL (or 403s sensitive items for non-staff). The
 * `<ItemPhoto>` component decides whether to actually request it.
 */
function photoSrc(row: ItemRow): string | null {
  return row.photo_path ? `/retrieve/api/photo/${row.id}` : null;
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
    photo: photoSrc(row),
    status: row.status,
    createdAt: Date.parse(row.created_at),
  };
}

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Reads (client, publishable key) ──────────────────────────────────────────

export async function fetchItems(): Promise<RetrieveItem[]> {
  const { data, error } = await client()
    .from("items")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as ItemRow[]).map(rowToItem);
}

// ── Writes (server routes — staff-gated mutations / private-bucket uploads) ───

export async function insertItem(input: NewItemInput): Promise<RetrieveItem> {
  const res = await postJson("/retrieve/api/staff/items", {
    name: input.name,
    category: input.category,
    location: input.location,
    dateFound: input.dateFound,
    notes: input.notes,
    photo: input.photo ?? null,
    status: input.status ?? "active",
  });
  const data = (await res.json().catch(() => ({}))) as {
    item?: ItemRow;
    error?: string;
    photoError?: string;
  };
  if (!res.ok && res.status !== 207) {
    throw new Error(data.error ?? "Could not save item");
  }
  if (!data.item) throw new Error(data.error ?? "Could not save item");
  return rowToItem(data.item);
}

export async function updateItemStatus(id: string, status: ItemStatus): Promise<void> {
  const res = await fetch(`/retrieve/api/staff/items/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Could not update item");
  }
}

export async function insertClaim(input: NewClaimInput): Promise<void> {
  const res = await postJson("/retrieve/api/claim", {
    itemId: input.itemId,
    description: input.description,
    photos: input.photos,
    contactName: input.contactName,
    contactValue: input.contactValue,
    fulfillment: input.fulfillment,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Could not submit claim");
  }
}
