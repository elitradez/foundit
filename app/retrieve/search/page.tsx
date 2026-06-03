import { RetrieveHeader } from "@/components/retrieve/RetrieveHeader";
import { MemberSearch } from "@/components/retrieve/MemberSearch";
import { MemberWelcome } from "@/components/retrieve/MemberWelcome";

export default function MemberSearchPage() {
  return (
    <>
      <RetrieveHeader cta={{ href: "/retrieve/staff", label: "Staff" }} />
      <MemberSearch />
      <MemberWelcome />
    </>
  );
}
