import Link from "next/link";
import type { Metadata } from "next";
import { getUniversityConfig } from "@/lib/university-config";

export const metadata: Metadata = {
  title: "Privacy Policy — Lost & Found",
};

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

export default function PrivacyPage() {
  const { name: universityName } = getUniversityConfig();
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#FFFFFF", fontFamily: FONT, color: "#333333" }}>

      {/* Nav */}
      <header style={{ backgroundColor: "#FFFFFF", borderBottom: "1px solid #E5E5E5" }}>
        <div style={{ maxWidth: 1152, margin: "0 auto", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <p style={{ color: "var(--color-brand)", fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", lineHeight: 1.3, margin: 0 }}>
              {universityName}
            </p>
            <p style={{ color: "#1a1a1a", fontSize: 18, fontWeight: 600, lineHeight: 1.2, margin: 0 }}>
              Lost &amp; Found
            </p>
          </Link>
          <Link
            href="/staff/login"
            style={{ color: "var(--color-brand)", fontSize: 14, fontWeight: 500, textDecoration: "none" }}
          >
            Staff sign in
          </Link>
        </div>
      </header>

      {/* Content */}
      <main id="main-content" style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px 80px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "#1a1a1a", margin: "0 0 6px" }}>Privacy Policy</h1>
        <p style={{ fontSize: 14, color: "#767676", margin: "0 0 40px" }}>Last updated April 2026</p>

        <Section title="What data we collect">
          <p>When an item is logged by staff, we collect: a photo of the item, a brief description, the location where it was found, and the date found.</p>
          <p>When a student submits a claim, we collect their name and at least one contact method (email address or phone number). We may also collect a description of the item to assist with ownership verification.</p>
          <p>We do not collect login credentials, payment information, or any data beyond what is needed to reunite lost items with their owners.</p>
        </Section>

        <Section title="How ownership verification works">
          <p>All item photos are blurred by default on the student-facing site. To view an item&apos;s photo, students must first describe the item from memory — color, brand, identifying marks, or contents. This description is compared against the staff-logged item description. If the descriptions match closely, the photo is revealed so the student can confirm it is theirs before submitting a claim. Final verification happens in person: staff ask the student to describe the item before releasing it. No item is released without in-person identity confirmation.</p>
        </Section>

        <Section title="How we use your data">
          <p>Information is used solely to match lost items with their rightful owners and to allow department staff to contact claimants if needed.</p>
          <p>Your claim description is used to help staff verify ownership at pickup. Your contact information (if provided) may be used to notify you about the status of your claim.</p>
        </Section>

        <Section title="Who can access your data">
          <p>Only authorized department staff at {universityName} can view claims and item records. Staff access is limited to items and claims belonging to their own department — they cannot view records from other departments.</p>
          <p>No third parties have access to your personal information. We do not sell, share, or license your data to any outside organization.</p>
        </Section>

        <Section title="Data retention">
          <p>Item records remain active until the item is returned to its owner or transferred to surplus.</p>
          <p>Claim records containing personal information are automatically deleted 90 days after submission. Alerts are deleted 90 days after creation. We maintain an internal log of when deletions occur for audit purposes.</p>
          <p>Students may request earlier deletion by emailing <a href="mailto:eli@laikacampus.com" style={{ color: "var(--color-brand)" }}>eli@laikacampus.com</a>.</p>
        </Section>

        <Section title="FERPA compliance">
          <p>This service is operated in compliance with the Family Educational Rights and Privacy Act (FERPA). Student records are not shared with unauthorized parties. Staff access is limited to what is necessary to operate the lost and found service.</p>
        </Section>

        <Section title="No advertising, no data sales">
          <p>We do not use your data for advertising purposes. We do not sell, trade, or transfer your personal information to outside parties under any circumstances.</p>
        </Section>

        <Section title="Your rights">
          <p>You have the right to request access to, correction of, or deletion of any personal information you have submitted. To exercise these rights, contact us at:</p>
          <p><a href="mailto:eli@laikacampus.com" style={{ color: "var(--color-brand)", fontWeight: 500 }}>eli@laikacampus.com</a></p>
        </Section>

        <Section title="Contact">
          <p>Questions about this policy? Email <a href="mailto:eli@laikacampus.com" style={{ color: "var(--color-brand)" }}>eli@laikacampus.com</a>.</p>
        </Section>
      </main>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid #E5E5E5", backgroundColor: "#FFFFFF", padding: "24px 16px", textAlign: "center" }}>
        <p style={{ fontSize: 13, color: "#767676", margin: 0 }}>
          {universityName} Lost &amp; Found &nbsp;·&nbsp;{" "}
          <Link href="/privacy" style={{ color: "var(--color-brand)", textDecoration: "none" }}>
            Privacy
          </Link>
        </p>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, color: "#1a1a1a", margin: "0 0 10px", paddingBottom: 8, borderBottom: "1px solid #E5E5E5" }}>
        {title}
      </h2>
      <div style={{ fontSize: 14, color: "#444444", lineHeight: 1.7, display: "flex", flexDirection: "column", gap: 10 }}>
        {children}
      </div>
    </section>
  );
}
