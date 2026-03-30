import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import type { PublicItem } from "@/lib/types";
import { normalizeValueTier } from "@/lib/value-tier";

export async function fetchActiveItemsForPublic(): Promise<PublicItem[]> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("items")
    .select("id, name, location, date_found, photo_path, pin_hash, value_tier")
    .is("returned_at", null)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const r = row as {
      id: string;
      name: string;
      location: string;
      date_found: string;
      photo_path: string;
      pin_hash: string | null;
      value_tier: string | null;
    };
    const { pin_hash: _p, value_tier: vt, ...rest } = r;
    return {
      ...rest,
      value_tier: normalizeValueTier(vt),
      requires_pin: _p != null,
    };
  });
}
