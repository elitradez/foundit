import { RetrieveHeader } from "@/components/retrieve/RetrieveHeader";
import { SnapIntake } from "@/components/retrieve/SnapIntake";

export default function StaffSnapPage() {
  return (
    <>
      <RetrieveHeader links={[{ href: "/retrieve/staff", label: "Dashboard" }]} cta={{ href: "/retrieve/search", label: "Member view" }} />
      <main id="main-content">
        <SnapIntake />
      </main>
    </>
  );
}
