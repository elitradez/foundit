import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

/**
 * Salted scrypt password hashing for the gym "Retrieve" tenant.
 *
 * Self-contained gym copy of the campus PIN helper — kept separate so the gym
 * surface never imports campus code. Used to verify the pilot staff password
 * against RETRIEVE_STAFF_PIN_HASH / RETRIEVE_STAFF_PIN_SALT (single-location
 * pilot; move to a per-staff table when multi-staff lands).
 */

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
