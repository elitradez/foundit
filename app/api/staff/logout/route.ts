import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST() {
  const jar = await cookies();
  jar.delete("staff_session");
  return NextResponse.json({ ok: true });
}
