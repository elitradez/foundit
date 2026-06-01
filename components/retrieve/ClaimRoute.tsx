"use client";

import { useSearchParams } from "next/navigation";
import { ClaimFlow } from "@/components/retrieve/ClaimFlow";

export function ClaimRoute() {
  const params = useSearchParams();
  const itemId = params.get("item");
  return <ClaimFlow itemId={itemId} />;
}
