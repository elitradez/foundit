const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateUniversityId(): string {
  const raw = process.env.NEXT_PUBLIC_UNIVERSITY_ID?.trim() ?? "";
  if (!UUID_RE.test(raw)) {
    throw new Error(
      `NEXT_PUBLIC_UNIVERSITY_ID must be set to a valid UUID. Current value: [redacted length ${raw.length}]`,
    );
  }
  return raw;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Validated once at module load — throws at startup if env var is missing or malformed.
const _universityId: string = validateUniversityId();

export function getUniversityId(): string {
  return _universityId;
}

export type UniversityConfig = {
  name: string;
  brandColor: string;
  brandColorHover: string;
  brandRing: string;
  pickupLocation: string;
  siteUrl: string;
  universityId: string;
  logoPath?: string;
  welcomeCopy?: string;
};

export function getUniversityConfig(): UniversityConfig {
  const brandColor = process.env.NEXT_PUBLIC_BRAND_COLOR ?? "#CC0000";
  return {
    name: process.env.NEXT_PUBLIC_UNIVERSITY_NAME ?? "University of Utah",
    brandColor,
    brandColorHover: process.env.NEXT_PUBLIC_BRAND_COLOR_HOVER ?? "#a80000",
    brandRing: hexToRgba(brandColor, 0.12),
    pickupLocation: process.env.NEXT_PUBLIC_PICKUP_LOCATION ?? "Lassonde Studios",
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "founditcampus.com",
    universityId: _universityId,
    logoPath: process.env.NEXT_PUBLIC_LOGO_PATH || undefined,
    welcomeCopy: process.env.NEXT_PUBLIC_WELCOME_COPY || undefined,
  };
}
