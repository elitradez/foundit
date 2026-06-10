import { describe, expect, it } from "vitest";
import { isShortQuery, mergeHybridCandidates } from "@/lib/search";

describe("isShortQuery", () => {
  it("treats 1-2 word queries as short", () => {
    expect(isShortQuery("keys")).toBe(true);
    expect(isShortQuery("  blue   bottle ")).toBe(true);
    expect(isShortQuery("blue water bottle")).toBe(false);
  });
});

describe("mergeHybridCandidates", () => {
  const vec = [
    { id: "v1", name: "Keys", similarity: 0.47 },
    { id: "v2", name: "Single key", similarity: 0.43 },
    { id: "both", name: "Key fob with keys", similarity: 0.39 },
  ];
  const lex = [
    { id: "both", name: "Key fob with keys", lex_score: 1.0 },
    { id: "l1", name: "Necklace, bracelet, and key", lex_score: 0.9 },
  ];

  it("unions without duplicates and keeps both scores", () => {
    const merged = mergeHybridCandidates("keys", vec, lex);
    expect(merged).toHaveLength(4);
    const both = merged.find((m) => m.id === "both");
    expect(both?.similarity).toBe(0.39);
    expect(both?.lexScore).toBe(1.0);
  });

  it("short queries order lexical-first; lexical-only items are never lost", () => {
    const merged = mergeHybridCandidates("keys", vec, lex);
    expect(merged.map((m) => m.id)).toEqual(["both", "l1", "v1", "v2"]);
  });

  it("longer queries order vector-first with lexical extras appended", () => {
    const merged = mergeHybridCandidates("black key fob thing", vec, lex);
    expect(merged.map((m) => m.id)).toEqual(["v1", "v2", "both", "l1"]);
  });

  it("works with an empty vector stage (embedding outage degradation)", () => {
    const merged = mergeHybridCandidates("keys", [], lex);
    expect(merged.map((m) => m.id)).toEqual(["both", "l1"]);
  });
});
