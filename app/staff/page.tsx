import { redirect } from "next/navigation";
import { StaffDashboard } from "@/components/staff/StaffDashboard";
import { getStaffSession } from "@/lib/staff-api";
import { getUniversityConfig } from "@/lib/university-config";

export default async function StaffHomePage() {
  const session = await getStaffSession();
  if (!session) redirect("/staff/login");

  const { name: universityName } = getUniversityConfig();

  return (
    <StaffDashboard
      departmentName={session.department_name}
      universityName={universityName}
    />
  );
}
