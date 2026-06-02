"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ItemPhoto } from "@/components/retrieve/ItemPhoto";
import { fetchStaffClaims, setClaimStatus } from "@/lib/retrieve/db";
import { categoryByKey } from "@/lib/retrieve/config";
import type { StaffClaim, StaffClaimStatus } from "@/lib/retrieve/types";
import { T } from "@/lib/retrieve/tokens";
import { RetrieveStateNote, RetrieveSpinner } from "@/components/retrieve/StateViews";

type Filter = "open" | "resolved" | "all";

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function StaffClaims() {
  const [claims, setClaims] = useState<StaffClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setClaims(await fetchStaffClaims());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load claims");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => ({
    open: claims.filter((c) => c.status === "submitted").length,
    resolved: claims.filter((c) => c.status === "resolved").length,
    all: claims.length,
  }), [claims]);

  const filtered = useMemo(() => {
    if (filter === "all") return claims;
    if (filter === "resolved") return claims.filter((c) => c.status === "resolved");
    return claims.filter((c) => c.status === "submitted");
  }, [claims, filter]);

  async function changeStatus(id: string, status: StaffClaimStatus) {
    const prev = claims;
    setBusyId(id);
    // optimistic
    setClaims((cs) => cs.map((c) => (c.id === id ? { ...c, status } : c)));
    try {
      await setClaimStatus(id, status);
    } catch (e) {
      setClaims(prev);
      setError(e instanceof Error ? e.message : "Could not update claim");
    } finally {
      setBusyId(null);
    }
  }

  const tabs: { key: Filter; label: string }[] = [
    { key: "open", label: `Open (${counts.open})` },
    { key: "resolved", label: `Resolved (${counts.resolved})` },
    { key: "all", label: `All (${counts.all})` },
  ];

  return (
    <>
      <div role="tablist" aria-label="Filter claims" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
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

      {error ? (
        <RetrieveStateNote kind="error" detail={error} />
      ) : loading && claims.length === 0 ? (
        <RetrieveSpinner label="Loading claims…" />
      ) : filtered.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map((claim) => (
            <li key={claim.id}>
              <ClaimCard claim={claim} busy={busyId === claim.id} onStatus={changeStatus} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ClaimCard({
  claim,
  busy,
  onStatus,
}: {
  claim: StaffClaim;
  busy: boolean;
  onStatus: (id: string, status: StaffClaimStatus) => void;
}) {
  const cat = categoryByKey(claim.itemCategory);
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start", backgroundColor: T.background, border: `1px solid ${T.border}`, borderRadius: 16, padding: 12, boxShadow: T.cardShadow }}>
      <div style={{ width: 72, height: 72, flexShrink: 0, borderRadius: 12, overflow: "hidden", border: `1px solid ${T.border}` }}>
        {/* Staff view → reveal (sensitive photos allowed). */}
        <ItemPhoto category={claim.itemCategory} photo={claim.itemPhoto} aspectRatio="1 / 1" reveal />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <p style={{ margin: 0, fontFamily: T.fontDisplay, fontWeight: 600, fontSize: 16, color: T.foreground }}>{claim.itemName}</p>
          <ClaimBadge status={claim.status} />
        </div>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: T.mutedForeground }}>
          {cat.icon} {cat.label} · {claim.fulfillment === "ship" ? "Ship" : "Pickup"} · {formatDate(claim.createdAt)}
        </p>

        <p style={{ margin: "8px 0 0", fontSize: 14, color: T.foreground, lineHeight: 1.45 }}>{claim.description}</p>

        <p style={{ margin: "8px 0 0", fontSize: 13, color: T.mutedForeground }}>
          <strong style={{ color: T.foreground, fontWeight: 600 }}>Contact:</strong> {claim.contactName} · {claim.contactValue}
        </p>

        {claim.proofPhotos.length > 0 ? (
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {claim.proofPhotos.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noreferrer" style={{ display: "block", width: 48, height: 48, borderRadius: 8, overflow: "hidden", border: `1px solid ${T.border}` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Proof photo ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              </a>
            ))}
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
        {claim.status === "submitted" ? (
          <ActionButton label={busy ? "…" : "Mark picked up"} tone="ok" disabled={busy} onClick={() => onStatus(claim.id, "resolved")} />
        ) : (
          <ActionButton label={busy ? "…" : "Reopen"} tone="muted" disabled={busy} onClick={() => onStatus(claim.id, "submitted")} />
        )}
      </div>
    </div>
  );
}

function ActionButton({ label, tone, disabled, onClick }: { label: string; tone: "ok" | "muted"; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: T.fontBody,
        fontSize: 13,
        fontWeight: 600,
        padding: "8px 12px",
        borderRadius: 10,
        border: `1px solid ${T.border}`,
        backgroundColor: T.background,
        color: tone === "ok" ? "#1B7A3D" : T.mutedForeground,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

function ClaimBadge({ status }: { status: StaffClaimStatus }) {
  const map = {
    submitted: { bg: "#FFF1E8", fg: "#B23F08", label: "New" },
    resolved: { bg: "#E8F6EC", fg: "#1B7A3D", label: "Resolved" },
  } as const;
  const s = map[status];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, backgroundColor: s.bg, color: s.fg, fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999 }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: s.fg }} />
      {s.label}
    </span>
  );
}

function EmptyState({ filter }: { filter: Filter }) {
  return (
    <div style={{ textAlign: "center", padding: "64px 24px", color: T.mutedForeground }}>
      <p style={{ fontSize: 40, margin: "0 0 12px" }}>📨</p>
      <p style={{ fontSize: 15, margin: 0 }}>
        {filter === "resolved" ? "No resolved claims yet." : filter === "open" ? "No open claims — you're all caught up." : "No claims yet."}
      </p>
    </div>
  );
}
