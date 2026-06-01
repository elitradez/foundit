import { NextResponse } from "next/server";
import { getRetrieveServiceClient } from "@/lib/retrieve/supabase-server";
import { getRetrieveStaffSession } from "@/lib/retrieve/staff-session";
import { RETRIEVE_PHOTO_BUCKET } from "@/lib/retrieve/supabase";

export const runtime = "nodejs";

const TENANT_PREFIX = "livefitgym"; // single-tenant pilot; becomes tenant_id later
const MAX_DATA_URL_BYTES = 8 * 1024 * 1024;

type IntakeBody = {
  name?: string;
  category?: string;
  location?: string;
  dateFound?: string;
  notes?: string;
  photo?: string | null; // data URL
  status?: string;
};

/** Upload a data-URL photo to the PRIVATE bucket at {tenant}/{itemId}.{ext}. */
async function uploadItemPhoto(itemId: string, dataUrl: string): Promise<string> {
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
