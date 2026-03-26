import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: "Foundit — Campus lost & found",
  description: "Browse and claim items turned in at the University of Utah.",
  icons: {
    icon: [{ url: absolute("/foundit-logo.png"), type: "image/png" }],
    apple: [{ url: absolute("/foundit-logo.png"), type: "image/png" }],
  },
  openGraph: {
    title: "Foundit — University of Utah",
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
    title: "Foundit — University of Utah",
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
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#0c0c0c] text-[#F5F5F0]">{children}</body>
    </html>
  );
}
