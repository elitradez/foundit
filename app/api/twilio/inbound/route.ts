import { NextResponse } from "next/server";
import twilio from "twilio";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { getUniversityConfig } from "@/lib/university-config";
import { validateTwilioSignature, shouldSkipTwilioValidation } from "@/lib/twilio-auth";

function getAutoReply(): string {
  const { pickupLocation, siteUrl } = getUniversityConfig();
  return `Got it! We will text you if your item shows up at ${pickupLocation} lost and found. Visit ${siteUrl} to search anytime.`;
}

export const runtime = "nodejs";

export async function POST(req: Request) {
  // Parse body first — the stream can only be read once, and signature
  // validation needs the same params the route handler uses.
  let params: Record<string, string>;
  try {
    const form = await req.formData();
    params = {};
    form.forEach((value, key) => {
      params[key] = String(value);
    });
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 403 });
  }

  // Verify the request came from Twilio unless we're in local dev with
  // the skip flag explicitly set.
  if (!shouldSkipTwilioValidation() && !validateTwilioSignature(req, params)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 403 });
  }

  const body = (params.Body ?? "").trim();
  const from = (params.From ?? "").trim();

  const twiml = new twilio.twiml.MessagingResponse();

  if (!from) {
    return NextResponse.json({ error: "Missing From" }, { status: 400 });
  }

  if (!body) {
    twiml.message("Please text a short description of what you lost (and your name if you like).");
    return new NextResponse(twiml.toString(), {
      status: 200,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  }

  const supabase = createAdminSupabaseClient();
  const { error: insErr } = await supabase.from("alerts").insert({
    phone: from,
    description: body,
    notified: false,
  });

  if (insErr) {
    console.error("[twilio/inbound] insert alert:", insErr.message);
    twiml.message("Sorry, we could not save your alert. Please try again later.");
  } else {
    twiml.message(getAutoReply());
  }

  return new NextResponse(twiml.toString(), {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}
