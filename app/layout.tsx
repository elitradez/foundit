import type { Metadata } from "next";
import "./globals.css";
import { getUniversityConfig } from "@/lib/university-config";

function siteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

function absolute(pathname: string): string {
  return new URL(pathname, siteUrl()).toString();
}

const universityConfig = getUniversityConfig();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: "Foundit — Campus lost & found",
  description: `Browse and claim items turned in at the ${universityConfig.name}.`,
  icons: {
    icon: [{ url: absolute("/foundit-logo.png"), type: "image/png" }],
    apple: [{ url: absolute("/foundit-logo.png"), type: "image/png" }],
  },
  openGraph: {
    title: `Foundit — ${universityConfig.name}`,
    description: "Campus lost and found — browse active items and submit a claim.",
    type: "website",
    siteName: "Foundit",
    images: [
      {
        url: absolute("/foundit-logo.png"),
        width: 1024,
        height: 1024,
        type: "image/png",
        alt: "Foundit — campus lost and found logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `Foundit — ${universityConfig.name}`,
    description: "Campus lost and found — browse active items and submit a claim.",
    images: [absolute("/foundit-logo.png")],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { brandColor, brandColorHover } = getUniversityConfig();
  const cssVars = `--color-brand:${brandColor};--color-brand-hover:${brandColorHover};`;
  return (
    <html lang="en" className="h-full antialiased">
      <body style={{ ["--color-brand" as string]: brandColor, ["--color-brand-hover" as string]: brandColorHover }} className="min-h-full flex flex-col bg-transparent text-[#F5F5F0]">
        <style>{`:root{${cssVars}}`}</style>
        {children}
      </body>
    </html>
  );
}
