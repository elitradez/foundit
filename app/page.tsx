import { HomeExplorer } from "@/components/student/HomeExplorer";
import { fetchActiveItemsForPublic } from "@/lib/public-items";
import type { PublicItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  let items: PublicItem[] = [];
  let loadError: string | null = null;
  try {
    items = await fetchActiveItemsForPublic();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    loadError = `Could not load items (${msg}). Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, and apply supabase/schema.sql.`;
  }
  return <HomeExplorer initialItems={items} loadError={loadError} />;
}
