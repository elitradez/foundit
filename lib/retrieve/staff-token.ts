/**
 * Staff session tokens for the gym "Retrieve" tenant.
 *
 * Self-contained HMAC-SHA256 signed token, ported from the campus staff-token
 * pattern but FULLY ISOLATED from campus:
 *   - reads RETRIEVE_STAFF_SESSION_SECRET (NOT the campus STAFF_SESSION_SECRET)
 *   - gym-scoped claims, gym cookie name (see staff-session.ts)
 *
 * Single-tenant pilot: `tenant` is a constant marker, ready to become a real
 * tenant_id when multi-tenant lands. No Supabase Auth — this is a stateless
 * signed cookie verified on every staff request.
 */

const encoder = new TextEncoder();

const MAX_SESSION_MS = 8 * 60 * 60 * 1000; // 8-hour idle cap
const ABSOLUTE_MS = 12 * 60 * 60 * 1000; // 12-hour absolute backstop

export type RetrieveStaffRole = "owner" | "staff";

export type RetrieveStaffClaims = {
  iat: number;
  exp: number;
  tenant: string;
  staff_id: string;
  role: RetrieveStaffRole;
};

function getSigningSecret(): string {
  const secret = process.env.RETRIEVE_STAFF_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("RETRIEVE_STAFF_SESSION_SECRET must be set to a 32+ character value");
  }
  return secret;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createRetrieveStaffToken(
  claims: Omit<RetrieveStaffClaims, "iat" | "exp">,
): Promise<string> {
  const secret = getSigningSecret();
  const now = Date.now();
  const payload: RetrieveStaffClaims = {
    ...claims,
    iat: now,
    exp: now + ABSOLUTE_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
  const sigB64 = Buffer.from(sig).toString("base64url");
  return `${payloadB64}.${sigB64}`;
}

export async function verifyRetrieveStaffToken(
  token: string | undefined,
): Promise<RetrieveStaffClaims | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;
  try {
    const secret = getSigningSecret();
    const key = await importHmacKey(secret);
    const sig = Buffer.from(sigB64, "base64url");
    const ok = await crypto.subtle.verify("HMAC", key, sig, encoder.encode(payloadB64));
    if (!ok) return null;
    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8"),
    ) as RetrieveStaffClaims;
    if (typeof payload.exp !== "number" || payload.exp <= Date.now()) return null;
    if (typeof payload.iat !== "number") return null;
    if (Date.now() - payload.iat > MAX_SESSION_MS) return null;
    if (!payload.staff_id || !payload.tenant) return null;
    return payload;
  } catch {
    return null;
  }
}
