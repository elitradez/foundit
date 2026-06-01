import { cookies } from "next/headers";
import { verifyRetrieveStaffToken, type RetrieveStaffClaims } from "@/lib/retrieve/staff-token";

/**
 * Gym staff session, read from the gym-scoped httpOnly cookie. Distinct cookie
 * name from campus (`staff_session`) so the two surfaces never collide.
 */

export const RETRIEVE_STAFF_COOKIE = "retrieve_staff_session";

export async function getRetrieveStaffSession(): Promise<RetrieveStaffClaims | null> {
  const jar = await cookies();
  return verifyRetrieveStaffToken(jar.get(RETRIEVE_STAFF_COOKIE)?.value);
}
