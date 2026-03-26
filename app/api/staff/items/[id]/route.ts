import { NextResponse } from "next/server";
import { isStaffAuthenticated } from "@/lib/staff-api";

export async function DELETE() {
  if (!(await isStaffAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(
    { error: "Deleting items is disabled. Use Send to Surplus instead." },
    { status: 410 },
  );
}
