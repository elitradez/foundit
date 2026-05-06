import { createHash, timingSafeEqual } from "crypto";

export function checkAdminSecret(req: Request): boolean {
  const provided = req.headers.get("x-admin-secret");
  const expected = process.env.ADMIN_API_SECRET;
  if (!provided || !expected) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
