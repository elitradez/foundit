import { NextResponse } from "next/server";
import { getRetrieveServiceClient } from "@/lib/retrieve/supabase-server";
import { getRetrieveStaffSession } from "@/lib/retrieve/staff-session";
import { embedText, itemEmbeddingText } from "@/lib/retrieve/ai";
import { uploadItemPhoto } from "@/lib/retrieve/storage";

export const runtime = "nodejs";

const TENANT_PREFIX = "livefitgym"; // single-tenant pilot; becomes tenant_id later

type IntakeBody = {
  name?: string;
  category?: string;
  location?: string;
  dateFound?: string;
  notes?: string;
  photo?: string | null; // data URL
  status?: string;
};

/**
 * Embed an item and store it in items.embedding. Best-effort and non-blocking:
 * retries once, and on final failure logs a clear WARNING with the id (the row
 * keeps a null embedding, so `npm run reembed:gym` backfills it later — without
 * it the item is browse-visible but missing from AI search). Never throws.
 */
async function embedAndStore(
  supabase: ReturnType<typeof getRetrieveServiceClient>,
  item: { id: string; name: string; notes: string | null; category: string },
): Promise<boolean> {
  const text = itemEmbeddingText({ name: item.name, notes: item.notes ?? "", category: item.category });
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const vec = await embedText(text);
      if (vec) {
        const { error } = await supabase.from("items").update({ embedding: JSON.stringify(vec) }).eq("id", item.id);
        if (error) throw error;
        return true;
      }
      console.error(`[retrieve/items] embed attempt ${attempt} returned no vector for ${item.id}`);
    } catch (e) {
      console.error(`[retrieve/items] embed attempt ${attempt} failed for ${item.id}:`, e instanceof Error ? e.message : e);
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 800));
  }
  console.warn(
    `[retrieve/items] embedding unavailable for item ${item.id} ("${item.name}") — browse-visible but missing from AI search until reembed. Run: npm run reembed:gym`,
  );
  return false;
}

export async function POST(req: Request) {
  const session = await getRetrieveStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: IntakeBody;
  try {
    body = (await req.json()) as IntakeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim();
  const category = body.category?.trim();
  const location = body.location?.trim();
  const dateFound = body.dateFound?.trim();
  if (!name || !category || !location || !dateFound) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const supabase = getRetrieveServiceClient();

  // Insert first to get the id, then upload to {tenant}/{id}.ext, then patch.
  const { data: inserted, error: insErr } = await supabase
    .from("items")
    .insert({
      tenant_id: TENANT_PREFIX,
      name,
      category,
      location,
      date_found: dateFound,
      notes: body.notes ?? "",
      status: body.status ?? "active",
    })
    .select("*")
    .single();
  if (insErr || !inserted) {
    return NextResponse.json({ error: insErr?.message ?? "Insert failed" }, { status: 500 });
  }

  // Embed-on-write (best-effort, retried, non-blocking). Depends only on
  // name/notes/category, so we do it before the photo step — a photo failure
  // must not skip vector indexing, and an embedding failure must not fail the
  // intake (item is already saved; a null embedding is backfilled by reembed).
  await embedAndStore(supabase, inserted);

  let row = inserted;
  if (body.photo) {
    try {
      const path = await uploadItemPhoto(inserted.id, body.photo);
      const { data: patched, error: patchErr } = await supabase
        .from("items")
        .update({ photo_path: path })
        .eq("id", inserted.id)
        .select("*")
        .single();
      if (patchErr || !patched) throw patchErr ?? new Error("Patch failed");
      row = patched;
    } catch (e) {
      // Item row is saved; surface the photo failure without losing the record.
      const msg = e instanceof Error ? e.message : "Photo upload failed";
      return NextResponse.json({ item: row, photoError: msg }, { status: 207 });
    }
  }

  return NextResponse.json({ item: row });
}
