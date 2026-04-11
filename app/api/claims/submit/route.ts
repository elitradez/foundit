import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      itemId?: string;
      studentDescription?: string;
      studentName?: string;
      studentEmail?: string;
      phoneNumber?: string;
    };

    const itemId = body.itemId?.trim();
    if (!itemId) {
      return NextResponse.json({ error: "Missing item ID" }, { status: 400 });
    }

    const studentDescription = body.studentDescription?.trim() ?? null;
    const studentName = body.studentName?.trim() || null;
    const studentEmail = body.studentEmail?.trim() || null;
    const phoneNumber = body.phoneNumber?.trim() || null;

    if (studentDescription && studentDescription.length > 4000) {
      return NextResponse.json({ error: "Description too long" }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const { data: item, error: fetchErr } = await supabase
      .from("items")
      .select("id, returned_at")
      .eq("id", itemId)
      .maybeSingle();

    if (fetchErr || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    if (item.returned_at) {
      return NextResponse.json({ error: "Item no longer available" }, { status: 410 });
    }

    const { error: claimErr } = await supabase.from("claims").insert({
      item_id: itemId,
      student_name: studentName,
      student_email: studentEmail,
      student_id_number: null,
      claim_description: studentDescription,
      phone_number: phoneNumber,
      status: "pending",
    });

    if (claimErr) {
      return NextResponse.json({ error: claimErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Submit failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
