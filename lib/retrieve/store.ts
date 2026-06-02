"use client";

import { useEffect, useSyncExternalStore } from "react";
import { fetchItems, insertClaim, insertItem, updateItemStatus } from "@/lib/retrieve/db";
import { isRetrieveConfigured } from "@/lib/retrieve/supabase";
import type {
  ItemStatus,
  NewClaimInput,
  NewItemInput,
  RetrieveItem,
} from "@/lib/retrieve/types";

/**
 * Live store for the gym "Retrieve" tenant, backed by Supabase (retrieve-gym-dev).
 * Replaces the previous in-memory mock. Keeps a small client-side cache of items
 * that mirrors the DB; mutations write to Supabase then update the cache.
 */

type State = {
  items: RetrieveItem[];
  loading: boolean;
  error: string | null;
  loaded: boolean;
};

const EMPTY: State = { items: [], loading: false, error: null, loaded: false };
const SERVER: State = { items: [], loading: true, error: null, loaded: false };

let state: State = EMPTY;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}
function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  emit();
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const getSnapshot = () => state;
const getServerSnapshot = () => SERVER;

// ── Loading ────────────────────────────────────────────────────────────────

let loadPromise: Promise<void> | null = null;

export function ensureLoaded(): void {
  if (loadPromise || state.loaded) return;
  void refresh();
}

export async function refresh(): Promise<void> {
  if (!isRetrieveConfigured()) {
    set({ loading: false, error: "not-configured", loaded: true });
    return;
  }
  set({ loading: true, error: null });
  loadPromise = (async () => {
    try {
      const items = await fetchItems();
      set({ items, loading: false, loaded: true, error: null });
    } catch (e) {
      set({ loading: false, loaded: true, error: e instanceof Error ? e.message : "Failed to load items" });
    } finally {
      loadPromise = null;
    }
  })();
  return loadPromise;
}

/**
 * Background refresh used for revalidation (on focus / navigation / interval).
 * Unlike refresh() it never flips `loading` (so the list doesn't flash a spinner)
 * and keeps the current items on failure — a transient blip shouldn't blank the
 * page. Piggybacks on any in-flight load.
 */
export async function revalidate(): Promise<void> {
  if (loadPromise) return loadPromise;
  if (!isRetrieveConfigured()) return;
  loadPromise = (async () => {
    try {
      const items = await fetchItems();
      set({ items, loaded: true, error: null });
    } catch (e) {
      console.error("[retrieve/store] revalidate failed (keeping current items):", e instanceof Error ? e.message : e);
    } finally {
      loadPromise = null;
    }
  })();
  return loadPromise;
}

// ── Mutations (write to Supabase, then update cache) ────────────────────────

export async function addItem(
  input: NewItemInput,
): Promise<{ item: RetrieveItem; photoError?: string }> {
  const { item, photoError } = await insertItem(input);
  set({ items: [item, ...state.items] });
  return { item, photoError };
}

export async function setItemStatus(id: string, status: ItemStatus): Promise<void> {
  // optimistic
  const prev = state.items;
  set({ items: prev.map((i) => (i.id === id ? { ...i, status } : i)) });
  try {
    await updateItemStatus(id, status);
  } catch (e) {
    set({ items: prev, error: e instanceof Error ? e.message : "Update failed" });
    throw e;
  }
}

export async function addClaim(input: NewClaimInput): Promise<void> {
  await insertClaim(input);
}

export function getItemById(id: string): RetrieveItem | undefined {
  return state.items.find((i) => i.id === id);
}

// ── Revalidation (focus / visibility / interval) ───────────────────────────
// Keeps the member list fresh without a manual hard reload. Refcounted so that
// however many components mount the hook, there's a single set of listeners and
// one interval.

const REVALIDATE_INTERVAL_MS = 15_000;
let revalidators = 0;
let intervalId: ReturnType<typeof setInterval> | null = null;

function onFocus(): void {
  void revalidate();
}
function onVisibility(): void {
  if (document.visibilityState === "visible") void revalidate();
}

function startRevalidation(): void {
  revalidators += 1;
  if (revalidators !== 1 || typeof window === "undefined") return;
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisibility);
  intervalId = setInterval(() => {
    if (document.visibilityState === "visible") void revalidate();
  }, REVALIDATE_INTERVAL_MS);
}

function stopRevalidation(): void {
  revalidators = Math.max(0, revalidators - 1);
  if (revalidators !== 0 || typeof window === "undefined") return;
  window.removeEventListener("focus", onFocus);
  document.removeEventListener("visibilitychange", onVisibility);
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

// ── Hooks ────────────────────────────────────────────────────────────────

function useStore(): State {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Primary hook — items + loading/error. Loads on first mount (with spinner),
 * and thereafter keeps the list fresh: a background refresh whenever the view is
 * (re)mounted via navigation, plus focus/visibility/interval revalidation.
 */
export function useRetrieveData(): State {
  const snap = useStore();
  useEffect(() => {
    if (state.loaded) {
      // Returning to the page (SPA nav) — refresh in the background.
      void revalidate();
    } else {
      // First-ever load — show the spinner.
      ensureLoaded();
    }
    startRevalidation();
    return () => stopRevalidation();
  }, []);
  return snap;
}

/** Back-compat: items only (also triggers load). */
export function useRetrieveItems(): RetrieveItem[] {
  return useRetrieveData().items;
}
