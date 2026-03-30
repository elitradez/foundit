export type ValueTier = "low_value" | "high_value";

export function parseValueTier(raw: unknown): ValueTier | null {
  if (raw === "low_value" || raw === "high_value") return raw;
  return null;
}

export function normalizeValueTier(raw: string | null | undefined): ValueTier {
  return raw === "low_value" ? "low_value" : "high_value";
}
