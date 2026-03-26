import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createStaffSessionToken } from "@/lib/staff-token";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { password?: string };
    const expected = process.env.STAFF_PASSWORD;
    if (!expected) {
      return NextResponse.json(
        {
          error:
            "STAFF_PASSWORD is not set. Add it to .env.local, save the file, and restart the dev server.",
        },
        { status: 500 },
      );
    }
    if (!body.password || body.password !== expected) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }
    const token = await createStaffSessionToken();
    const jar = await cookies();
    jar.set("staff_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
