import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyPin } from "@/lib/retrieve/pin";
import { createRetrieveStaffToken } from "@/lib/retrieve/staff-token";
import { RETRIEVE_STAFF_COOKIE } from "@/lib/retrieve/staff-session";
import { retrieveLoginLimiter, getClientIp, isRateLimited } from "@/lib/retrieve/ratelimit";

export const runtime = "nodejs";

/**
 * Gym staff login. Single-location pilot: verifies the submitted password
 * against the salted hash in RETRIEVE_STAFF_PIN_HASH / RETRIEVE_STAFF_PIN_SALT.
 * On success, sets the gym-scoped httpOnly session cookie.
 */
export async function POST(req: Request) {
  if (await isRateLimited(retrieveLoginLimiter, getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again in a minute." },
      { status: 429 },
    );
  }

  let password: string | undefined;
  try {
    const body = (await req.json()) as { password?: string };
    password = body.password?.trim();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!password) {
    return NextResponse.json({ error: "Password required" }, { status: 400 });
  }

  const hash = process.env.RETRIEVE_STAFF_PIN_HASH;
  const salt = process.env.RETRIEVE_STAFF_PIN_SALT;
  if (!hash || !salt) {
    console.error("[retrieve login] RETRIEVE_STAFF_PIN_HASH / _SALT not configured");
    return NextResponse.json({ error: "Login unavailable" }, { status: 500 });
  }

  if (!verifyPin(password, hash, salt)) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const token = await createRetrieveStaffToken({
    tenant: "livefitgym",
    staff_id: "pilot-front-desk",
    role: "owner",
  });

  const jar = await cookies();
  jar.set(RETRIEVE_STAFF_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/retrieve",
    maxAge: 60 * 60 * 12, // 12h, matches the token's absolute backstop
  });

  return NextResponse.json({ ok: true });
}
