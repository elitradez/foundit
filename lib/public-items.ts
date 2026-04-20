import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import type { PublicItem } from "@/lib/types";
import { normalizeValueTier } from "@/lib/value-tier";
import { getUniversityId } from "@/lib/university-config";

export async function fetchActiveItemsForPublic(
  offset = 0,
): Promise<PublicItem[]> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("items")
    .select("id, name, location, date_found, photo_path, pin_hash, value_tier, department_id, departments(name)")
    .is("returned_at", null)
    .eq("university_id", getUniversityId())
    .order("created_at", { ascending: false })
    .range(offset, offset + 499); // 500 rows per page

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const r = row as unknown as {
      id: string;
      name: string;
      location: string;
      date_found: string;
      photo_path: string;
      pin_hash: string | null;
      value_tier: string | null;
      department_id: string | null;
      departments: { name: string | null } | null;
    };
    const { pin_hash: _p, value_tier: vt, departments: dept, ...rest } = r;
    return {
      ...rest,
      value_tier: normalizeValueTier(vt),
      requires_pin: _p != null,
      department_name: dept?.name ?? null,
    };
  });
}

export async function fetchDepartmentsForPublic(): Promise<{ id: string; name: string }[]> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("departments")
    .select("id, name")
    .eq("university_id", getUniversityId())
    .order("name");
  if (error) return [];
  return (data ?? []) as { id: string; name: string }[];
}
