/**
 * Gym tenant registry for "Retrieve".
 *
 * Each gym is a tenant, addressable by subdomain (e.g. livefitgym.foundbylaika.com)
 * and — by design — also resolvable by path in the future. The first tenant is
 * Live Fit Gym. Logo + accent color are intentionally left as placeholders to be
 * filled in next (do NOT generate a logo / pick a color here).
 *
 * Self-contained gym config — imports no campus code.
 */

export type GymTenant = {
  /** Host label that maps to this tenant, e.g. "livefitgym" → livefitgym.foundbylaika.com */
  subdomain: string;
  displayName: string;
  /** Placeholder — fill next. Hex like "#F2590D"; null keeps the default Retrieve orange. */
  accentColor: string | null;
  /** Placeholder — fill next. Path under /public/retrieve/ (e.g. "/retrieve/livefit-logo.png"); null = none. */
  logo: string | null;
};

export const GYM_TENANTS: GymTenant[] = [
  {
    subdomain: "livefitgym",
    displayName: "Live Fit Gym",
    accentColor: null, // placeholder — fill next
    logo: null, // placeholder — fill next (do not generate)
  },
];

export const DEFAULT_GYM_TENANT: GymTenant = GYM_TENANTS[0];

/** Resolve a tenant from a request host. Falls back to the default (first) tenant. */
export function tenantFromHost(host?: string | null): GymTenant {
  if (!host) return DEFAULT_GYM_TENANT;
  const label = host.split(":")[0].split(".")[0].toLowerCase();
  return GYM_TENANTS.find((t) => t.subdomain === label) ?? DEFAULT_GYM_TENANT;
}
