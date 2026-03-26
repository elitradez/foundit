import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import type { PublicItem } from "@/lib/types";

export async function fetchActiveItemsForPublic(): Promise<PublicItem[]> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("items")
    .select("id, name, location, date_found, photo_path, pin_hash")
    .is("returned_at", null)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const { pin_hash: _p, ...rest } = row;
    return {
      ...rest,
      requires_pin: _p != null,
    };
  });
}
