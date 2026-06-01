import { headers } from "next/headers";
import { tenantFromHost, type GymTenant } from "@/lib/retrieve/tenants";

/**
 * Server helper: resolve the active gym tenant from the request host.
 * On Vercel the public host arrives as `x-forwarded-host`. Falls back to the
 * default tenant (Live Fit Gym) for localhost / preview URLs.
 */
export async function getActiveGymTenant(): Promise<GymTenant> {
  const h = await headers();
  return tenantFromHost(h.get("x-forwarded-host") ?? h.get("host"));
}
