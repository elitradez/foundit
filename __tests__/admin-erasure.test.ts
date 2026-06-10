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
const supabaseMock = {
  claimsResult:            { data: [] as { id: string; university_id: string | null }[], error: null },
  claimedItemsResult:      { data: [] as { photo_path: string }[], error: null },
  studentInfoCountResult:  { data: null, error: null, count: 0 },
  claimedItemsCountResult: { data: null, error: null, count: 0 },
  alertsCountResult:       { data: null, error: null, count: 0 },
  alertsUpdateCount:       0,
  storageRemoveResult:     { error: null as { message: string } | null },
  mutationResult:          { data: null, error: null },
};

const storageRemoveSpy = vi.fn(async () => supabaseMock.storageRemoveResult);
const deleteSpy  = vi.fn();
const updateSpy  = vi.fn();
const insertSpy  = vi.fn();

// A minimal awaitable shape: supabase query builders resolve via .then().
type Thenable = { then: (resolve: (v: unknown) => unknown) => unknown };

// Build a chainable Supabase query builder that resolves via .then().
function makeChain(resolvedValue: unknown) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "or", "update", "delete", "insert", "limit"]) {
    chain[method] = vi.fn(() => chain);
  }
  (chain as unknown as Thenable).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(resolvedValue).then(resolve);
  return chain;
}

// Call count so we can distinguish the initial SELECT from subsequent UPDATE
// calls on the claims table.
let claimsFromCallCount = 0;

function buildMockSupabase() {
  claimsFromCallCount = 0;

  const mockFrom = vi.fn((table: string) => {
    // -----------------------------------------------------------------------
    // claims: first call is the lookup SELECT; subsequent calls are UPDATE
    // -----------------------------------------------------------------------
    if (table === "claims") {
      claimsFromCallCount++;
      if (claimsFromCallCount === 1) {
        return makeChain(supabaseMock.claimsResult);
      }
      const chain = makeChain(supabaseMock.mutationResult);
      (chain as Record<string, unknown>).update = vi.fn((data: unknown) => {
        updateSpy(table, data);
        return chain;
      });
      return chain;
    }

    // -----------------------------------------------------------------------
    // claimed_items: delete spy + select dispatches on count vs data
    // -----------------------------------------------------------------------
    if (table === "claimed_items") {
      const chain = makeChain(supabaseMock.claimedItemsResult);
      (chain as Record<string, unknown>).delete = vi.fn(() => {
        deleteSpy(table);
        return makeChain(supabaseMock.mutationResult);
      });
      (chain as Record<string, unknown>).select = vi.fn(
        (_cols: string, opts?: { count?: string; head?: boolean }) => {
          if (opts?.count === "exact") return makeChain(supabaseMock.claimedItemsCountResult);
          return makeChain(supabaseMock.claimedItemsResult);
        }
      );
      return chain;
    }

    // -----------------------------------------------------------------------
    // student_info: delete spy
    // -----------------------------------------------------------------------
    if (table === "student_info") {
      const chain = makeChain(supabaseMock.studentInfoCountResult);
      (chain as Record<string, unknown>).delete = vi.fn(() => {
        deleteSpy(table);
        return makeChain(supabaseMock.mutationResult);
      });
      return chain;
    }

    // -----------------------------------------------------------------------
    // alerts: select returns count (dry-run), update returns count (real-run)
    // -----------------------------------------------------------------------
    if (table === "alerts") {
      const chain: Record<string, unknown> = {};
      for (const method of ["eq", "or", "in", "limit"]) {
        chain[method] = vi.fn(() => chain);
      }
      chain.select = vi.fn((_cols: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.count === "exact") return makeChain(supabaseMock.alertsCountResult);
        return makeChain({ data: [], error: null });
      });
      chain.update = vi.fn((data: unknown) => {
        updateSpy(table, data);
        return makeChain({ data: null, error: null, count: supabaseMock.alertsUpdateCount });
      });
      (chain as unknown as Thenable).then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve(supabaseMock.alertsCountResult).then(resolve);
      return chain;
    }

    // -----------------------------------------------------------------------
    // security_log / retention_log: insert spy with fire-and-forget support
    // -----------------------------------------------------------------------
    if (table === "security_log" || table === "retention_log") {
      const chain = makeChain(supabaseMock.mutationResult);
      (chain as Record<string, unknown>).insert = vi.fn((data: unknown) => {
        insertSpy(table, data);
        return makeChain(supabaseMock.mutationResult);
      });
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
  { dryRun = false } = {}
): Request {
  const url = `https://founditcampus.com/api/admin/erasure${dryRun ? "?dry_run=true" : ""}`;
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-secret": "valid-secret" },
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
    supabaseMock.claimsResult            = { data: [], error: null };
    supabaseMock.claimedItemsResult      = { data: [], error: null };
    supabaseMock.studentInfoCountResult  = { data: null, error: null, count: 0 };
    supabaseMock.claimedItemsCountResult = { data: null, error: null, count: 0 };
    supabaseMock.alertsCountResult       = { data: null, error: null, count: 0 };
    supabaseMock.alertsUpdateCount       = 0;
    supabaseMock.storageRemoveResult     = { error: null };
    supabaseMock.mutationResult          = { data: null, error: null };
  });

  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------

  it("returns 401 when x-admin-secret is missing or wrong", async () => {
    mockCheckAdminSecret.mockReturnValue(false);
    const res = await POST(makeRequest({ email: "a@b.com" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Unauthorized");
  });

  // -------------------------------------------------------------------------
  // Input validation
  // -------------------------------------------------------------------------

  it("returns 400 when both email and phone are absent", async () => {
    mockCheckAdminSecret.mockReturnValue(true);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/email or phone/i);
  });

  it("returns 400 on malformed JSON body", async () => {
    mockCheckAdminSecret.mockReturnValue(true);
    const req = new Request("https://founditcampus.com/api/admin/erasure", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-secret": "x" },
      body: "not-json",
    });
    expect((await POST(req)).status).toBe(400);
  });

  // -------------------------------------------------------------------------
  // Zero matches — no-op
  // -------------------------------------------------------------------------

  it("returns success with all zeros when no claims and no alerts matched", async () => {
    mockCheckAdminSecret.mockReturnValue(true);
    supabaseMock.claimsResult      = { data: [], error: null };
    supabaseMock.alertsUpdateCount = 0;

    const res = await POST(makeRequest({ email: "ghost@example.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      claims_affected: 0,
      photos_deleted: 0,
      photos_failed: 0,
      alerts_affected: 0,
    });
  });

  // -------------------------------------------------------------------------
  // Dry-run
  // -------------------------------------------------------------------------

  it("dry_run=true returns counts (including alerts) without executing any writes", async () => {
    mockCheckAdminSecret.mockReturnValue(true);
    supabaseMock.claimsResult            = { data: SAMPLE_CLAIMS, error: null };
    supabaseMock.studentInfoCountResult  = { data: null, error: null, count: 2 };
    supabaseMock.claimedItemsCountResult = { data: null, error: null, count: 2 };
    supabaseMock.alertsCountResult       = { data: null, error: null, count: 3 };

    const res = await POST(makeRequest({ email: "student@university.edu" }, { dryRun: true }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.dry_run).toBe(true);
    expect(body.claims_affected).toBe(2);
    expect(body.student_info_rows).toBe(2);
    expect(body.claimed_items_rows).toBe(2);
    expect(body.alerts_affected).toBe(3);

    // No writes
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
  // Real erasure — claims
  // -------------------------------------------------------------------------

  it("real run: nulls PII on claims, hard-deletes student_info and claimed_items, deletes photos", async () => {
    mockCheckAdminSecret.mockReturnValue(true);
    supabaseMock.claimsResult        = { data: SAMPLE_CLAIMS, error: null };
    supabaseMock.claimedItemsResult  = { data: SAMPLE_CLAIMED_ITEMS, error: null };
    supabaseMock.alertsUpdateCount   = 0;

    const res = await POST(makeRequest({ email: "student@university.edu" }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.claims_affected).toBe(2);
    expect(body.photos_deleted).toBe(2);
    expect(body.photos_failed).toBe(0);

    expect(deleteSpy).toHaveBeenCalledWith("claimed_items");
    expect(deleteSpy).toHaveBeenCalledWith("student_info");
    expect(storageRemoveSpy).toHaveBeenCalledTimes(2);
  });

  it("real run: NULLs all 7 PII fields on claims, row is not deleted", async () => {
    mockCheckAdminSecret.mockReturnValue(true);
    supabaseMock.claimsResult      = { data: [{ id: "c-1", university_id: "u-1" }], error: null };
    supabaseMock.claimedItemsResult= { data: [], error: null };

    const res = await POST(makeRequest({ phone: "+14155551234" }));
    expect(res.status).toBe(200);
    expect((await res.json()).claims_affected).toBe(1);

    expect(updateSpy).toHaveBeenCalledWith(
      "claims",
      expect.objectContaining({
        student_name:      null,
        student_email:     null,
        phone_number:      null,
        student_id_number: null,
        claim_description: null,
        description:       null,
        staff_notes:       null,
      })
    );
  });

  // -------------------------------------------------------------------------
  // Real erasure — alerts
  // -------------------------------------------------------------------------

  it("real run: NULLs phone, email, description on matching alerts, row is not deleted", async () => {
    mockCheckAdminSecret.mockReturnValue(true);
    supabaseMock.claimsResult      = { data: [{ id: "c-1", university_id: "u-1" }], error: null };
    supabaseMock.claimedItemsResult= { data: [], error: null };
    supabaseMock.alertsUpdateCount = 2;

    const res = await POST(makeRequest({ email: "student@university.edu" }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.alerts_affected).toBe(2);

    expect(updateSpy).toHaveBeenCalledWith(
      "alerts",
      expect.objectContaining({ phone: null, email: null, description: null })
    );
  });

  it("alerts are erased even when no matching claims exist", async () => {
    mockCheckAdminSecret.mockReturnValue(true);
    supabaseMock.claimsResult      = { data: [], error: null };
    supabaseMock.alertsUpdateCount = 1;

    const res = await POST(makeRequest({ email: "sms-only@university.edu" }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.claims_affected).toBe(0);
    expect(body.alerts_affected).toBe(1);

    // No claims operations ran
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(storageRemoveSpy).not.toHaveBeenCalled();

    // But alerts update did run
    expect(updateSpy).toHaveBeenCalledWith("alerts", expect.objectContaining({ phone: null }));
  });

  it("response always includes alerts_affected in the payload", async () => {
    mockCheckAdminSecret.mockReturnValue(true);
    supabaseMock.claimsResult      = { data: SAMPLE_CLAIMS, error: null };
    supabaseMock.claimedItemsResult= { data: [], error: null };
    supabaseMock.alertsUpdateCount = 1;

    const body = await (await POST(makeRequest({ email: "s@u.edu" }))).json();
    expect(body).toHaveProperty("alerts_affected", 1);
  });

  // -------------------------------------------------------------------------
  // Audit log
  // -------------------------------------------------------------------------

  it("security_log row has correct event_type, university_id, and no PII", async () => {
    mockCheckAdminSecret.mockReturnValue(true);
    supabaseMock.claimsResult      = { data: [{ id: "c-1", university_id: "u-1" }], error: null };
    supabaseMock.claimedItemsResult= { data: [], error: null };
    supabaseMock.alertsUpdateCount = 1;

    await POST(makeRequest({ email: "s@uni.edu" }));
    await Promise.resolve(); // allow fire-and-forget to settle

    expect(insertSpy).toHaveBeenCalledWith(
      "security_log",
      expect.objectContaining({ event_type: "erasure_admin", university_id: "u-1" })
    );

    const securityLogCall = insertSpy.mock.calls.find(
      (call: unknown[]) => call[0] === "security_log",
    ) as [string, { description: string }] | undefined;
    expect(securityLogCall).toBeDefined();
    const logData = (securityLogCall as [string, { description: string }])[1];
    expect(logData.description).not.toContain("s@uni.edu");
    expect(logData.description).not.toMatch(/@/);
    expect(logData.description).toMatch(/alert/i);
  });

  // -------------------------------------------------------------------------
  // Storage failure does NOT abort database erasure
  // -------------------------------------------------------------------------

  it("storage failure does not abort DB deletion and is counted in photos_failed", async () => {
    mockCheckAdminSecret.mockReturnValue(true);
    supabaseMock.claimsResult        = { data: SAMPLE_CLAIMS, error: null };
    supabaseMock.claimedItemsResult  = { data: SAMPLE_CLAIMED_ITEMS, error: null };
    supabaseMock.storageRemoveResult = { error: { message: "storage bucket unavailable" } };
    supabaseMock.alertsUpdateCount   = 0;

    const res = await POST(makeRequest({ email: "student@university.edu" }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.photos_deleted).toBe(0);
    expect(body.photos_failed).toBe(2);

    // DB operations still ran
    expect(deleteSpy).toHaveBeenCalledWith("claimed_items");
    expect(deleteSpy).toHaveBeenCalledWith("student_info");
    expect(updateSpy).toHaveBeenCalled();
  });

  it("storage failure logs orphan paths to retention_log", async () => {
    mockCheckAdminSecret.mockReturnValue(true);
    supabaseMock.claimsResult        = { data: [{ id: "c-1", university_id: "u-1" }], error: null };
    supabaseMock.claimedItemsResult  = { data: [{ photo_path: "c-1/proof.jpg" }], error: null };
    supabaseMock.storageRemoveResult = { error: { message: "network error" } };

    await POST(makeRequest({ email: "s@uni.edu" }));
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
