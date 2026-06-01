import { T } from "@/lib/retrieve/tokens";

/** Gym-tenant loading state — keeps the campus loader from flashing on /retrieve. */
export default function RetrieveLoading() {
  return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, color: T.mutedForeground }}>
      <span
        aria-hidden
        style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          border: `3px solid ${T.border}`,
          borderTopColor: T.primaryStrong,
          animation: "retrieve-spin 0.7s linear infinite",
        }}
      />
      <span style={{ fontFamily: T.fontBody, fontSize: 15, fontWeight: 500 }}>Loading…</span>
      <style>{"@keyframes retrieve-spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
}
