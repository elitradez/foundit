import type { CategoryKey, TenantType } from "@/lib/retrieve/config";

export type ItemStatus = "active" | "recovered" | "disposed";

/**
 * A found item in the gym/hotel lost-and-found. Mock-only this pass.
 * `photo` is a data URL (camera capture / upload) or null → a generated
 * placeholder is rendered.
 */
export type RetrieveItem = {
  id: string;
  tenantType: TenantType; // always "gym" here — keeps tenant explicit on the record
  name: string;
  category: CategoryKey;
  location: string;
  dateFound: string; // ISO date (yyyy-mm-dd)
  notes: string;
  photo: string | null;
  status: ItemStatus;
  createdAt: number; // epoch ms, for sort order
};

export type ClaimStatus = "submitted";

/**
 * A member's claim against a found item. Mock-only this pass.
 * Shipping / payment are intentionally left as a placeholder for a later pass.
 */
export type RetrieveClaim = {
  id: string;
  itemId: string;
  description: string;
  photos: string[]; // optional member-supplied data URLs
  contactName: string;
  contactValue: string; // email or phone
  fulfillment: "pickup" | "ship"; // ship → wired to payment/shipping later
  status: ClaimStatus;
  createdAt: number;
};

export type NewItemInput = Omit<RetrieveItem, "id" | "createdAt" | "status" | "tenantType"> & {
  status?: ItemStatus;
};

export type NewClaimInput = Omit<RetrieveClaim, "id" | "createdAt" | "status">;

/** Open = awaiting staff; resolved = handled / picked up. */
export type StaffClaimStatus = "submitted" | "resolved";

/** A member claim as seen by staff — joined to its item, with signed proof URLs. */
export type StaffClaim = {
  id: string;
  itemId: string;
  itemName: string;
  itemCategory: CategoryKey;
  itemPhoto: string | null; // server photo-route URL for the item thumbnail (staff-authed)
  description: string;
  contactName: string;
  contactValue: string;
  fulfillment: "pickup" | "ship";
  status: StaffClaimStatus;
  createdAt: number; // epoch ms
  proofPhotos: string[]; // short-lived signed URLs
};
