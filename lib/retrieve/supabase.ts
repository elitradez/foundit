"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client for the gym "Retrieve" tenant.
 *
 * Points ONLY at the gym project (retrieve-gym-dev) via gym-scoped env vars —
 * completely separate from the campus Supabase client/vars. Created lazily and
 * returns null when unconfigured, so the build never throws if the gym env vars
 * are absent.
 */

// RETRIEVE_PHOTO_BUCKET moved to ./constants — it must NOT live in this
// "use client" module, or server-side imports resolve to a client-reference
// proxy instead of the string (caused `400 Bucket name invalid` on upload).
export { RETRIEVE_PHOTO_BUCKET } from "./constants";

const URL = process.env.NEXT_PUBLIC_RETRIEVE_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_RETRIEVE_SUPABASE_PUBLISHABLE_KEY;

let client: SupabaseClient | null = null;

export function getRetrieveSupabase(): SupabaseClient | null {
  if (!URL || !KEY) return null;
  if (!client) {
    client = createClient(URL, KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export function isRetrieveConfigured(): boolean {
  return Boolean(URL && KEY);
}
