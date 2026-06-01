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

// ── Mutations (write to Supabase, then update cache) ────────────────────────

export async function addItem(input: NewItemInput): Promise<RetrieveItem> {
  const item = await insertItem(input);
  set({ items: [item, ...state.items] });
  return item;
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

// ── Hooks ────────────────────────────────────────────────────────────────

function useStore(): State {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Primary hook — items + loading/error, and kicks off the initial load. */
export function useRetrieveData(): State {
  const snap = useStore();
  useEffect(() => {
    ensureLoaded();
  }, []);
  return snap;
}

/** Back-compat: items only (also triggers load). */
export function useRetrieveItems(): RetrieveItem[] {
  return useRetrieveData().items;
}
