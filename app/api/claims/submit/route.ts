import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { claimLimiter, getClientIp, isRateLimited } from "@/lib/ratelimit";

export async function POST(req: Request) {
  if (await isRateLimited(claimLimiter, getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests. Please try again in a minute." },
      { status: 429 }
    );
  }

  try {
    const body = (await req.json()) as {
      itemId?: string;
      studentDescription?: string;
      studentName?: string;
      studentEmail?: string;
      phoneNumber?: string;
      findRequestId?: string;
    };

    const itemId = body.itemId?.trim();
    if (!itemId) {
      return NextResponse.json({ error: "Missing item ID" }, { status: 400 });
    }
    const findRequestId = body.findRequestId?.trim() || null;

    const studentDescription = body.studentDescription?.trim() ?? null;
    const studentName = body.studentName?.trim() || null;
    const studentEmail = body.studentEmail?.trim() || null;
    const phoneNumber = body.phoneNumber?.trim() || null;

    if (!studentName) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!studentEmail && !phoneNumber) {
      return NextResponse.json({ error: "Email or phone number is required" }, { status: 400 });
    }
    if (studentEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(studentEmail)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }
    if (studentDescription && studentDescription.length > 4000) {
      return NextResponse.json({ error: "Description too long" }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const { data: item, error: fetchErr } = await supabase
      .from("items")
      .select("id, returned_at, university_id")
      .eq("id", itemId)
      .maybeSingle();

    if (fetchErr || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    if (item.returned_at) {
      return NextResponse.json({ error: "Item no longer available" }, { status: 410 });
    }

    // Claims from the describe-first flow link the description the student
    // committed BEFORE seeing any photos (anti-fraud audit trail for staff).
    // An id that doesn't resolve is rejected rather than silently dropped.
    if (findRequestId) {
      const { data: findReq } = await supabase
        .from("find_requests")
        .select("id")
        .eq("id", findRequestId)
        .eq("university_id", item.university_id)
        .maybeSingle();
      if (!findReq) {
        return NextResponse.json({ error: "Invalid find request" }, { status: 400 });
      }
    }

    const { error: claimErr } = await supabase.from("claims").insert({
      item_id: itemId,
      student_name: studentName,
      student_email: studentEmail,
      student_id_number: null,
      claim_description: studentDescription,
      phone_number: phoneNumber,
      university_id: item.university_id,
      status: "pending",
      find_request_id: findRequestId,
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
