import { T } from "@/lib/retrieve/tokens";

/** Inline spinner in the gym brand color. */
export function RetrieveSpinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "72px 24px", color: T.mutedForeground }}>
      <span
        aria-hidden
        style={{ width: 22, height: 22, borderRadius: 999, border: `3px solid ${T.border}`, borderTopColor: T.primaryStrong, animation: "retrieve-spin 0.7s linear infinite" }}
      />
      <span style={{ fontFamily: T.fontBody, fontSize: 15, fontWeight: 500 }}>{label}</span>
      <style>{"@keyframes retrieve-spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
}

/**
 * Friendly note for error / not-configured states. `kind="config"` explains the
 * gym Supabase env vars aren't set (so the app degrades gracefully instead of
 * crashing when someone runs without them).
 */
export function RetrieveStateNote({ kind, detail }: { kind: "config" | "error"; detail?: string }) {
  const isConfig = kind === "config";
  return (
    <div role="alert" style={{ maxWidth: 520, margin: "48px auto", padding: "20px 22px", borderRadius: 16, border: `1px solid ${T.border}`, backgroundColor: T.muted }}>
      <p style={{ margin: "0 0 6px", fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 17, color: T.foreground }}>
        {isConfig ? "Gym database not configured" : "Couldn’t load from the gym database"}
      </p>
      <p style={{ margin: 0, fontSize: 14, color: T.mutedForeground, lineHeight: 1.5 }}>
        {isConfig
          ? "Set NEXT_PUBLIC_RETRIEVE_SUPABASE_URL and NEXT_PUBLIC_RETRIEVE_SUPABASE_PUBLISHABLE_KEY in .env.local, then restart the dev server."
          : detail || "Please try again in a moment."}
      </p>
    </div>
  );
}
