export function isEduEmail(email: string): boolean {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return false;
  const domain = trimmed.slice(at + 1);
  return domain === "edu" || domain.endsWith(".edu");
}
