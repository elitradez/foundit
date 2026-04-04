import { cookies } from "next/headers";
import type { DepartmentClaims } from "@/lib/staff-token";
import { verifyStaffSessionToken } from "@/lib/staff-token";

export async function getStaffSession(): Promise<DepartmentClaims | null> {
  const jar = await cookies();
  return verifyStaffSessionToken(jar.get("staff_session")?.value);
}
