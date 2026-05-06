import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks
// vi.hoisted() ensures the mock fn exists before vi.mock() factory runs,
// since vi.mock() is hoisted to the top of the file by vitest's transformer.
// ---------------------------------------------------------------------------

const { mockCheckAdminSecret } = vi.hoisted(() => ({
  mockCheckAdminSecret: vi.fn<() => boolean>(),
}));

vi.mock("@/lib/admin-auth", () => ({ checkAdminSecret: mockCheckAdminSecret }));

// Supabase mock state — mutated per test via helpers below.
// Each property holds the value that the next awaited query will resolve with.
const supabaseMock = {
  claimsResult:           { data: [] as { id: string; university_id: string | null }[], error: null },
  claimedItemsResult:     { data: [] as { photo_path: string }[], error: null },
  studentInfoCountResult: { data: null, error: null, count: 0 },
  claimedItemsCountResult:{ data: null, error: null, count: 0 },
  storageRemoveResult:    { error: null as { message: string } | null },
  mutationResult:         { data: null, error: null },
};

const storageRemoveSpy = vi.fn(async (_paths: string[]) => supabaseMock.storageRemoveResult);
const deleteSpy  = vi.fn();
const updateSpy  = vi.fn();
const insertSpy  = vi.fn();

// Build a chainable Supabase query builder that resolves via .then().
// "resolvedValue" is what `await builder` returns.
function makeChain(resolvedValue: unknown) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "or", "update", "delete", "insert", "limit"]) {
    chain[method] = vi.fn(() => chain);
  }
  // Make the chain a thenable so `await chain` works.
  (chain as { then: Function }).then = (
    resolve: (v: unknown) => unknown,
    _reject?: (e: unknown) => unknown
  ) => Promise.resolve(resolvedValue).then(resolve);
  return chain;
}

// Call count so we can return different data on the second call to from("claims")
let claimsFromCallCount = 0;

function buildMockSupabase() {
  claimsFromCallCount = 0;

  const mockFrom = vi.fn((table: string) => {
    if (table === "claims") {
      claimsFromCallCount++;
      if (claimsFromCallCount === 1) {
        // First call: the lookup SELECT query
        return makeChain(supabaseMock.claimsResult);
      }
      // Subsequent calls: UPDATE (returns spy-wrapped chain)
      const chain = makeChain(supabaseMock.mutationResult);
      (chain as Record<string, unknown>).update = vi.fn((data: unknown) => {
        updateSpy(table, data);
        return chain;
      });
      return chain;
    }

    if (table === "claimed_items") {
      const chain = makeChain(supabaseMock.claimedItemsResult);
      // Override delete so we can spy on it
      (chain as Record<string, unknown>).delete = vi.fn(() => {
        deleteSpy(table);
        return makeChain(supabaseMock.mutationResult);
      });
      // Override select to handle both "photo_path" and count queries
      (chain as Record<string, unknown>).select = vi.fn(
        (_cols: string, opts?: { count?: string; head?: boolean }) => {
          if (opts?.count === "exact") return makeChain(supabaseMock.claimedItemsCountResult);
          return makeChain(supabaseMock.claimedItemsResult);
        }
      );
      return chain;
    }

    if (table === "student_info") {
      const chain = makeChain(supabaseMock.studentInfoCountResult);
      (chain as Record<string, unknown>).delete = vi.fn(() => {
        deleteSpy(table);
        return makeChain(supabaseMock.mutationResult);
      });
      return chain;
    }

    if (table === "security_log" || table === "retention_log") {
      const chain = makeChain(supabaseMock.mutationResult);
      (chain as Record<string, unknown>).insert = vi.fn((data: unknown) => {
        insertSpy(table, data);
        return makeChain(supabaseMock.mutationResult);
      });
      // Make insert().then() work (fire-and-forget in the route uses .then())
      return chain;
    }

    return makeChain(supabaseMock.mutationResult);
  });

  return {
    from: mockFrom,
    storage: { from: vi.fn(() => ({ remove: storageRemoveSpy })) },
  };
}

vi.mock("@/lib/supabase-admin", () => ({
  createAdminSupabaseClient: vi.fn(() => buildMockSupabase()),
}));

// ---------------------------------------------------------------------------
// Import the route AFTER mocks are registered
// ---------------------------------------------------------------------------
import { POST } from "@/app/api/admin/erasure/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(
  body: Record<string, unknown> | null,
  { secret = "valid-secret", dryRun = false } = {}
): Request {
  const url = `https://founditcampus.com/api/admin/erasure${dryRun ? "?dry_run=true" : ""}`;
  const headers = new Headers({ "Content-Type": "application/json" });
  if (secret) headers.set("x-admin-secret", secret);
  return new Request(url, {
    method: "POST",
    headers,
    body: body !== null ? JSON.stringify(body) : undefined,
  });
}

const SAMPLE_CLAIMS = [
  { id: "claim-uuid-1", university_id: "uni-uuid-1" },
  { id: "claim-uuid-2", university_id: "uni-uuid-1" },
];

const SAMPLE_CLAIMED_ITEMS = [
  { photo_path: "claim-uuid-1/proof.jpg" },
  { photo_path: "claim-uuid-2/proof.jpg" },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/admin/erasure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock state to safe defaults
    supabaseMock.claimsResult           = { data: [], error: null };
    supabaseMock.claimedItemsResult     = { data: [], error: null };
    supabaseMock.studentInfoCountResult = { data: null, error: null, count: 0 };
    supabaseMock.claimedItemsCountResult= { data: null, error: null, count: 0 };
    supabaseMock.storageRemoveResult    = { error: null };
    supabaseMock.mutationResult         = { data: null, error: null };
  });

  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------

  it("returns 401 when x-admin-secret is missing or wrong", async () => {
    mockCheckAdminSecret.mockReturnValue(false);
    const res = await POST(makeRequest({ email: "a@b.com" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  // -------------------------------------------------------------------------
  // Input validation
  // -------------------------------------------------------------------------

  it("returns 400 when both email and phone are absent", async () => {
    mockCheckAdminSecret.mockReturnValue(true);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/email or phone/i);
  });

  it("returns 400 on malformed JSON body", async () => {
    mockCheckAdminSecret.mockReturnValue(true);
    const url = "https://founditcampus.com/api/admin/erasure";
    const req = new Request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-secret": "x" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // -------------------------------------------------------------------------
  // Zero matches — no-op
  // -------------------------------------------------------------------------

  it("returns success with zero counts when no matching claims exist", async () => {
    mockCheckAdminSecret.mockReturnValue(true);
    supabaseMock.claimsResult = { data: [], error: null };

    const res = await POST(makeRequest({ email: "ghost@example.com" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, claims_affected: 0, photos_deleted: 0, photos_failed: 0 });
  });

  // -------------------------------------------------------------------------
  // Dry-run
  // -------------------------------------------------------------------------

  it("dry_run=true returns counts without executing any deletes or updates", async () => {
    mockCheckAdminSecret.mockReturnValue(true);
    supabaseMock.claimsResult            = { data: SAMPLE_CLAIMS, error: null };
    supabaseMock.studentInfoCountResult  = { data: null, error: null, count: 2 };
    supabaseMock.claimedItemsCountResult = { data: null, error: null, count: 2 };

    const res = await POST(makeRequest({ email: "student@university.edu" }, { dryRun: true }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.dry_run).toBe(true);
    expect(body.claims_affected).toBe(2);
    expect(body.student_info_rows).toBe(2);
    expect(body.claimed_items_rows).toBe(2);

    // No writes should have occurred
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(insertSpy).not.toHaveBeenCalled();
    expect(storageRemoveSpy).not.toHaveBeenCalled();
  });

  it("dry_run does not write to security_log", async () => {
    mockCheckAdminSecret.mockReturnValue(true);
    supabaseMock.claimsResult = { data: SAMPLE_CLAIMS, error: null };

    await POST(makeRequest({ email: "student@university.edu" }, { dryRun: true }));

    expect(insertSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Real erasure — happy path
  // -------------------------------------------------------------------------

  it("real run: nulls PII on claims, hard-deletes student_info and claimed_items, deletes photos", async () => {
    mockCheckAdminSecret.mockReturnValue(true);
    supabaseMock.claimsResult       = { data: SAMPLE_CLAIMS, error: null };
    supabaseMock.claimedItemsResult = { data: SAMPLE_CLAIMED_ITEMS, error: null };
    supabaseMock.storageRemoveResult = { error: null };

    const res = await POST(makeRequest({ email: "student@university.edu" }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.claims_affected).toBe(2);
    expect(body.photos_deleted).toBe(2);
    expect(body.photos_failed).toBe(0);

    // claimed_items and student_info must have been deleted
    expect(deleteSpy).toHaveBeenCalledWith("claimed_items");
    expect(deleteSpy).toHaveBeenCalledWith("student_info");

    // Storage remove called once per photo
    expect(storageRemoveSpy).toHaveBeenCalledTimes(2);
  });

  it("real run: PII columns nulled on claims (not deleted)", async () => {
    mockCheckAdminSecret.mockReturnValue(true);
    supabaseMock.claimsResult       = { data: [{ id: "c-1", university_id: "u-1" }], error: null };
    supabaseMock.claimedItemsResult = { data: [], error: null };

    const res = await POST(makeRequest({ phone: "+14155551234" }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.claims_affected).toBe(1);

    // Verify update was called with nulls for every PII field
    expect(updateSpy).toHaveBeenCalledWith(
      "claims",
      expect.objectContaining({
        student_name:        null,
        student_email:       null,
        phone_number:        null,
        student_id_number:   null,
        claim_description:   null,
        description:         null,
        staff_notes:         null,
      })
    );
  });

  it("real run: writes one security_log row per university_id, captures no PII", async () => {
    mockCheckAdminSecret.mockReturnValue(true);
    supabaseMock.claimsResult       = { data: [{ id: "c-1", university_id: "u-1" }], error: null };
    supabaseMock.claimedItemsResult = { data: [], error: null };

    await POST(makeRequest({ email: "s@uni.edu" }));

    // Allow the fire-and-forget .then() to settle
    await Promise.resolve();

    expect(insertSpy).toHaveBeenCalledWith(
      "security_log",
      expect.objectContaining({
        event_type:    "erasure_admin",
        university_id: "u-1",
      })
    );

    // Security log description must NOT contain the email or phone
    const [[, logData]] = insertSpy.mock.calls.filter(([t]: [string]) => t === "security_log");
    expect(logData.description).not.toContain("s@uni.edu");
    expect(logData.description).not.toMatch(/@/);
  });

  // -------------------------------------------------------------------------
  // Storage failure does NOT abort database erasure
  // -------------------------------------------------------------------------

  it("storage failure is recorded but does not abort DB deletion", async () => {
    mockCheckAdminSecret.mockReturnValue(true);
    supabaseMock.claimsResult       = { data: SAMPLE_CLAIMS, error: null };
    supabaseMock.claimedItemsResult = { data: SAMPLE_CLAIMED_ITEMS, error: null };
    supabaseMock.storageRemoveResult = { error: { message: "storage bucket unavailable" } };

    const res = await POST(makeRequest({ email: "student@university.edu" }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.claims_affected).toBe(2);
    expect(body.photos_deleted).toBe(0);
    expect(body.photos_failed).toBe(2);

    // DB operations must still have run despite storage failures
    expect(deleteSpy).toHaveBeenCalledWith("claimed_items");
    expect(deleteSpy).toHaveBeenCalledWith("student_info");
    expect(updateSpy).toHaveBeenCalled();
  });

  it("storage failure logs orphan paths to retention_log", async () => {
    mockCheckAdminSecret.mockReturnValue(true);
    supabaseMock.claimsResult       = { data: [{ id: "c-1", university_id: "u-1" }], error: null };
    supabaseMock.claimedItemsResult = { data: [{ photo_path: "c-1/proof.jpg" }], error: null };
    supabaseMock.storageRemoveResult = { error: { message: "network error" } };

    await POST(makeRequest({ email: "s@uni.edu" }));

    // Allow fire-and-forget to settle
    await Promise.resolve();
    await Promise.resolve();

    expect(insertSpy).toHaveBeenCalledWith(
      "retention_log",
      expect.objectContaining({
        storage_delete_failures: 1,
        notes: expect.stringContaining("erasure_orphan_photo"),
      })
    );
  });
});
