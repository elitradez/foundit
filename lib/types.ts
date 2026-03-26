export type ItemRow = {
  id: string;
  name: string;
  description: string;
  location: string;
  date_found: string;
  photo_path: string;
  status: "active" | "returned" | "surplus";
  returned_at: string | null;
  surplus_sent_at: string | null;
  claim_description: string | null;
  pin_hash: string | null;
  pin_salt: string | null;
  created_at: string;
  pending_claims_count?: number;
  total_claims_count?: number;
};

export type PublicItem = Pick<
  ItemRow,
  "id" | "name" | "location" | "date_found" | "photo_path"
> & { requires_pin: boolean };

export type ClaimRow = {
  id: string;
  item_id: string;
  student_name: string;
  student_email: string;
  student_id_number: string;
  claim_description: string;
  status: "pending" | "approved" | "returned";
  created_at: string;
  updated_at: string;
  item?: Pick<ItemRow, "id" | "name" | "photo_path" | "location" | "date_found">;
};
