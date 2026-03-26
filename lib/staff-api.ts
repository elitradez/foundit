import { cookies } from "next/headers";
import { verifyStaffSessionToken } from "@/lib/staff-token";

export async function isStaffAuthenticated(): Promise<boolean> {
  const jar = await cookies();
  return verifyStaffSessionToken(jar.get("staff_session")?.value);
}
