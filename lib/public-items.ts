import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import type { PublicItem } from "@/lib/types";

function escapeLike(value: string): string {
  return value.replace(/[%_]/g, "\\$&");
}

export async function fetchActiveItemsForPublic(params?: {
  query?: string;
  limit?: number;
}): Promise<PublicItem[]> {
  const query = params?.query?.trim() ?? "";
  const limit = Math.min(Math.max(params?.limit ?? 24, 1), 100);
  const supabase = createAdminSupabaseClient();
  let builder = supabase
    .from("items")
    .select("id, name, location, date_found, photo_path, pin_hash")
    .is("returned_at", null)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (query.length > 0) {
    const q = `%${escapeLike(query)}%`;
    builder = builder.or(`name.ilike.${q},location.ilike.${q},description.ilike.${q}`);
  }

  const { data, error } = await builder;

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const { pin_hash: _p, ...rest } = row;
    return {
      ...rest,
      requires_pin: _p != null,
    };
  });
}
