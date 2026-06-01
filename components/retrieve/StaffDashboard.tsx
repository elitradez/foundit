"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ItemPhoto } from "@/components/retrieve/ItemPhoto";
import { StatusPill, TextInput } from "@/components/retrieve/ui";
import { setItemStatus, useRetrieveData } from "@/lib/retrieve/store";
import { categoryByKey } from "@/lib/retrieve/config";
import type { ItemStatus } from "@/lib/retrieve/types";
import { T } from "@/lib/retrieve/tokens";
import { RetrieveStateNote, RetrieveSpinner } from "@/components/retrieve/StateViews";

type Filter = "all" | ItemStatus;

export function StaffDashboard() {
  const { items, loading, error } = useRetrieveData();
  const [filter, setFilter] = useState<Filter>("active");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => ({
    all: items.length,
    active: items.filter((i) => i.status === "active").length,
    recovered: items.filter((i) => i.status === "recovered").length,
    disposed: items.filter((i) => i.status === "disposed").length,
  }), [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => (filter === "all" ? true : i.status === filter))
      .filter((i) => !q || `${i.name} ${i.location} ${i.notes} ${categoryByKey(i.category).label}`.toLowerCase().includes(q))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [items, filter, query]);

  const tabs: { key: Filter; label: string }[] = [
    { key: "active", label: `Active (${counts.active})` },
    { key: "recovered", label: `Recovered (${counts.recovered})` },
    { key: "disposed", label: `Disposed (${counts.disposed})` },
    { key: "all", label: `All (${counts.all})` },
  ];

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "24px 20px 64px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: T.fontDisplay, fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 4px" }}>Lost &amp; found</h1>
          <p style={{ color: T.mutedForeground, fontSize: 15, margin: 0 }}>{counts.active} active item{counts.active === 1 ? "" : "s"} waiting to be claimed.</p>
        </div>
        <Link href="/retrieve/staff/snap" style={{ textDecoration: "none", fontFamily: T.fontDisplay, fontWeight: 600, fontSize: 16, color: "#fff", backgroundColor: T.primaryStrong, padding: "12px 20px", borderRadius: 14, display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span aria-hidden style={{ fontSize: 18 }}>＋</span> Snap an item
        </Link>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 18, alignItems: "center" }}>
        <div role="tablist" aria-label="Filter by status" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {tabs.map((t) => {
            const active = filter === t.key;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => setFilter(t.key)}
                style={{
                  fontFamily: T.fontBody,
                  fontSize: 14,
                  fontWeight: 600,
                  padding: "8px 14px",
                  borderRadius: 999,
                  border: `1px solid ${active ? T.primaryStrong : T.border}`,
                  backgroundColor: active ? "#FFF1E8" : T.background,
                  color: active ? "#B23F08" : T.mutedForeground,
                  cursor: "pointer",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search items…" aria-label="Search items" type="search" />
        </div>
      </div>

      {/* List */}
      {error === "not-configured" ? (
        <RetrieveStateNote kind="config" />
      ) : error ? (
        <RetrieveStateNote kind="error" detail={error} />
      ) : loading && items.length === 0 ? (
        <RetrieveSpinner label="Loading items…" />
      ) : filtered.length === 0 ? (
        <EmptyState query={query} />
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map((item) => (
            <li key={item.id}>
              <div style={{ display: "flex", gap: 14, alignItems: "center", backgroundColor: T.background, border: `1px solid ${T.border}`, borderRadius: 16, padding: 12, boxShadow: T.cardShadow }}>
                <div style={{ width: 72, height: 72, flexShrink: 0, borderRadius: 12, overflow: "hidden", border: `1px solid ${T.border}` }}>
                  {/* Staff see clear photos (reveal) — they handle verification. */}
                  <ItemPhoto category={item.category} photo={item.photo} aspectRatio="1 / 1" reveal />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <p style={{ margin: 0, fontFamily: T.fontDisplay, fontWeight: 600, fontSize: 16, color: T.foreground }}>{item.name}</p>
                    <StatusPill status={item.status} />
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: T.mutedForeground }}>
                    {categoryByKey(item.category).icon} {categoryByKey(item.category).label} · {item.location} · Found {item.dateFound}
                  </p>
                  {item.notes ? <p style={{ margin: "4px 0 0", fontSize: 13, color: T.mutedForeground, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.notes}</p> : null}
                </div>
                <RowActions status={item.status} onSet={(s) => { void setItemStatus(item.id, s); }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RowActions({ status, onSet }: { status: ItemStatus; onSet: (s: ItemStatus) => void }) {
  const btn = (label: string, s: ItemStatus, tone: "ok" | "muted") => (
    <button
      type="button"
      onClick={() => onSet(s)}
      style={{
        fontFamily: T.fontBody,
        fontSize: 13,
        fontWeight: 600,
        padding: "8px 12px",
        borderRadius: 10,
        border: `1px solid ${T.border}`,
        backgroundColor: T.background,
        color: tone === "ok" ? "#1B7A3D" : T.mutedForeground,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
      {status === "active" ? (
        <>
          {btn("Mark recovered", "recovered", "ok")}
          {btn("Dispose", "disposed", "muted")}
        </>
      ) : (
        btn("Reactivate", "active", "muted")
      )}
    </div>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <div style={{ textAlign: "center", padding: "64px 24px", color: T.mutedForeground }}>
      <p style={{ fontSize: 40, margin: "0 0 12px" }}>🗂️</p>
      <p style={{ fontSize: 15, margin: 0 }}>{query.trim() ? "No items match your search." : "Nothing here yet."}</p>
    </div>
  );
}
