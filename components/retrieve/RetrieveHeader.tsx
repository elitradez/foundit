import Link from "next/link";
import { BrandMark } from "@/components/retrieve/BrandMark";
import { T } from "@/lib/retrieve/tokens";

type NavLink = { href: string; label: string };

export function RetrieveHeader({
  links = [],
  cta,
}: {
  links?: NavLink[];
  cta?: { href: string; label: string };
}) {
  return (
    <header style={{ backgroundColor: T.background, borderBottom: `1px solid ${T.border}`, position: "sticky", top: 0, zIndex: 20 }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <BrandMark href="/retrieve" size={32} />
        <nav style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              style={{ fontFamily: T.fontBody, fontSize: 15, fontWeight: 500, color: T.mutedForeground, textDecoration: "none", padding: "8px 12px", borderRadius: 10 }}
            >
              {l.label}
            </Link>
          ))}
          {cta ? (
            <Link
              href={cta.href}
              style={{ fontFamily: T.fontDisplay, fontSize: 15, fontWeight: 600, color: T.primaryForeground, backgroundColor: T.primaryStrong, textDecoration: "none", padding: "9px 16px", borderRadius: 12 }}
            >
              {cta.label}
            </Link>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
