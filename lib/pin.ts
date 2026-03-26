import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

export function hashPin(pin: string): { pin_hash: string; pin_salt: string } {
  const salt = randomBytes(16);
  const hash = scryptSync(pin.normalize("NFKC"), salt, 32);
  return {
    pin_hash: hash.toString("hex"),
    pin_salt: salt.toString("hex"),
  };
}

export function verifyPin(pin: string, pinHash: string, pinSalt: string): boolean {
  try {
    const salt = Buffer.from(pinSalt, "hex");
    const expected = Buffer.from(pinHash, "hex");
    const hash = scryptSync(pin.normalize("NFKC"), salt, 32);
    return hash.length === expected.length && timingSafeEqual(hash, expected);
  } catch {
    return false;
  }
}
