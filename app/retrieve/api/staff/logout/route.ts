import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { RETRIEVE_STAFF_COOKIE } from "@/lib/retrieve/staff-session";

export const runtime = "nodejs";

export async function POST() {
  const jar = await cookies();
  jar.set(RETRIEVE_STAFF_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/retrieve",
    maxAge: 0,
  });
  return NextResponse.json({ ok: true });
}
