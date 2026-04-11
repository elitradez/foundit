import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { hashPin } from "@/lib/pin";

// One-time migration: hashes all plain-text staff_password values and nulls them out.
// Protected by ADMIN_SECRET env var. Run once after deploying the schema change.
export async function POST(req: Request) {
  const secret = req.headers.get("x-admin-secret");
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminSupabaseClient();

  const { data: departments, error } = await supabase
    .from("departments")
    .select("id, staff_password")
    .not("staff_password", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (departments ?? []) as { id: string; staff_password: string }[];
  if (rows.length === 0) {
    return NextResponse.json({ message: "Nothing to migrate — all passwords already hashed." });
  }

  let migrated = 0;
  const failures: string[] = [];

  for (const dept of rows) {
    if (!dept.staff_password) continue;
    const { pin_hash, pin_salt } = hashPin(dept.staff_password);
    const { error: updateErr } = await supabase
      .from("departments")
      .update({
        staff_password_hash: pin_hash,
        staff_password_salt: pin_salt,
        staff_password: null,
      })
      .eq("id", dept.id);

    if (updateErr) {
      failures.push(dept.id);
    } else {
      migrated++;
    }
  }

  return NextResponse.json({ migrated, failures });
}
