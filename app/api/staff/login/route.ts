import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createStaffSessionToken } from "@/lib/staff-token";
import { verifyPin } from "@/lib/pin";

type DepartmentRow = {
  id: string;
  university_id: string;
  name: string;
  location: string | null;
  staff_password_hash: string | null;
  staff_password_salt: string | null;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { password?: string };
    const password = body.password?.trim();
    if (!password) {
      return NextResponse.json({ error: "Password required" }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const universityId = process.env.NEXT_PUBLIC_UNIVERSITY_ID?.trim();

    let deptQuery = supabase
      .from("departments")
      .select("id, university_id, name, location, staff_password_hash, staff_password_salt");
    if (universityId) deptQuery = deptQuery.eq("university_id", universityId);
    const { data: departments, error } = await deptQuery;

    if (error) {
      console.error("[login] department lookup:", error.message);
      return NextResponse.json({ error: "Login failed" }, { status: 500 });
    }

    const rows = (departments ?? []) as DepartmentRow[];
    let data: DepartmentRow | null = null;

    for (const dept of rows) {
      if (dept.staff_password_hash && dept.staff_password_salt) {
        if (verifyPin(password, dept.staff_password_hash, dept.staff_password_salt)) {
          data = dept;
          break;
        }
      }
    }

    if (!data) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    const dept = data;
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
