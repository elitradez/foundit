import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { checkAdminSecret } from "@/lib/admin-auth";

const SECRET = "a".repeat(64);
const WRONG = "b".repeat(64);

function makeRequest(headerValue: string | null): Request {
  const headers = new Headers();
  if (headerValue !== null) headers.set("x-admin-secret", headerValue);
  return new Request("http://localhost/api/admin/backfill-embeddings", {
    method: "POST",
    headers,
  });
}

describe("checkAdminSecret", () => {
  const saved = process.env.ADMIN_API_SECRET;

  beforeEach(() => {
    process.env.ADMIN_API_SECRET = SECRET;
  });

  afterEach(() => {
    if (saved === undefined) {
      delete process.env.ADMIN_API_SECRET;
    } else {
      process.env.ADMIN_API_SECRET = saved;
    }
  });

  it("returns false when x-admin-secret header is missing", () => {
    expect(checkAdminSecret(makeRequest(null))).toBe(false);
  });

  it("returns false when x-admin-secret header is wrong", () => {
    expect(checkAdminSecret(makeRequest(WRONG))).toBe(false);
  });

  it("returns false when x-admin-secret header is an empty string", () => {
    expect(checkAdminSecret(makeRequest(""))).toBe(false);
  });

  it("returns false when x-admin-secret is close but not exact", () => {
    expect(checkAdminSecret(makeRequest(SECRET.slice(0, -1)))).toBe(false);
  });

  it("returns true when x-admin-secret matches ADMIN_API_SECRET exactly", () => {
    expect(checkAdminSecret(makeRequest(SECRET))).toBe(true);
  });

  it("returns false when ADMIN_API_SECRET env var is not set", () => {
    delete process.env.ADMIN_API_SECRET;
    expect(checkAdminSecret(makeRequest(SECRET))).toBe(false);
  });

  it("returns false when ADMIN_API_SECRET env var is empty string", () => {
    process.env.ADMIN_API_SECRET = "";
    expect(checkAdminSecret(makeRequest(SECRET))).toBe(false);
  });
});
