import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Describe-first claim flow tests. Focus: the anti-fraud properties.
//   - the description is COMMITTED before any matching
//   - matches below the similarity gate are never shown
//   - photos unblur only past BOTH gates, never for PIN items, fail closed
//   - SMS alerts reuse the committed description, with phone validation
//   - claims linking rejects unknown find-request ids
// Mocks follow the vi.hoisted pattern from admin-erasure.test.ts: register all
// module mocks before importing the routes.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => {
  const state = {
    rateLimited: false,
    findInsertResult: { data: { id: "11111111-1111-4111-8111-111111111111" }, error: null as { message: string } | null },
    vectorRows: [] as Array<{ id: string; name?: string; description?: string; similarity?: number }>,
    itemsRows: [] as Array<Record<string, unknown>>,
    itemLookup: null as Record<string, unknown> | null,
    findReqLookup: null as Record<string, unknown> | null,
    alertsExisting: [] as Array<{ id: string }>,
    scoreResult: 0 as number | (() => number),
    scoreThrows: false,
    // call records
    findInserts: [] as Array<Record<string, unknown>>,
    alertInserts: [] as Array<Record<string, unknown>>,
    claimInserts: [] as Array<Record<string, unknown>>,
    signedPaths: [] as string[],
    scoreCalls: [] as Array<{ official: string; student: string }>,
  };

  function makeChain(table: string) {
    const self: Record<string, unknown> = {};
    const assign = (k: string, v: unknown) => { self[k] = v; };
    assign("insert", vi.fn((row: Record<string, unknown>) => {
      if (table === "find_requests") {
        state.findInserts.push(row);
        return { select: () => ({ single: async () => state.findInsertResult }) };
      }
      if (table === "alerts") {
        state.alertInserts.push(row);
        return Promise.resolve({ error: null });
      }
      if (table === "claims") {
        state.claimInserts.push(row);
        return Promise.resolve({ error: null });
      }
      return Promise.resolve({ error: null });
    }));
    assign("select", vi.fn(() => self));
    assign("eq", vi.fn(() => self));
    assign("in", vi.fn(() => self));
    assign("order", vi.fn(() => self));
    assign("is", vi.fn(async () => ({ data: state.itemsRows, error: null })));
    assign("limit", vi.fn(async () => ({ data: state.alertsExisting, error: null })));
    assign("maybeSingle", vi.fn(async () => {
      if (table === "items") return { data: state.itemLookup, error: null };
      if (table === "find_requests") return { data: state.findReqLookup, error: null };
      return { data: null, error: null };
    }));
    return self;
  }

  const supabase = {
    from: vi.fn((table: string) => makeChain(table)),
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn(async (path: string) => {
          state.signedPaths.push(path);
          return { data: { signedUrl: `https://signed.example/${path}` }, error: null };
        }),
      })),
    },
  };

  return { state, supabase };
});

vi.mock("@/lib/supabase-admin", () => ({
  createAdminSupabaseClient: () => h.supabase,
}));

vi.mock("@/lib/university-config", () => ({
  getUniversityId: () => "uni-1",
}));

vi.mock("@/lib/ratelimit", () => ({
  aiLimiter: { name: "ai" },
  alertLimiter: { name: "alert" },
  claimLimiter: { name: "claim" },
  getClientIp: () => "1.2.3.4",
  isRateLimited: vi.fn(async () => h.state.rateLimited),
}));

vi.mock("@/lib/search", () => ({
  embedQuery: vi.fn(async () => [0.1, 0.2, 0.3]),
  vectorSearchItems: vi.fn(async () => h.state.vectorRows),
  rerankByRelevance: vi.fn(async (_q: string, rows: Array<{ id: string }>) => rows.map((r) => r.id)),
}));

vi.mock("@/lib/match-score", () => ({
  scoreMatch: vi.fn(async (official: string, student: string) => {
    h.state.scoreCalls.push({ official, student });
    if (h.state.scoreThrows) throw new Error("model down");
    return typeof h.state.scoreResult === "function" ? h.state.scoreResult() : h.state.scoreResult;
  }),
}));

import { POST as findPost } from "@/app/api/find/route";
import { POST as alertsPost } from "@/app/api/alerts/route";
import { POST as submitPost } from "@/app/api/claims/submit/route";

function jsonReq(body: unknown): Request {
  return new Request("http://test.local/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const GOOD_DESCRIPTION = "Dark green Hydro Flask with a dent on the side and a black lid";
const FR_ID = "11111111-1111-4111-8111-111111111111";

function makeItemRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `Item ${id}`,
    description: `Official description of ${id}`,
    date_found: "2026-06-01",
    photo_path: `${id}/photo.jpg`,
    pin_hash: null,
    returned_at: null,
    department_id: "dept-1",
    departments: { name: "Lassonde" },
    ...overrides,
  };
}

beforeEach(() => {
  const s = h.state;
  s.rateLimited = false;
  s.findInsertResult = { data: { id: FR_ID }, error: null };
  s.vectorRows = [];
  s.itemsRows = [];
  s.itemLookup = null;
  s.findReqLookup = null;
  s.alertsExisting = [];
  s.scoreResult = 0;
  s.scoreThrows = false;
  s.findInserts = [];
  s.alertInserts = [];
  s.claimInserts = [];
  s.signedPaths = [];
  s.scoreCalls = [];
  vi.clearAllMocks();
});

describe("POST /api/find", () => {
  it("rejects short descriptions without committing anything", async () => {
    const res = await findPost(jsonReq({ description: "blue bottle" }));
    expect(res.status).toBe(400);
    expect(h.state.findInserts).toHaveLength(0);
  });

  it("commits the description BEFORE matching, even when zero matches return", async () => {
    h.state.vectorRows = [];
    const res = await findPost(jsonReq({ description: GOOD_DESCRIPTION }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(h.state.findInserts).toHaveLength(1);
    expect(h.state.findInserts[0].description).toBe(GOOD_DESCRIPTION);
    expect(h.state.findInserts[0].university_id).toBe("uni-1");
    expect(body.findRequestId).toBe(FR_ID);
    expect(body.matches).toEqual([]);
  });

  it("aborts when the description cannot be committed", async () => {
    h.state.findInsertResult = { data: null as never, error: { message: "db down" } };
    const res = await findPost(jsonReq({ description: GOOD_DESCRIPTION }));
    expect(res.status).toBe(500);
  });

  it("never shows matches below the similarity gate, caps at 5, keeps rank order", async () => {
    h.state.vectorRows = [
      { id: "a", similarity: 0.7 },
      { id: "b", similarity: 0.65 },
      { id: "c", similarity: 0.6 },
      { id: "d", similarity: 0.55 },
      { id: "e", similarity: 0.5 },
      { id: "f", similarity: 0.46 }, // 6th above gate — cut by the cap
      { id: "g", similarity: 0.44 }, // below 0.45 — must never appear
    ];
    h.state.itemsRows = ["a", "b", "c", "d", "e", "f", "g"].map((id) => makeItemRow(id));
    const res = await findPost(jsonReq({ description: GOOD_DESCRIPTION }));
    const body = await res.json();
    expect(res.status).toBe(200);
    const ids = body.matches.map((m: { id: string }) => m.id);
    expect(ids).toEqual(["a", "b", "c", "d", "e"]);
    expect(ids).not.toContain("f");
    expect(ids).not.toContain("g");
  });

  it("unblurs only past the strict scorer gate (score > 60)", async () => {
    h.state.vectorRows = [{ id: "a", similarity: 0.7 }, { id: "b", similarity: 0.6 }];
    h.state.itemsRows = [makeItemRow("a"), makeItemRow("b")];
    let call = 0;
    h.state.scoreResult = () => (++call === 1 ? 90 : 40); // a passes, b fails
    const res = await findPost(jsonReq({ description: GOOD_DESCRIPTION }));
    const body = await res.json();
    const a = body.matches.find((m: { id: string }) => m.id === "a");
    const b = body.matches.find((m: { id: string }) => m.id === "b");
    expect(a.photoUrl).toContain("a/photo.jpg");
    expect(b.photoUrl).toBeNull();
    expect(h.state.signedPaths).toEqual(["a/photo.jpg"]);
  });

  it("never unblurs PIN-protected items and never even scores them", async () => {
    h.state.vectorRows = [{ id: "p", similarity: 0.9 }];
    h.state.itemsRows = [makeItemRow("p", { pin_hash: "hash" })];
    h.state.scoreResult = 100;
    const res = await findPost(jsonReq({ description: GOOD_DESCRIPTION }));
    const body = await res.json();
    expect(body.matches[0].photoUrl).toBeNull();
    expect(h.state.signedPaths).toHaveLength(0);
    expect(h.state.scoreCalls).toHaveLength(0);
  });

  it("fails CLOSED when the scorer errors — match shown, photo blurred", async () => {
    h.state.vectorRows = [{ id: "a", similarity: 0.8 }];
    h.state.itemsRows = [makeItemRow("a")];
    h.state.scoreThrows = true;
    const res = await findPost(jsonReq({ description: GOOD_DESCRIPTION }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.matches[0].photoUrl).toBeNull();
    expect(h.state.signedPaths).toHaveLength(0);
  });

  it("excludes items returned since their embedding was created", async () => {
    h.state.vectorRows = [{ id: "gone", similarity: 0.9 }, { id: "a", similarity: 0.7 }];
    // items fetch re-checks returned_at IS NULL: "gone" is not in the result set
    h.state.itemsRows = [makeItemRow("a")];
    h.state.scoreResult = 0;
    const res = await findPost(jsonReq({ description: GOOD_DESCRIPTION }));
    const body = await res.json();
    expect(body.matches.map((m: { id: string }) => m.id)).toEqual(["a"]);
  });

  it("returns 429 when rate limited, before committing anything", async () => {
    h.state.rateLimited = true;
    const res = await findPost(jsonReq({ description: GOOD_DESCRIPTION }));
    expect(res.status).toBe(429);
    expect(h.state.findInserts).toHaveLength(0);
  });
});

describe("POST /api/alerts", () => {
  it("rejects invalid phone numbers", async () => {
    h.state.findReqLookup = { id: FR_ID, description: GOOD_DESCRIPTION, university_id: "uni-1" };
    const res = await alertsPost(jsonReq({ findRequestId: FR_ID, phone: "12" }));
    expect(res.status).toBe(400);
    expect(h.state.alertInserts).toHaveLength(0);
  });

  it("404s on unknown find request", async () => {
    h.state.findReqLookup = null;
    const res = await alertsPost(jsonReq({ findRequestId: FR_ID, phone: "8015550100" }));
    expect(res.status).toBe(404);
  });

  it("registers the alert with the COMMITTED description and university_id", async () => {
    h.state.findReqLookup = { id: FR_ID, description: GOOD_DESCRIPTION, university_id: "uni-1" };
    const res = await alertsPost(jsonReq({ findRequestId: FR_ID, phone: "(801) 555-0100" }));
    expect(res.status).toBe(200);
    expect(h.state.alertInserts).toHaveLength(1);
    expect(h.state.alertInserts[0]).toMatchObject({
      phone: "+18015550100",
      description: GOOD_DESCRIPTION,
      university_id: "uni-1",
      notified: false,
    });
  });

  it("is idempotent for a duplicate pending alert", async () => {
    h.state.findReqLookup = { id: FR_ID, description: GOOD_DESCRIPTION, university_id: "uni-1" };
    h.state.alertsExisting = [{ id: "existing" }];
    const res = await alertsPost(jsonReq({ findRequestId: FR_ID, phone: "8015550100" }));
    expect(res.status).toBe(200);
    expect(h.state.alertInserts).toHaveLength(0);
  });

  it("returns 429 when rate limited", async () => {
    h.state.rateLimited = true;
    const res = await alertsPost(jsonReq({ findRequestId: FR_ID, phone: "8015550100" }));
    expect(res.status).toBe(429);
  });
});

describe("POST /api/claims/submit with findRequestId", () => {
  it("rejects an unknown findRequestId instead of silently dropping it", async () => {
    h.state.itemLookup = { id: "item-1", returned_at: null, university_id: "uni-1" };
    h.state.findReqLookup = null;
    const res = await submitPost(jsonReq({
      itemId: "item-1",
      studentName: "Sam Student",
      studentEmail: "sam@university.edu",
      findRequestId: FR_ID,
    }));
    expect(res.status).toBe(400);
    expect(h.state.claimInserts).toHaveLength(0);
  });

  it("links the claim to the committed description", async () => {
    h.state.itemLookup = { id: "item-1", returned_at: null, university_id: "uni-1" };
    h.state.findReqLookup = { id: FR_ID };
    const res = await submitPost(jsonReq({
      itemId: "item-1",
      studentName: "Sam Student",
      studentEmail: "sam@university.edu",
      studentDescription: GOOD_DESCRIPTION,
      findRequestId: FR_ID,
    }));
    expect(res.status).toBe(200);
    expect(h.state.claimInserts).toHaveLength(1);
    expect(h.state.claimInserts[0].find_request_id).toBe(FR_ID);
  });

  it("still works without a findRequestId (browse flow unchanged)", async () => {
    h.state.itemLookup = { id: "item-1", returned_at: null, university_id: "uni-1" };
    const res = await submitPost(jsonReq({
      itemId: "item-1",
      studentName: "Sam Student",
      studentEmail: "sam@university.edu",
    }));
    expect(res.status).toBe(200);
    expect(h.state.claimInserts[0].find_request_id).toBeNull();
  });
});
