import { RetrieveHeader } from "@/components/retrieve/RetrieveHeader";
import { StaffDashboard } from "@/components/retrieve/StaffDashboard";

export default function StaffDashboardPage() {
  return (
    <>
      <RetrieveHeader links={[{ href: "/retrieve/search", label: "Member view" }]} cta={{ href: "/retrieve/staff/snap", label: "Snap" }} />
      <main id="main-content">
        <StaffDashboard />
      </main>
    </>
  );
}
