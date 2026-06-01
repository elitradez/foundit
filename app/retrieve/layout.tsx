import type { Metadata } from "next";
import "./retrieve.css";
import { RETRIEVE_CONFIG } from "@/lib/retrieve/config";

/**
 * Gym tenant ("Retrieve") layout segment.
 *
 * Self-contained: imports NO campus config, NO Supabase, NO env. It nests under
 * the app's root layout (which provides <html>/<body>) but overrides fonts,
 * colors, and tokens for everything under /retrieve via the .retrieve-root
 * wrapper, so the university UI is completely unaffected.
 *
 * Fonts are loaded via <link> (not next/font) so the build never needs network.
 */

export const metadata: Metadata = {
  title: `${RETRIEVE_CONFIG.wordmark} — gym lost & found`,
  description: "Snap, search, and claim lost items at your gym.",
};

export default function RetrieveLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Space Grotesk (display) + DM Sans (body) */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=Space+Grotesk:wght@500;600;700&display=swap"
        rel="stylesheet"
      />
      <div className="retrieve-root">{children}</div>
    </>
  );
}
