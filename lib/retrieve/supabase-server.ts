import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * SERVER-ONLY Supabase client for the gym "Retrieve" tenant, using the gym
 * service-role key. Never import this from a client component — the
 * `server-only` guard makes that a build error.
 *
 * Used by gym API routes for privileged work the publishable-key client must
 * not do: minting signed URLs for the private photo bucket, staff-gated
 * uploads, and staff-gated status mutations. Points ONLY at the gym project
 * (retrieve-gym-dev); completely separate from the campus admin client.
 */

let client: SupabaseClient | null = null;

export function getRetrieveServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_RETRIEVE_SUPABASE_URL;
  const key = process.env.RETRIEVE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_RETRIEVE_SUPABASE_URL or RETRIEVE_SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
