export type UniversityConfig = {
  name: string;
  brandColor: string;
  brandColorHover: string;
  pickupLocation: string;
  siteUrl: string;
};

export function getUniversityConfig(): UniversityConfig {
  return {
    name: process.env.NEXT_PUBLIC_UNIVERSITY_NAME ?? "University of Utah",
    brandColor: process.env.NEXT_PUBLIC_BRAND_COLOR ?? "#CC0000",
    brandColorHover: process.env.NEXT_PUBLIC_BRAND_COLOR_HOVER ?? "#a80000",
    pickupLocation: process.env.NEXT_PUBLIC_PICKUP_LOCATION ?? "Lassonde Studios",
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "founditcampus.com",
  };
}
