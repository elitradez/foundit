import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createStaffSessionToken } from "@/lib/staff-token";

type DepartmentRow = {
  id: string;
  university_id: string;
  name: string;
  location: string | null;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { password?: string };
    const password = body.password?.trim();
    if (!password) {
      return NextResponse.json({ error: "Password required" }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("departments")
      .select("id, university_id, name, location")
      .eq("staff_password", password)
      .maybeSingle();

    if (error) {
      console.error("[login] department lookup:", error.message);
      return NextResponse.json({ error: "Login failed" }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    const dept = data as DepartmentRow;
    const token = await createStaffSessionToken({
      department_id: dept.id,
      university_id: dept.university_id,
      department_name: dept.name,
      pickup_location: dept.location,
    });

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
