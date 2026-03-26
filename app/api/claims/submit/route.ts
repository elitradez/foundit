import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      itemId?: string;
      studentDescription?: string;
      studentEmail?: string;
    };
    const itemId = body.itemId?.trim();
    const studentDescription = body.studentDescription?.trim();
    const studentEmail = body.studentEmail?.trim();

    if (!itemId || !studentDescription) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (studentDescription.length > 4000) {
      return NextResponse.json({ error: "Description too long" }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const { data: item, error: fetchErr } = await supabase
      .from("items")
      .select("id, name, description, status, returned_at")
      .eq("id", itemId)
      .maybeSingle();

    if (fetchErr || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    if (item.returned_at) {
      return NextResponse.json({ error: "Item no longer available" }, { status: 410 });
    }
    if (item.status === "surplus") {
      return NextResponse.json({ error: "Item already moved to surplus" }, { status: 410 });
    }

    const { error: claimErr } = await supabase.from("claims").insert({
      item_id: itemId,
      student_name: "Pending staff entry",
      student_email: studentEmail || "pending@staff-entry.edu",
      student_id_number: "pending",
      claim_description: studentDescription,
      status: "pending",
    });

    if (claimErr) {
      return NextResponse.json({ error: claimErr.message }, { status: 500 });
    }

    const { error: upErr } = await supabase.from("items").update({
        claim_description: studentDescription,
      }).eq("id", itemId);

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Submit failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
