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
  title: `Lost & Found — ${universityConfig.name}`,
  description: `Search for lost items found across campus at the ${universityConfig.name}.`,
  icons: {
    icon: [{ url: absolute("/faro-logo.png"), type: "image/png" }],
    apple: [{ url: absolute("/faro-logo.png"), type: "image/png" }],
  },
  openGraph: {
    title: `Lost & Found — ${universityConfig.name}`,
    description: "Search for lost items found across campus. Higher-value items require ownership verification before pickup.",
    type: "website",
    siteName: `${universityConfig.name} Lost & Found`,
    images: [
      {
        url: absolute("/faro-logo.png"),
        width: 1024,
        height: 1024,
        type: "image/png",
        alt: `${universityConfig.name} Lost & Found`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `Lost & Found — ${universityConfig.name}`,
    description: "Search for lost items found across campus. Higher-value items require ownership verification before pickup.",
    images: [absolute("/faro-logo.png")],
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
      <body style={{ ["--color-brand" as string]: brandColor, ["--color-brand-hover" as string]: brandColorHover }} className="min-h-full flex flex-col bg-white text-[#333333]">
        <style>{`:root{${cssVars}}`}</style>
        <a href="#main-content" className="skip-nav">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
