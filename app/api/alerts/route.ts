import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { getUniversityId } from "@/lib/university-config";
import { alertLimiter, getClientIp, isRateLimited } from "@/lib/ratelimit";

// Register an SMS alert from the describe-first flow's "no strong matches yet"
// state. The alert's description is the COMMITTED find-request text — the
// client only supplies the find request id and a phone number, so an alert can
// never be registered for text different from what was actually searched.
// Alerts land in the same table the Twilio inbound webhook writes to, and the
// existing processNewItemAlerts matcher picks them up with no changes.

type AlertBody = { findRequestId?: string; phone?: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Normalize to E.164. Accepts US 10-digit, 1-prefixed 11-digit, or +E.164. */
function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  if (trimmed.startsWith("+")) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export async function POST(req: Request) {
  if (await isRateLimited(alertLimiter, getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as AlertBody;
    const findRequestId = body.findRequestId?.trim() ?? "";
    const phoneRaw = body.phone?.trim() ?? "";

    if (!UUID_RE.test(findRequestId)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const phone = normalizePhone(phoneRaw);
    if (!phone) {
      return NextResponse.json({ error: "Please enter a valid phone number." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const universityId = getUniversityId();

    const { data: findReq, error: frErr } = await supabase
      .from("find_requests")
      .select("id, description, university_id")
      .eq("id", findRequestId)
      .eq("university_id", universityId)
      .maybeSingle();

    if (frErr || !findReq) {
      return NextResponse.json({ error: "Search not found" }, { status: 404 });
    }

    // Idempotent: same phone + same description already waiting -> done.
    const { data: existing } = await supabase
      .from("alerts")
      .select("id")
      .eq("phone", phone)
      .eq("description", findReq.description)
      .eq("notified", false)
      .limit(1);
    if (existing && existing.length > 0) {
      return NextResponse.json({ ok: true });
    }

    const { error: insErr } = await supabase.from("alerts").insert({
      phone,
      description: findReq.description,
      university_id: universityId,
      notified: false,
    });
    if (insErr) {
      console.error("[alerts] insert failed:", insErr.message);
      return NextResponse.json({ error: "Could not save your alert. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[alerts]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not save your alert." }, { status: 500 });
  }
}
