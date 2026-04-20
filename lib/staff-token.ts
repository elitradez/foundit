const encoder = new TextEncoder();

export type DepartmentClaims = {
  exp: number;
  department_id: string;
  university_id: string;
  department_name: string;
  pickup_location: string | null;
};

function getSigningSecret(): string {
  const secret = process.env.STAFF_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("STAFF_SESSION_SECRET must be set to a 32+ character value");
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

export async function createStaffSessionToken(claims: Omit<DepartmentClaims, "exp">): Promise<string> {
  const secret = getSigningSecret();
  const payload: DepartmentClaims = {
    ...claims,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
  const sigB64 = Buffer.from(sig).toString("base64url");
  return `${payloadB64}.${sigB64}`;
}

export async function verifyStaffSessionToken(
  token: string | undefined,
): Promise<DepartmentClaims | null> {
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
    ) as DepartmentClaims;
    if (typeof payload.exp !== "number" || payload.exp <= Date.now()) return null;
    if (!payload.department_id || !payload.university_id) return null;
    return payload;
  } catch {
    return null;
  }
}
