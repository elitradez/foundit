import { NextResponse } from "next/server";
import { getRetrieveServiceClient } from "@/lib/retrieve/supabase-server";
import { getRetrieveStaffSession } from "@/lib/retrieve/staff-session";
import { RETRIEVE_PHOTO_BUCKET } from "@/lib/retrieve/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TENANT = "livefitgym";
const PROOF_URL_TTL_SECONDS = 600;

type ClaimRow = {
  id: string;
  item_id: string;
  description: string;
  photo_paths: string[] | null;
  contact_name: string;
  contact_value: string;
  fulfillment: "pickup" | "ship";
  status: string;
  created_at: string;
  item: { id: string; name: string; category: string; photo_path: string | null } | null;
};

/** Staff-gated list of member claims (newest first), with signed proof-photo URLs. */
export async function GET() {
  const session = await getRetrieveStaffSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getRetrieveServiceClient();
  const { data, error } = await supabase
    .from("claims")
    .select(
      "id, item_id, description, photo_paths, contact_name, contact_value, fulfillment, status, created_at, item:items(id, name, category, photo_path)",
    )
    .eq("tenant_id", TENANT)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as ClaimRow[];

  // Sign all proof photos in one batch per claim. Staff are authed, so sensitive
  // item photos are fine here; the item thumbnail reuses the existing photo route.
  const claims = await Promise.all(
    rows.map(async (r) => {
      const paths = Array.isArray(r.photo_paths) ? r.photo_paths : [];
      let proofPhotos: string[] = [];
      if (paths.length > 0) {
        const { data: signed } = await supabase.storage
          .from(RETRIEVE_PHOTO_BUCKET)
          .createSignedUrls(paths, PROOF_URL_TTL_SECONDS);
        proofPhotos = (signed ?? [])
          .map((s) => s.signedUrl)
          .filter((u): u is string => Boolean(u));
      }
      return {
        id: r.id,
        itemId: r.item_id,
        itemName: r.item?.name ?? "(item removed)",
        itemCategory: r.item?.category ?? "other",
        itemPhoto: r.item && r.item.photo_path ? `/retrieve/api/photo/${r.item.id}` : null,
        description: r.description,
        contactName: r.contact_name,
        contactValue: r.contact_value,
        fulfillment: r.fulfillment,
        status: r.status === "resolved" ? "resolved" : "submitted",
        createdAt: r.created_at,
        proofPhotos,
      };
    }),
  );

  return NextResponse.json({ claims });
}
