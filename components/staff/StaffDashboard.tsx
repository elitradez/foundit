"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { LogItemForm } from "@/components/staff/LogItemForm";
import type { ItemRow } from "@/lib/types";

type Tab = "active" | "claims" | "log" | "surplus";

type SurplusItemRow = {
  id: string;
  name: string;
  location: string;
  date_found: string;
  sent_to_surplus_at: string;
};

type PendingClaim = {
  id: string;
  item_id: string;
  item_name: string;
  date_found: string | null;
  student_name: string | null;
  student_id_number: string | null;
  claim_description: string | null;
  committed_description: string | null;
  committed_at: string | null;
  created_at: string;
};

type StudentLogRow = {
  kind: "returned" | "claimed";
  item_id: string;
  item_name: string;
  student_name: string | null;
  student_id_number: string | null;
  phone_number?: string | null;
  date: string;
  status: "Returned" | "Claimed";
  claim_id?: string;
};

function daysSince(dateString: string): number {
  const then = new Date(`${dateString}T00:00:00`).getTime();
  const now = Date.now();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

function SurplusBadge({ daysUntilEligible, isEligible }: { daysUntilEligible: number; isEligible: boolean }) {
  let bg: string, color: string, label: string;
  if (isEligible) {
    bg = "#FEE2E2"; color = "#991B1B"; label = "Eligible for surplus";
  } else if (daysUntilEligible <= 7) {
    bg = "#FEE2E2"; color = "#991B1B"; label = `Surplus in ${daysUntilEligible}d`;
  } else if (daysUntilEligible <= 20) {
    bg = "#FFEDD5"; color = "#9A3412"; label = `Surplus in ${daysUntilEligible}d`;
  } else {
    bg = "#FEF3C7"; color = "#92400E"; label = `Surplus in ${daysUntilEligible}d`;
  }
  return (
    <span style={{ backgroundColor: bg, color, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

function StaffDashboardItemPhoto({
  photoUrl,
  sizes,
  className,
}: {
  photoUrl: string;
  sizes: string;
  className: string;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={`relative shrink-0 overflow-hidden border border-[#E5E5E5] ${className}`}>
      {!loaded ? (
        <div className="pointer-events-none absolute inset-0 animate-pulse bg-[#F5F5F5]" aria-hidden />
      ) : null}
      <Image
        src={photoUrl}
        alt=""
        fill
        className={`relative z-10 object-cover transition-opacity duration-200 ${loaded ? "opacity-100" : "opacity-0"}`}
        sizes={sizes}
        unoptimized
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
      />
    </div>
  );
}

async function compressImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new window.Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not load image"));
    el.src = dataUrl;
  });

  const maxSide = 800;
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
  if (!blob) return file;

  const stem = file.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${stem || "photo"}.jpg`, { type: "image/jpeg" });
}

// ── Shared modal styles ──────────────────────────────────────────────────────
const MODAL_INPUT =
  "w-full rounded-lg border border-[#E5E5E5] bg-white px-3 py-2 text-base text-[#1a1a1a] outline-none focus:border-[#CC0000] focus:ring-2 focus:ring-[#CC0000]/20";
const MODAL_LABEL = "text-sm font-medium text-[#555555]";
const MODAL_BTN_CANCEL =
  "inline-flex min-h-11 items-center rounded-lg border border-[#E5E5E5] bg-white px-4 py-2 text-sm text-[#555555] hover:bg-[#F5F5F5]";
const MODAL_BTN_PRIMARY =
  "inline-flex min-h-11 items-center rounded-lg bg-[#CC0000] px-5 py-2 text-sm font-semibold text-white hover:bg-[#A80000] disabled:opacity-50";
const MODAL_BTN_DANGER =
  "inline-flex min-h-11 items-center rounded-lg bg-[#CC0000] px-4 py-2 text-sm font-semibold text-white hover:bg-[#A80000] disabled:opacity-50";

export function StaffDashboard({
  departmentName = "Lost & Found",
  universityName,
}: {
  departmentName?: string;
  universityName?: string;
}) {
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("active");
  const [claims, setClaims] = useState<PendingClaim[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [claimsError, setClaimsError] = useState<string | null>(null);
  const [claimsLoaded, setClaimsLoaded] = useState(false);
  const [logRows, setLogRows] = useState<StudentLogRow[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [logLoaded, setLogLoaded] = useState(false);
  const [surplusItems, setSurplusItems] = useState<SurplusItemRow[]>([]);
  const [surplusLoading, setSurplusLoading] = useState(false);
  const [surplusError, setSurplusError] = useState<string | null>(null);
  const [surplusLoaded, setSurplusLoaded] = useState(false);
  const [editReturnedItemId, setEditReturnedItemId] = useState<string | null>(null);
  const [editStudentName, setEditStudentName] = useState("");
  const [editStudentIdNumber, setEditStudentIdNumber] = useState("");

  const [returnClaimId, setReturnClaimId] = useState<string | null>(null);
  const [returnClaimItemId, setReturnClaimItemId] = useState<string | null>(null);
  const [returnClaimItemName, setReturnClaimItemName] = useState<string>("");
  const [returnStudentName, setReturnStudentName] = useState("");
  const [returnStudentIdNumber, setReturnStudentIdNumber] = useState("");
  const [returnPhoneNumber, setReturnPhoneNumber] = useState("");

  const [editActiveItem, setEditActiveItem] = useState<ItemRow | null>(null);
  const [editActiveName, setEditActiveName] = useState("");
  const [editActiveDescription, setEditActiveDescription] = useState("");
  const [editActiveLocation, setEditActiveLocation] = useState("");
  const [editActiveDateFound, setEditActiveDateFound] = useState("");
  const [editActivePhotoFile, setEditActivePhotoFile] = useState<File | null>(null);
  const [editActivePhotoPreview, setEditActivePhotoPreview] = useState<string | null>(null);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<ItemRow | null>(null);
  const [activeSurplusConfirmItem, setActiveSurplusConfirmItem] = useState<ItemRow | null>(null);
  const [deleteLogRow, setDeleteLogRow] = useState<StudentLogRow | null>(null);

  useEffect(() => {
    if (!editActivePhotoFile) {
      setEditActivePhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(editActivePhotoFile);
    setEditActivePhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [editActivePhotoFile]);

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/staff/items");
      const data = (await res.json().catch(() => ({}))) as { items?: ItemRow[]; error?: string };
      if (!res.ok) {
        setLoadError(data.error ?? "Could not load items");
        return;
      }
      setItems(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeItems = useMemo(() => items, [items]);

  const loadClaims = useCallback(async () => {
    setClaimsLoading(true);
    setClaimsError(null);
    try {
      const res = await fetch("/api/staff/claims/pending");
      const data = (await res.json().catch(() => ({}))) as { claims?: PendingClaim[]; error?: string };
      if (!res.ok) {
        setClaimsError(data.error ?? "Could not load claims");
        return;
      }
      setClaims(data.claims ?? []);
      setClaimsLoaded(true);
    } finally {
      setClaimsLoading(false);
    }
  }, []);

  const loadStudentLog = useCallback(async () => {
    setLogLoading(true);
    setLogError(null);
    try {
      const res = await fetch("/api/staff/student-log");
      const data = (await res.json().catch(() => ({}))) as { rows?: StudentLogRow[]; error?: string };
      if (!res.ok) {
        setLogError(data.error ?? "Could not load student log");
        return;
      }
      setLogRows(data.rows ?? []);
      setLogLoaded(true);
    } finally {
      setLogLoading(false);
    }
  }, []);

  const loadSurplus = useCallback(async () => {
    setSurplusLoading(true);
    setSurplusError(null);
    try {
      const res = await fetch("/api/staff/surplus");
      const data = (await res.json().catch(() => ({}))) as { items?: SurplusItemRow[]; error?: string };
      if (!res.ok) {
        setSurplusError(data.error ?? "Could not load surplus items");
        return;
      }
      setSurplusItems(data.items ?? []);
      setSurplusLoaded(true);
    } finally {
      setSurplusLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "claims" && !claimsLoaded) void loadClaims();
    if (tab === "log" && !logLoaded) void loadStudentLog();
    if (tab === "surplus" && !surplusLoaded) void loadSurplus();
  }, [tab, claimsLoaded, logLoaded, surplusLoaded, loadClaims, loadStudentLog, loadSurplus]);

  function openEditActiveItem(item: ItemRow) {
    setEditActiveItem(item);
    setEditActiveName(item.name);
    setEditActiveDescription(item.description);
    setEditActiveLocation(item.location);
    setEditActiveDateFound(item.date_found);
    setEditActivePhotoFile(null);
  }

  function closeEditActiveItem() {
    setEditActiveItem(null);
    setEditActivePhotoFile(null);
  }

  async function confirmDeleteActiveItem() {
    if (!deleteConfirmItem) return;
    const id = deleteConfirmItem.id;
    setBusyId(id);
    try {
      const res = await fetch(`/api/staff/items/${id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        alert(data.error ?? "Could not delete item");
        return;
      }
      setDeleteConfirmItem(null);
      await load();
      await loadClaims();
      await loadSurplus();
    } finally {
      setBusyId(null);
    }
  }

  async function saveActiveItem() {
    if (!editActiveItem) return;
    const id = editActiveItem.id;
    const name = editActiveName.trim();
    const description = editActiveDescription.trim();
    const location = editActiveLocation.trim();
    const date_found = editActiveDateFound.trim();
    if (!name || !description || !location || !date_found) {
      alert("Please fill in name, description, location, and date found.");
      return;
    }

    setBusyId(id);
    try {
      let res: Response;
      if (editActivePhotoFile) {
        const optimizedPhoto = await compressImageForUpload(editActivePhotoFile);
        const fd = new FormData();
        fd.set("name", name);
        fd.set("description", description);
        fd.set("location", location);
        fd.set("date_found", date_found);
        fd.set("photo", optimizedPhoto);
        res = await fetch(`/api/staff/items/${id}`, { method: "PATCH", body: fd });
      } else {
        res = await fetch(`/api/staff/items/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description, location, date_found }),
        });
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        alert(data.error ?? "Could not save changes");
        return;
      }
      closeEditActiveItem();
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function confirmSendActiveItemToSurplus() {
    if (!activeSurplusConfirmItem) return;
    const id = activeSurplusConfirmItem.id;
    setBusyId(id);
    try {
      const res = await fetch(`/api/staff/items/${id}/surplus`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        alert(data.error ?? "Failed to send item to surplus");
        return;
      }
      setActiveSurplusConfirmItem(null);
      await load();
      await loadSurplus();
    } finally {
      setBusyId(null);
    }
  }

  function openReturnClaimModal(c: PendingClaim) {
    setReturnClaimId(c.id);
    setReturnClaimItemId(c.item_id);
    setReturnClaimItemName(c.item_name);
    setReturnStudentName(c.student_name ?? "");
    setReturnStudentIdNumber(c.student_id_number ?? "");
    setReturnPhoneNumber("");
  }

  function closeReturnClaimModal() {
    setReturnClaimId(null);
    setReturnClaimItemId(null);
    setReturnClaimItemName("");
    setReturnStudentName("");
    setReturnStudentIdNumber("");
    setReturnPhoneNumber("");
  }

  async function confirmReturnClaim() {
    if (!returnClaimId || !returnClaimItemId) return;
    const name = returnStudentName.trim();
    if (!name) {
      alert("Student name is required");
      return;
    }
    const studentId = returnStudentIdNumber.trim();
    const phone = returnPhoneNumber.trim();
    if (!studentId && !phone) {
      alert("Enter a Student ID or phone number.");
      return;
    }

    setBusyId(returnClaimId);
    try {
      const res = await fetch("/api/staff/claims/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claimId: returnClaimId,
          action: "returned",
          studentName: name,
          studentIdNumber: studentId || null,
          phoneNumber: phone || null,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        alert(j.error ?? "Failed to mark returned");
        return;
      }
      closeReturnClaimModal();
      await load();
      await loadClaims();
      await loadStudentLog();
    } finally {
      setBusyId(null);
    }
  }

  async function resolveClaim(claimId: string, action: "surplus") {
    setBusyId(claimId);
    try {
      const res = await fetch("/api/staff/claims/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimId, action }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        alert(j.error ?? "Failed to update claim");
        return;
      }
      await load();
      await loadClaims();
      await loadSurplus();
    } finally {
      setBusyId(null);
    }
  }

  async function relist(row: StudentLogRow) {
    setBusyId(row.kind === "claimed" ? row.claim_id ?? row.item_id : row.item_id);
    try {
      const res = await fetch("/api/staff/relist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: row.kind, itemId: row.item_id, claimId: row.claim_id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        alert(data.error ?? "Failed to relist");
        return;
      }
      await load();
      await loadStudentLog();
      await loadSurplus();
      if (tab === "claims") await loadClaims();
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDeleteLogRow() {
    if (!deleteLogRow) return;
    const id = deleteLogRow.item_id;
    setBusyId(id);
    try {
      const res = await fetch(`/api/staff/items/${id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        alert(data.error ?? "Failed to delete item");
        return;
      }
      setDeleteLogRow(null);
      await load();
      await loadStudentLog();
      await loadClaims();
      await loadSurplus();
    } finally {
      setBusyId(null);
    }
  }

  function openEditStudentInfo(row: StudentLogRow) {
    if (row.kind !== "returned") return;
    setEditReturnedItemId(row.item_id);
    setEditStudentName(row.student_name ?? "");
    setEditStudentIdNumber(row.student_id_number ?? "");
  }

  async function saveStudentInfo() {
    if (!editReturnedItemId) return;
    setBusyId(editReturnedItemId);
    try {
      const res = await fetch(`/api/staff/items/${editReturnedItemId}/return-info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentName: editStudentName || null,
          studentIdNumber: editStudentIdNumber || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        alert(data.error ?? "Failed to save student info");
        return;
      }
      setEditReturnedItemId(null);
      await loadStudentLog();
    } finally {
      setBusyId(null);
    }
  }

  // ── Modal focus traps ────────────────────────────────────────────────────────
  const deleteConfirmRef = useFocusTrap<HTMLDivElement>(!!deleteConfirmItem, () => setDeleteConfirmItem(null));
  const surplusConfirmRef = useFocusTrap<HTMLDivElement>(!!activeSurplusConfirmItem, () => setActiveSurplusConfirmItem(null));
  const deleteLogRef = useFocusTrap<HTMLDivElement>(!!deleteLogRow, () => setDeleteLogRow(null));
  const editActiveRef = useFocusTrap<HTMLDivElement>(!!editActiveItem, closeEditActiveItem);
  const editStudentRef = useFocusTrap<HTMLDivElement>(!!editReturnedItemId, () => setEditReturnedItemId(null));
  const returnClaimRef = useFocusTrap<HTMLDivElement>(!!(returnClaimId && returnClaimItemId), closeReturnClaimModal);

  // ── Tab button ───────────────────────────────────────────────────────────────
  function TabButton({ id, label }: { id: Tab; label: string }) {
    const active = tab === id;
    return (
      <button
        type="button"
        role="tab"
        aria-selected={active}
        onClick={() => setTab(id)}
        className={`flex flex-1 min-h-10 items-center justify-center rounded px-3 py-2 text-sm font-medium transition ${
          active
            ? "bg-[#CC0000] text-white"
            : "text-white/75 hover:bg-white/10 hover:text-white"
        }`}
      >
        {label}
      </button>
    );
  }

  // ── Skeletons ────────────────────────────────────────────────────────────────
  function ActiveItemsSkeleton() {
    return (
      <ul className="divide-y divide-[#E5E5E5] border border-[#E5E5E5] rounded-lg">
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={`active-skel-${i}`} className={`flex items-center gap-4 px-4 py-4 ${i % 2 === 1 ? "bg-[#F5F5F5]" : "bg-white"}`}>
            <div className="h-20 w-20 shrink-0 animate-pulse rounded-lg bg-[#E5E5E5]" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 animate-pulse rounded bg-[#E5E5E5]" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-[#E5E5E5]" />
              <div className="h-3 w-1/4 animate-pulse rounded bg-[#E5E5E5]" />
            </div>
            <div className="space-y-2 text-right">
              <div className="h-3 w-20 animate-pulse rounded bg-[#E5E5E5]" />
              <div className="h-5 w-28 animate-pulse rounded bg-[#E5E5E5]" />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  function TableSkeleton({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
    return (
      <div className="overflow-x-auto rounded-lg border border-[#E5E5E5]">
        <table className="w-full text-left text-sm">
          <tbody className="divide-y divide-[#E5E5E5]">
            {Array.from({ length: rows }).map((_, r) => (
              <tr key={`tbl-skel-${r}`} className={r % 2 === 1 ? "bg-[#F5F5F5]" : "bg-white"}>
                {Array.from({ length: cols }).map((__, c) => (
                  <td key={`tbl-skel-${r}-${c}`} className="px-4 py-3">
                    <div className="h-4 w-full animate-pulse rounded bg-[#E5E5E5]" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white text-[#1a1a1a]">

      {/* Dark header */}
      <header className="sticky top-0 z-20 bg-[#111111]" style={{ borderBottom: "1px solid #2a2a2a" }}>
        {/* Row 1: title + primary action */}
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#FF6666]">Staff</p>
            <h1 className="text-lg font-semibold text-white leading-tight">{departmentName}</h1>
            {universityName ? (
              <p className="text-xs text-white/70 mt-0.5">{universityName}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex min-h-9 items-center rounded bg-[#CC0000] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#A80000] transition"
          >
            Log new item
          </button>
        </div>
        {/* Row 2: tab bar */}
        <div className="border-t border-white/10 px-4">
          <div role="tablist" aria-label="Dashboard sections" className="mx-auto flex max-w-6xl">
            <TabButton id="active" label="Active Items" />
            <TabButton id="claims" label="Claims" />
            <TabButton id="log" label="Student Log" />
            <TabButton id="surplus" label="Surplus" />
          </div>
        </div>
        {/* Row 3: secondary actions */}
        <div className="border-t border-white/10 px-4 py-1.5">
          <div className="mx-auto flex max-w-6xl items-center gap-2">
            <a
              href="/staff/analytics"
              className="inline-flex min-h-8 items-center rounded border border-white/20 px-3 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white transition"
            >
              Analytics
            </a>
            <button
              type="button"
              onClick={async () => {
                await fetch("/api/staff/logout", { method: "POST" });
                window.location.href = "/staff/login";
              }}
              className="inline-flex min-h-8 items-center rounded border border-white/20 px-3 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white transition"
            >
              Switch Department
            </button>
            <button
              type="button"
              aria-label="Sign out"
              onClick={async () => {
                await fetch("/api/staff/logout", { method: "POST" });
                window.location.href = "/staff/login";
              }}
              className="ml-auto inline-flex min-h-8 items-center rounded border border-red-500/40 px-3 py-1 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300 transition"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Return to student view */}
      <div className="border-b border-[#E5E5E5] bg-white px-4 py-2">
        <div className="mx-auto max-w-6xl">
          <Link
            href="/"
            className="text-xs font-medium text-[#CC0000] hover:underline"
          >
            ← Return to student view
          </Link>
        </div>
      </div>

      {/* Content */}
      <main id="main-content" className="mx-auto max-w-6xl px-4 py-6">
        {loadError ? (
          <p className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p>
        ) : null}

        {/* ── Active Items ── */}
        {tab === "active" ? (
          <>
            {loading ? <ActiveItemsSkeleton /> : null}

            {!loading && activeItems.length === 0 ? (
              <div className="rounded-lg border border-[#E5E5E5] px-6 py-16 text-center text-[#666666]">
                No active items.
              </div>
            ) : null}

            {!loading && activeItems.length > 0 ? (
              <ul className="overflow-hidden rounded-lg border border-[#E5E5E5]">
                {activeItems.map((item, idx) => {
                  const daysOld = daysSince(item.date_found);
                  const daysUntilEligible = Math.max(0, Math.min(30, 30 - daysOld));
                  const isEligible = daysOld >= 30;
                  return (
                    <li
                      key={item.id}
                      className={`flex items-center gap-4 px-4 py-4 ${idx % 2 === 1 ? "bg-[#F5F5F5]" : "bg-white"}`}
                      style={{ borderTop: idx === 0 ? "none" : "1px solid #E5E5E5" }}
                    >
                      <StaffDashboardItemPhoto
                        photoUrl={`/api/staff/items/${item.id}/photo`}
                        sizes="80px"
                        className="h-20 w-20 rounded-lg"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold text-[#1a1a1a]">{item.name}</p>
                        <p className="mt-0.5 truncate text-sm text-[#666666]">{item.description}</p>
                        <p className="mt-0.5 text-xs text-[#666666]">{item.location}</p>
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditActiveItem(item)}
                            aria-label={`Edit details for ${item.name}`}
                            className="inline-flex min-h-8 items-center rounded border border-[#E5E5E5] bg-white px-3 py-1 text-xs font-medium text-[#333333] hover:bg-[#F5F5F5] transition"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={!isEligible || busyId === item.id}
                            onClick={() => setActiveSurplusConfirmItem(item)}
                            aria-label={isEligible ? `Send ${item.name} to surplus` : `${item.name} surplus eligible in ${daysUntilEligible} days`}
                            className="inline-flex min-h-8 items-center rounded border border-[#E5E5E5] bg-white px-3 py-1 text-xs font-medium text-[#333333] hover:bg-[#F5F5F5] disabled:cursor-not-allowed disabled:opacity-40 transition"
                          >
                            Send to Surplus
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmItem(item)}
                            aria-label={`Delete ${item.name}`}
                            className="inline-flex min-h-8 items-center rounded px-2 py-1 text-xs font-medium text-[#CC0000] hover:underline"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      <div className="shrink-0 text-right space-y-1.5">
                        <p className="text-xs text-[#666666]">Found {item.date_found}</p>
                        <SurplusBadge daysUntilEligible={daysUntilEligible} isEligible={isEligible} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </>
        ) : null}

        {/* ── Claims ── */}
        {tab === "claims" ? (
          <>
            {claimsError ? (
              <p className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{claimsError}</p>
            ) : null}
            {claimsLoading ? <TableSkeleton rows={6} cols={6} /> : null}

            {!claimsLoading ? (
              <div className="overflow-x-auto rounded-lg border border-[#E5E5E5]">
                <table className="w-full min-w-[1040px] text-left text-sm">
                  <thead style={{ borderBottom: "1px solid #E5E5E5", backgroundColor: "#F5F5F5" }}>
                    <tr>
                      <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#666666]">Photo</th>
                      <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#666666]">Item</th>
                      <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#666666]">Student name</th>
                      <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#666666]">Student ID</th>
                      <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#666666]">Their description</th>
                      <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#666666]">Date submitted</th>
                      <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E5E5]">
                    {claims.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center text-[#666666]">
                          No pending claims.
                        </td>
                      </tr>
                    ) : null}
                    {claims.map((c, idx) => {
                      const daysOld = c.date_found ? daysSince(c.date_found) : 0;
                      const daysUntilEligible = Math.max(0, Math.min(30, 30 - daysOld));
                      const canSendToSurplus = c.date_found ? daysOld >= 30 : false;
                      return (
                        <tr key={c.id} className={idx % 2 === 1 ? "bg-[#F5F5F5]" : "bg-white"}>
                          <td className="px-4 py-3">
                            <StaffDashboardItemPhoto
                              photoUrl={`/api/staff/items/${c.item_id}/photo`}
                              sizes="48px"
                              className="h-12 w-12 rounded-lg"
                            />
                          </td>
                          <td className="px-4 py-3 font-semibold text-[#1a1a1a]">{c.item_name}</td>
                          <td className="px-4 py-3 text-[#333333]">
                            {c.student_name?.trim() ? c.student_name : <span className="text-[#666666]">Not provided</span>}
                          </td>
                          <td className="px-4 py-3 text-[#333333]">
                            {c.student_id_number?.trim() ? c.student_id_number : <span className="text-[#666666]">Not provided</span>}
                          </td>
                          <td className="px-4 py-3">
                            {c.committed_description?.trim() ? (
                              <div className="max-w-[280px]">
                                <p className="max-h-20 overflow-y-auto whitespace-pre-wrap text-xs text-[#333333]">{c.committed_description}</p>
                                <p className="mt-1 text-[11px] text-[#666666]" title="Written before the student saw any photos">
                                  Committed {c.committed_at ? new Date(c.committed_at).toLocaleString() : "before viewing"} — pre-photo
                                </p>
                              </div>
                            ) : c.claim_description?.trim() ? (
                              <p className="max-h-20 max-w-[280px] overflow-y-auto whitespace-pre-wrap text-xs text-[#333333]">{c.claim_description}</p>
                            ) : (
                              <span className="text-xs text-[#666666]">Not provided</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-[#666666]">{c.created_at.slice(0, 10)}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={busyId === c.id}
                                onClick={() => openReturnClaimModal(c)}
                                aria-label={`Mark ${c.item_name} as returned`}
                                className="inline-flex min-h-9 items-center rounded bg-[#CC0000] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#A80000] disabled:opacity-50 transition"
                              >
                                Mark as Returned
                              </button>
                              <button
                                type="button"
                                disabled={!canSendToSurplus || busyId === c.id}
                                onClick={() => void resolveClaim(c.id, "surplus")}
                                aria-label={canSendToSurplus ? `Send ${c.item_name} to surplus` : `${c.item_name} surplus eligible in ${daysUntilEligible} days`}
                                className="inline-flex min-h-9 items-center rounded border border-[#E5E5E5] bg-white px-3 py-1.5 text-xs font-semibold text-[#333333] hover:bg-[#F5F5F5] disabled:cursor-not-allowed disabled:opacity-40 transition"
                              >
                                {canSendToSurplus ? "Send to Surplus" : `Surplus in ${daysUntilEligible}d`}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        ) : null}

        {/* ── Surplus ── */}
        {tab === "surplus" ? (
          <>
            {surplusError ? (
              <p className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{surplusError}</p>
            ) : null}
            {surplusLoading ? <TableSkeleton rows={6} cols={5} /> : null}
            {!surplusLoading ? (
              <div className="overflow-x-auto rounded-lg border border-[#E5E5E5]">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead style={{ borderBottom: "1px solid #E5E5E5", backgroundColor: "#F5F5F5" }}>
                    <tr>
                      <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#666666]">Photo</th>
                      <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#666666]">Item</th>
                      <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#666666]">Location</th>
                      <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#666666]">Date found</th>
                      <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#666666]">Sent to surplus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E5E5]">
                    {surplusItems.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-[#666666]">
                          No items in surplus yet.
                        </td>
                      </tr>
                    ) : null}
                    {surplusItems.map((s, idx) => {
                      const sent = new Date(s.sent_to_surplus_at).getTime();
                      const daysInSurplus = Number.isFinite(sent)
                        ? Math.max(0, Math.floor((Date.now() - sent) / (1000 * 60 * 60 * 24)))
                        : null;
                      return (
                        <tr key={s.id} className={idx % 2 === 1 ? "bg-[#F5F5F5]" : "bg-white"}>
                          <td className="px-4 py-3">
                            <div className="relative h-12 w-12 overflow-hidden rounded-lg border border-[#E5E5E5]">
                              <Image src={`/api/staff/items/${s.id}/photo`} alt="" fill className="object-cover" sizes="48px" unoptimized loading="lazy" />
                            </div>
                          </td>
                          <td className="px-4 py-3 font-semibold text-[#1a1a1a]">{s.name}</td>
                          <td className="px-4 py-3 text-[#555555]">{s.location}</td>
                          <td className="px-4 py-3 text-[#666666]">{s.date_found}</td>
                          <td className="px-4 py-3 text-[#666666]">
                            <span>{s.sent_to_surplus_at.slice(0, 10)}</span>
                            {daysInSurplus !== null ? (
                              <span className="ml-2 text-xs text-[#666666]">({daysInSurplus}d in surplus)</span>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        ) : null}

        {/* ── Student Log ── */}
        {tab === "log" ? (
          <>
            {logError ? (
              <p className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{logError}</p>
            ) : null}
            {logLoading ? <TableSkeleton rows={6} cols={7} /> : null}
            {!logLoading ? (
              <div className="overflow-x-auto rounded-lg border border-[#E5E5E5]">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead style={{ borderBottom: "1px solid #E5E5E5", backgroundColor: "#F5F5F5" }}>
                    <tr>
                      <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#666666]">Item name</th>
                      <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#666666]">Name</th>
                      <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#666666]">Student ID</th>
                      <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#666666]">Phone number</th>
                      <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#666666]">Date</th>
                      <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#666666]">Status</th>
                      <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E5E5]">
                    {logRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center text-[#666666]">
                          No returned or claimed items.
                        </td>
                      </tr>
                    ) : null}
                    {logRows.map((r, idx) => (
                      <tr key={`${r.kind}-${r.claim_id ?? r.item_id}`} className={idx % 2 === 1 ? "bg-[#F5F5F5]" : "bg-white"}>
                        <td className="px-4 py-3 font-semibold text-[#1a1a1a]">{r.item_name}</td>
                        <td className="px-4 py-3 text-[#333333]">
                          {r.student_name?.trim() ? r.student_name : <span className="text-[#666666]">Not provided</span>}
                        </td>
                        <td className="px-4 py-3 text-[#333333]">
                          {r.student_id_number?.trim() ? r.student_id_number : <span className="text-[#666666]">Not provided</span>}
                        </td>
                        <td className="px-4 py-3 text-[#333333]">
                          {r.phone_number?.trim() ? r.phone_number : <span className="text-[#666666]">Not provided</span>}
                        </td>
                        <td className="px-4 py-3 text-[#666666]">{r.date}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
                            r.status === "Returned"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-blue-100 text-blue-800"
                          }`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            {r.kind === "returned" ? (
                              <button
                                type="button"
                                disabled={busyId === r.item_id}
                                onClick={() => openEditStudentInfo(r)}
                                aria-label={`Add or edit student info for ${r.item_name}`}
                                className="inline-flex min-h-8 items-center rounded border border-[#E5E5E5] bg-white px-3 py-1 text-xs font-medium text-[#333333] hover:bg-[#F5F5F5] disabled:opacity-50 transition"
                              >
                                Edit student info
                              </button>
                            ) : null}
                            <button
                              type="button"
                              disabled={busyId === (r.kind === "claimed" ? r.claim_id ?? r.item_id : r.item_id)}
                              onClick={() => void relist(r)}
                              aria-label={`Relist ${r.item_name}`}
                              className="inline-flex min-h-8 items-center rounded border border-[#E5E5E5] bg-white px-3 py-1 text-xs font-medium text-[#333333] hover:bg-[#F5F5F5] disabled:opacity-50 transition"
                            >
                              Relist
                            </button>
                            <button
                              type="button"
                              disabled={busyId === r.item_id}
                              onClick={() => setDeleteLogRow(r)}
                              aria-label={`Delete log entry for ${r.item_name}`}
                              className="inline-flex min-h-8 items-center rounded px-2 py-1 text-xs font-medium text-[#CC0000] hover:underline disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        ) : null}
      </main>

      {showForm ? <LogItemForm onClose={() => setShowForm(false)} onSaved={() => void load()} /> : null}

      {/* ── Delete item confirm ── */}
      {deleteConfirmItem ? (
        <div className="anim-fade-in fixed inset-0 z-[88] flex items-center justify-center bg-black/60 p-4">
          <div ref={deleteConfirmRef} role="dialog" aria-modal="true" aria-labelledby="delete-item-title" className="anim-pop-in w-full max-w-sm rounded-lg border border-[#E5E5E5] bg-white p-5 shadow-2xl">
            <h3 id="delete-item-title" className="text-base font-semibold text-[#1a1a1a]">Delete item?</h3>
            <p className="mt-2 text-sm text-[#555555]">
              Remove <span className="font-semibold text-[#1a1a1a]">{deleteConfirmItem.name}</span> from lost and found. This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteConfirmItem(null)} className={MODAL_BTN_CANCEL}>Cancel</button>
              <button type="button" onClick={() => void confirmDeleteActiveItem()} disabled={busyId === deleteConfirmItem.id} className={MODAL_BTN_DANGER}>
                {busyId === deleteConfirmItem.id ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Send to surplus confirm ── */}
      {activeSurplusConfirmItem ? (
        <div className="anim-fade-in fixed inset-0 z-[89] flex items-center justify-center bg-black/60 p-4">
          <div ref={surplusConfirmRef} role="dialog" aria-modal="true" aria-labelledby="surplus-confirm-title" className="anim-pop-in w-full max-w-sm rounded-lg border border-[#E5E5E5] bg-white p-5 shadow-2xl">
            <h3 id="surplus-confirm-title" className="text-base font-semibold text-[#1a1a1a]">Send to surplus?</h3>
            <p className="mt-2 text-sm text-[#555555]">
              <span className="font-semibold text-[#1a1a1a]">{activeSurplusConfirmItem.name}</span> will be removed from the active list.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setActiveSurplusConfirmItem(null)} className={MODAL_BTN_CANCEL}>Cancel</button>
              <button type="button" onClick={() => void confirmSendActiveItemToSurplus()} disabled={busyId === activeSurplusConfirmItem.id} className={MODAL_BTN_PRIMARY}>
                {busyId === activeSurplusConfirmItem.id ? "Sending…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Delete log row confirm ── */}
      {deleteLogRow ? (
        <div className="anim-fade-in fixed inset-0 z-[89] flex items-center justify-center bg-black/60 p-4">
          <div ref={deleteLogRef} role="dialog" aria-modal="true" aria-labelledby="delete-log-title" className="anim-pop-in w-full max-w-sm rounded-lg border border-[#E5E5E5] bg-white p-5 shadow-2xl">
            <h3 id="delete-log-title" className="text-base font-semibold text-[#1a1a1a]">Delete this log entry?</h3>
            <p className="mt-2 text-sm text-[#555555]">
              This will permanently delete <span className="font-semibold text-[#1a1a1a]">{deleteLogRow.item_name}</span>.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteLogRow(null)} className={MODAL_BTN_CANCEL}>Cancel</button>
              <button type="button" onClick={() => void confirmDeleteLogRow()} disabled={busyId === deleteLogRow.item_id} className={MODAL_BTN_DANGER}>
                {busyId === deleteLogRow.item_id ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Edit active item ── */}
      {editActiveItem ? (
        <div className="anim-fade-in fixed inset-0 z-[85] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
          <div ref={editActiveRef} role="dialog" aria-modal="true" aria-labelledby="edit-item-title" className="anim-pop-in max-h-[95vh] w-full overflow-y-auto rounded-none border border-[#E5E5E5] bg-white p-5 shadow-2xl sm:max-h-[90vh] sm:max-w-lg sm:rounded-lg">
            <h3 id="edit-item-title" className="text-base font-semibold text-[#1a1a1a]">Edit item</h3>
            <p className="mt-1 text-sm text-[#666666]">Update how this listing appears for staff and on the student site.</p>

            <div className="mt-4 space-y-3">
              <div className="flex gap-4">
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-[#E5E5E5]">
                  <Image
                    src={editActivePhotoPreview ?? `/api/staff/items/${editActiveItem.id}/photo`}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="96px"
                    unoptimized
                    loading="lazy"
                  />
                </div>
                <label className="min-w-0 flex-1 cursor-pointer space-y-1">
                  <span className={MODAL_LABEL}>Replace photo (optional)</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={(e) => setEditActivePhotoFile(e.target.files?.[0] ?? null)}
                    className="w-full text-sm text-[#555555] file:mr-3 file:rounded file:border-0 file:bg-[#F5F5F5] file:px-3 file:py-1.5 file:text-sm file:text-[#333333] hover:file:bg-[#E5E5E5]"
                  />
                </label>
              </div>

              <label className="block space-y-1">
                <span className={MODAL_LABEL}>Name</span>
                <input value={editActiveName} onChange={(e) => setEditActiveName(e.target.value)} className={MODAL_INPUT} />
              </label>

              <label className="block space-y-1">
                <span className={MODAL_LABEL}>Description</span>
                <textarea value={editActiveDescription} onChange={(e) => setEditActiveDescription(e.target.value)} rows={4} className={`${MODAL_INPUT} resize-y`} />
              </label>

              <label className="block space-y-1">
                <span className={MODAL_LABEL}>Location found</span>
                <input value={editActiveLocation} onChange={(e) => setEditActiveLocation(e.target.value)} className={MODAL_INPUT} />
              </label>

              <label className="block space-y-1">
                <span className={MODAL_LABEL}>Date found</span>
                <input type="date" value={editActiveDateFound} onChange={(e) => setEditActiveDateFound(e.target.value)} className={MODAL_INPUT} />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={closeEditActiveItem} className={MODAL_BTN_CANCEL}>Cancel</button>
              <button type="button" onClick={() => void saveActiveItem()} disabled={busyId === editActiveItem.id} className={MODAL_BTN_PRIMARY}>
                {busyId === editActiveItem.id ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Edit student info (returned item) ── */}
      {editReturnedItemId ? (
        <div className="anim-fade-in fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4">
          <div ref={editStudentRef} role="dialog" aria-modal="true" aria-labelledby="edit-student-title" className="anim-pop-in w-full max-w-md rounded-lg border border-[#E5E5E5] bg-white p-5 shadow-2xl">
            <h3 id="edit-student-title" className="text-base font-semibold text-[#1a1a1a]">Returned item student info</h3>
            <p className="mt-2 text-sm text-[#666666]">This will appear in the Student Log.</p>

            <div className="mt-4 space-y-3">
              <label className="block space-y-1">
                <span className={MODAL_LABEL}>Student name</span>
                <input value={editStudentName} onChange={(e) => setEditStudentName(e.target.value)} className={MODAL_INPUT} />
              </label>
              <label className="block space-y-1">
                <span className={MODAL_LABEL}>Student ID</span>
                <input value={editStudentIdNumber} onChange={(e) => setEditStudentIdNumber(e.target.value)} className={MODAL_INPUT} />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setEditReturnedItemId(null)} className={MODAL_BTN_CANCEL}>Cancel</button>
              <button type="button" onClick={() => void saveStudentInfo()} disabled={busyId === editReturnedItemId} className={MODAL_BTN_PRIMARY}>
                {busyId === editReturnedItemId ? "…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Confirm return claim ── */}
      {returnClaimId && returnClaimItemId ? (
        <div className="anim-fade-in fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4">
          <div ref={returnClaimRef} role="dialog" aria-modal="true" aria-labelledby="confirm-return-title" className="anim-pop-in w-full max-w-md rounded-lg border border-[#E5E5E5] bg-white p-5 shadow-2xl">
            <h3 id="confirm-return-title" className="text-base font-semibold text-[#1a1a1a]">Confirm return</h3>
            <p className="mt-2 text-sm text-[#666666]">This will move the item into the Student Log.</p>

            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-[#E5E5E5] bg-[#F5F5F5] px-3 py-2 text-sm text-[#333333]">
                <span className="text-[#666666]">Item: </span>{returnClaimItemName}
              </div>

              <label className="block space-y-1">
                <span className={MODAL_LABEL}>Student name</span>
                <input value={returnStudentName} onChange={(e) => setReturnStudentName(e.target.value)} className={MODAL_INPUT} />
              </label>

              <label className="block space-y-1">
                <span className={MODAL_LABEL}>Student ID (optional)</span>
                <input value={returnStudentIdNumber} onChange={(e) => setReturnStudentIdNumber(e.target.value)} className={MODAL_INPUT} />
              </label>

              <label className="block space-y-1">
                <span className={MODAL_LABEL}>Phone number (optional)</span>
                <input value={returnPhoneNumber} onChange={(e) => setReturnPhoneNumber(e.target.value)} className={MODAL_INPUT} />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={closeReturnClaimModal} className={MODAL_BTN_CANCEL}>Cancel</button>
              <button type="button" onClick={() => void confirmReturnClaim()} disabled={busyId === returnClaimId} className={MODAL_BTN_PRIMARY}>
                {busyId === returnClaimId ? "…" : "Confirm Return"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
