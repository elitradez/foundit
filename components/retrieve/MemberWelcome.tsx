"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/retrieve/ui";
import { T } from "@/lib/retrieve/tokens";

/**
 * First-visit welcome modal for the gym member view. Explains how to find and
 * claim a lost item in a few short steps, plus a route to the staff side.
 *
 * Shown once per device: a localStorage flag is set on dismiss so it never nags
 * on subsequent loads. Gym-scoped (Retrieve tenant) — not shared with campus.
 */

const SEEN_KEY = "retrieve:livefitgym:welcome:v1";

type Step = { icon: string; title: string; body: string };

const STEPS: Step[] = [
  { icon: "🔎", title: "Search for it", body: "Type the item, brand, or where you lost it." },
  { icon: "✋", title: "Tap “This is mine”", body: "Find your item in the matches and start a claim." },
  { icon: "🪪", title: "Pick it up", body: "Bring a photo ID to the front desk to collect it." },
];

export function MemberWelcome() {
  const router = useRouter();
  // Start hidden; only reveal after the effect confirms it hasn't been seen, so
  // we never flash the modal on return visits or cause an SSR hydration mismatch.
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) setShow(true);
    } catch {
      // localStorage unavailable (private mode / blocked) — just don't show.
    }
  }, []);

  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  function markSeen() {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // ignore
    }
  }

  function dismiss() {
    markSeen();
    setShow(false);
  }

  function goStaff() {
    markSeen();
    router.push("/retrieve/staff");
  }

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="retrieve-welcome-title"
      onClick={dismiss}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "rgba(18,18,18,0.55)",
        overflowY: "auto",
        fontFamily: T.fontBody,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 420,
          backgroundColor: T.background,
          border: `1px solid ${T.border}`,
          borderRadius: T.radius,
          boxShadow: T.cardShadowHover,
          padding: 24,
          margin: "auto",
        }}
      >
        <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: T.primaryStrong, letterSpacing: "0.02em" }}>
          Lost & Found
        </p>
        <h2
          id="retrieve-welcome-title"
          style={{ margin: "0 0 6px", fontFamily: T.fontDisplay, fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", color: T.foreground }}
        >
          Lost something at the gym?
        </h2>
        <p style={{ margin: "0 0 20px", fontSize: 15, lineHeight: 1.5, color: T.mutedForeground }}>
          Here&apos;s how to get it back in three quick steps.
        </p>

        <ol style={{ listStyle: "none", margin: "0 0 22px", padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          {STEPS.map((s, i) => (
            <li key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span
                aria-hidden
                style={{
                  flexShrink: 0,
                  width: 32,
                  height: 32,
                  borderRadius: 999,
                  backgroundColor: "#FFF1E8",
                  color: "#B23F08",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: T.fontDisplay,
                  fontWeight: 700,
                  fontSize: 15,
                }}
              >
                {i + 1}
              </span>
              <div style={{ flex: 1 }}>
                <p style={{ margin: "3px 0 2px", fontSize: 15, fontWeight: 600, color: T.foreground }}>
                  <span aria-hidden style={{ marginRight: 6 }}>{s.icon}</span>
                  {s.title}
                </p>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45, color: T.mutedForeground }}>{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Button onClick={dismiss}>Start searching</Button>
          <Button variant="ghost" onClick={goStaff} ariaLabel="Continue to the staff side">
            Continue to staff side →
          </Button>
        </div>
      </div>
    </div>
  );
}
