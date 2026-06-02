import { NextResponse } from "next/server";
import { getRetrieveServiceClient } from "@/lib/retrieve/supabase-server";
import { getRetrieveStaffSession } from "@/lib/retrieve/staff-session";
import { uploadItemPhoto } from "@/lib/retrieve/storage";

export const runtime = "nodejs";

const ALLOWED_STATUS = new Set(["active", "recovered", "disposed"]);

/**
 * Staff-gated item mutation. Two shapes:
 *   { status }  → mark recovered / disposed / active
 *   { photo }   → retry a failed photo upload (data URL); uploads + sets photo_path
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getRetrieveStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: { status?: string; photo?: string };
  try {
    body = (await req.json()) as { status?: string; photo?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = getRetrieveServiceClient();

  // Photo retry path.
  if (typeof body.photo === "string" && body.photo) {
    try {
      const path = await uploadItemPhoto(id, body.photo);
      const { error } = await supabase.from("items").update({ photo_path: path }).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true, photoPath: path });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Photo upload failed" },
        { status: 400 },
      );
    }
  }

  // Status change path.
  const status = body.status?.trim();
  if (!status || !ALLOWED_STATUS.has(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  const { error } = await supabase.from("items").update({ status }).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
