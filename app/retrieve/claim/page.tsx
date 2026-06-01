import { Suspense } from "react";
import { RetrieveHeader } from "@/components/retrieve/RetrieveHeader";
import { ClaimRoute } from "@/components/retrieve/ClaimRoute";

export default function ClaimPage() {
  return (
    <>
      <RetrieveHeader links={[{ href: "/retrieve/search", label: "Search" }]} />
      <main id="main-content">
        <Suspense fallback={null}>
          <ClaimRoute />
        </Suspense>
      </main>
    </>
  );
}
