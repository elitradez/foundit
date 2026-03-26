const encoder = new TextEncoder();

function getSessionSecretOrNull(): string | null {
  return process.env.STAFF_SESSION_SECRET ?? process.env.STAFF_PASSWORD ?? null;
}

function requireSessionSecretForLogin(): string {
  const s = getSessionSecretOrNull();
  if (!s) throw new Error("STAFF_PASSWORD or STAFF_SESSION_SECRET must be set");
  return s;
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

export async function createStaffSessionToken(): Promise<string> {
  const secret = requireSessionSecretForLogin();
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const payload = JSON.stringify({ exp });
  const payloadB64 = Buffer.from(payload, "utf8").toString("base64url");
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
  const sigB64 = Buffer.from(sig).toString("base64url");
  return `${payloadB64}.${sigB64}`;
}

export async function verifyStaffSessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return false;
  try {
    const secret = getSessionSecretOrNull();
    if (!secret) return false;
    const key = await importHmacKey(secret);
    const sig = Buffer.from(sigB64, "base64url");
    const ok = await crypto.subtle.verify("HMAC", key, sig, encoder.encode(payloadB64));
    if (!ok) return false;
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as {
      exp: number;
    };
    return typeof payload.exp === "number" && payload.exp > Date.now();
  } catch {
    return false;
  }
}
