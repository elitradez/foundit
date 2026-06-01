import { T } from "@/lib/retrieve/tokens";
import { RETRIEVE_CONFIG } from "@/lib/retrieve/config";

/**
 * Retrieve brand lockup: the labrador logo + the orange "retrieve" wordmark.
 * Logo lives at /public/retrieve/labrador-logo.png (copied from the source PNG).
 * Sized ~32px tall per the brief.
 */
export function BrandMark({
  size = 32,
  wordmark = true,
  href,
}: {
  size?: number;
  wordmark?: boolean;
  href?: string;
}) {
  const inner = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      {/* Logo. width auto-derived from the 1264x843 source aspect ratio. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/retrieve/labrador-logo.png"
        alt={wordmark ? "" : RETRIEVE_CONFIG.wordmark}
        aria-hidden={wordmark ? true : undefined}
        height={size}
        style={{ height: size, width: "auto", display: "block" }}
      />
      {wordmark ? (
        <span
          style={{
            fontFamily: T.fontDisplay,
            fontWeight: 700,
            fontSize: Math.round(size * 0.72),
            color: T.primary,
            letterSpacing: "-0.02em",
            lineHeight: 1,
          }}
        >
          {RETRIEVE_CONFIG.wordmark}
        </span>
      ) : null}
    </span>
  );

  if (href) {
    return (
      <a href={href} aria-label={RETRIEVE_CONFIG.wordmark} style={{ textDecoration: "none" }}>
        {inner}
      </a>
    );
  }
  return inner;
}
