import { HomeExplorer } from "@/components/student/HomeExplorer";
import { fetchActiveItemsForPublic } from "@/lib/public-items";
import type { PublicItem } from "@/lib/types";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

function siteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

export async function generateMetadata(): Promise<Metadata> {
  const base = siteUrl();
  const logo = new URL("/foundit-logo.png", base).toString();
  return {
    openGraph: {
      images: [{ url: logo, width: 1024, height: 1024, type: "image/png" }],
    },
    twitter: {
      images: [logo],
    },
  };
}

export default async function Home() {
  let items: PublicItem[] = [];
  let loadError: string | null = null;
  try {
    items = await fetchActiveItemsForPublic({ limit: 24 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    loadError = `Could not load items (${msg}). Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, and apply supabase/schema.sql.`;
  }
  return <HomeExplorer initialItems={items} loadError={loadError} />;
}
