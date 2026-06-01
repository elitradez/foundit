import { redirect } from "next/navigation";
import { getRetrieveStaffSession } from "@/lib/retrieve/staff-session";

/**
 * Server-side guard for the entire gym staff area (/retrieve/staff/**).
 * No valid staff session → redirect to the gym login. This is the real gate;
 * the staff mutation API routes verify the session independently (defense in
 * depth), so hiding the UI is never the only protection.
 */
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const session = await getRetrieveStaffSession();
  if (!session) {
    redirect("/retrieve/login");
  }
  return <>{children}</>;
}
