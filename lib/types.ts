import type { ValueTier } from "@/lib/value-tier";

export type ItemRow = {
  id: string;
  name: string;
  description: string;
  location: string;
  date_found: string;
  photo_path: string;
  returned_at: string | null;
  claim_description: string | null;
  pin_hash: string | null;
  pin_salt: string | null;
  created_at: string;
  value_tier: ValueTier;
};

export type PublicItem = Pick<
  ItemRow,
  "id" | "name" | "location" | "date_found" | "photo_path" | "value_tier"
> & { requires_pin: boolean };

export type AlertRow = {
  id: string;
  phone: string;
  description: string;
  notified: boolean;
  created_at: string;
};
