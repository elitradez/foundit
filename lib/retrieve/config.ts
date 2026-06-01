/**
 * Retrieve — gym / hotel lost-and-found tenant config.
 *
 * SELF-CONTAINED. This file (and everything under lib/retrieve, components/retrieve,
 * app/retrieve) is the "gym" tenant. It does NOT import the campus university-config,
 * Supabase, or any env. All gym behavior is gated behind tenant_type === "gym".
 *
 * No database this pass — data is mocked in lib/retrieve/store.ts.
 *
 * Deploy marker: livefit-gym Vercel project (deploy trigger).
 */

export type TenantType = "university" | "gym";

/** The tenant this subtree serves. Every gym route/component is gated behind this. */
export const TENANT_TYPE: TenantType = "gym";

/** Guard helper — gym features only run when the tenant is a gym. */
export function isGymTenant(t: TenantType = TENANT_TYPE): boolean {
  return t === "gym";
}

export const RETRIEVE_CONFIG = {
  tenantType: TENANT_TYPE,
  /** Lowercase orange display wordmark. */
  wordmark: "retrieve",
  /** Generic venue label; a real tenant would inject its name later. */
  venueName: "Summit Athletic Club",
  venueKind: "gym" as "gym" | "hotel",
  /** Where members pick recovered items up — placeholder copy for the demo. */
  pickupLocation: "the front desk",
} as const;

/**
 * Where staff find items around a gym/hotel. Drives the intake + filter UIs.
 */
export const RETRIEVE_LOCATIONS: string[] = [
  "Front Desk",
  "Men's Locker Room",
  "Women's Locker Room",
  "Weight Floor",
  "Cardio Deck",
  "Group Studio 1",
  "Group Studio 2",
  "Pool Deck",
  "Sauna",
  "Lobby",
  "Parking Garage",
];

export type CategoryKey =
  | "phone"
  | "wallet"
  | "id"
  | "keys"
  | "headphones"
  | "electronics"
  | "bottle"
  | "clothing"
  | "bag"
  | "jewelry"
  | "eyewear"
  | "other";

export type Category = {
  key: CategoryKey;
  label: string;
  icon: string;
  /**
   * Sensitive categories have their photo blurred by default in member-facing
   * views (ID / wallet / phone), to protect against theft. Non-sensitive items
   * are shown clear so members can recognize them.
   */
  sensitive: boolean;
};

export const RETRIEVE_CATEGORIES: Category[] = [
  { key: "phone", label: "Phone", icon: "📱", sensitive: true },
  { key: "wallet", label: "Wallet", icon: "👛", sensitive: true },
  { key: "id", label: "ID / Card", icon: "🪪", sensitive: true },
  { key: "keys", label: "Keys", icon: "🔑", sensitive: false },
  { key: "headphones", label: "Headphones / Earbuds", icon: "🎧", sensitive: false },
  { key: "electronics", label: "Electronics", icon: "💻", sensitive: false },
  { key: "bottle", label: "Water Bottle", icon: "🥤", sensitive: false },
  { key: "clothing", label: "Clothing", icon: "🧥", sensitive: false },
  { key: "bag", label: "Bag / Backpack", icon: "🎒", sensitive: false },
  { key: "jewelry", label: "Jewelry / Watch", icon: "⌚", sensitive: false },
  { key: "eyewear", label: "Glasses / Sunglasses", icon: "🕶️", sensitive: false },
  { key: "other", label: "Other", icon: "📦", sensitive: false },
];

export function categoryByKey(key: CategoryKey): Category {
  return RETRIEVE_CATEGORIES.find((c) => c.key === key) ?? RETRIEVE_CATEGORIES[RETRIEVE_CATEGORIES.length - 1];
}

export function isSensitiveCategory(key: CategoryKey): boolean {
  return categoryByKey(key).sensitive;
}
