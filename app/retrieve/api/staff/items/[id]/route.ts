import { NextResponse } from "next/server";
import { getRetrieveServiceClient } from "@/lib/retrieve/supabase-server";
import { getRetrieveStaffSession } from "@/lib/retrieve/staff-session";

export const runtime = "nodejs";

const ALLOWED_STATUS = new Set(["active", "recovered", "disposed"]);

/** Staff-gated status change (mark recovered / disposed). */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getRetrieveStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let status: string | undefined;
  try {
    const body = (await req.json()) as { status?: string };
    status = body.status?.trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!status || !ALLOWED_STATUS.has(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const supabase = getRetrieveServiceClient();
  const { error } = await supabase.from("items").update({ status }).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
