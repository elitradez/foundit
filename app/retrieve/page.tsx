import Link from "next/link";
import { RetrieveHeader } from "@/components/retrieve/RetrieveHeader";
import { BrandMark } from "@/components/retrieve/BrandMark";
import { T } from "@/lib/retrieve/tokens";
import { RETRIEVE_CONFIG } from "@/lib/retrieve/config";

export default function RetrieveLandingPage() {
  return (
    <>
      <RetrieveHeader links={[{ href: "/retrieve/search", label: "Search" }]} cta={{ href: "/retrieve/staff", label: "Staff" }} />

      <main id="main-content" style={{ maxWidth: 1120, margin: "0 auto", padding: "0 20px 64px" }}>
        {/* Hero */}
        <section className="retrieve-fade-up" style={{ padding: "56px 0 40px", textAlign: "center" }}>
          <div style={{ display: "inline-flex", marginBottom: 24 }}>
            <BrandMark size={56} />
          </div>
          <h1 style={{ fontFamily: T.fontDisplay, fontSize: "clamp(34px, 6vw, 56px)", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.05, margin: "0 auto 16px", maxWidth: 760, color: T.foreground }}>
            Left something at <span style={{ color: T.primary }}>{RETRIEVE_CONFIG.venueName}</span>? Get it back.
          </h1>
          <p style={{ fontFamily: T.fontBody, fontSize: 18, color: T.mutedForeground, maxWidth: 560, margin: "0 auto", lineHeight: 1.5 }}>
            Staff snap found items the moment they turn up. Members search and claim in seconds.
          </p>
        </section>

        {/* Role chooser */}
        <section aria-label="Choose what you want to do" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, maxWidth: 860, margin: "0 auto" }}>
          <RoleCard
            href="/retrieve/search"
            badge="Members"
            title="I lost something"
            body="Search everything that's been turned in and start a claim."
            cta="Search lost items"
            tone="light"
          />
          <RoleCard
            href="/retrieve/staff/snap"
            badge="Staff"
            title="I found something"
            body="Point, snap, and log it in under a minute."
            cta="Open Snap"
            tone="dark"
          />
        </section>

        <p style={{ textAlign: "center", marginTop: 28, fontSize: 14, color: T.mutedForeground }}>
          Staff member?{" "}
          <Link href="/retrieve/staff" style={{ color: T.primaryStrong, fontWeight: 600 }}>
            Go to the dashboard
          </Link>
        </p>
      </main>
    </>
  );
}

function RoleCard({
  href,
  badge,
  title,
  body,
  cta,
  tone,
}: {
  href: string;
  badge: string;
  title: string;
  body: string;
  cta: string;
  tone: "light" | "dark";
}) {
  const dark = tone === "dark";
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        flexDirection: "column",
        textDecoration: "none",
        backgroundColor: dark ? T.hero : T.background,
        color: dark ? T.heroForeground : T.foreground,
        border: `1px solid ${dark ? "transparent" : T.border}`,
        borderRadius: 24,
        padding: 28,
        minHeight: 240,
        boxShadow: T.cardShadow,
      }}
    >
      <span
        style={{
          alignSelf: "flex-start",
          fontFamily: T.fontDisplay,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: dark ? T.primary : T.primaryStrong,
          backgroundColor: dark ? "rgba(242,89,13,0.16)" : "#FFF1E8",
          padding: "5px 11px",
          borderRadius: 999,
        }}
      >
        {badge}
      </span>
      <h2 style={{ fontFamily: T.fontDisplay, fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", margin: "18px 0 8px" }}>{title}</h2>
      <p style={{ fontFamily: T.fontBody, fontSize: 15, lineHeight: 1.5, color: dark ? "rgba(255,255,255,0.72)" : T.mutedForeground, margin: 0 }}>{body}</p>
      <span
        style={{
          marginTop: "auto",
          paddingTop: 24,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontFamily: T.fontDisplay,
          fontWeight: 600,
          fontSize: 16,
          color: dark ? T.heroForeground : T.primaryStrong,
        }}
      >
        {cta}
        <span aria-hidden style={{ fontSize: 18 }}>→</span>
      </span>
    </Link>
  );
}
