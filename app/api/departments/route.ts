import { NextResponse } from "next/server";
import { fetchDepartmentsForPublic } from "@/lib/public-items";

export const dynamic = "force-dynamic";

export async function GET() {
  const departments = await fetchDepartmentsForPublic();
  return NextResponse.json({ departments });
}
