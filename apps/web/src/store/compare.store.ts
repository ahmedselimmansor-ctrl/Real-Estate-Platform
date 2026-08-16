'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

import { MAX_COMPARE_ITEMS } from '@/lib/constants';
import type { PropertyType } from '@/types/enums';
import { persistedStorage, STORAGE_KEYS } from './storage';

/**
 * Compare tray (CONTRACT §8) — persisted, hard-capped at 4 listings.
 * A light snapshot is stored alongside the id so the sticky compare bar can
 * render instantly on a cold load without refetching every listing.
 */

export interface CompareItem {
  id: string;
  slug: string;
  title: string;
  image: string | null;
  price: number;
  areaSqm: number;
  bedrooms: number;
  bathrooms: number;
  propertyType: PropertyType;
  areaName: string;
  compoundName?: string | null;
}

export interface CompareState {
  items: CompareItem[];
  isBarOpen: boolean;
  hasHydrated: boolean;

  has: (propertyId: string) => boolean;
  add: (item: CompareItem) => { ok: boolean; reason?: 'duplicate' | 'full' };
  remove: (propertyId: string) => void;
  toggle: (item: CompareItem) => { ok: boolean; added: boolean; reason?: 'duplicate' | 'full' };
  clear: () => void;
  setBarOpen: (open: boolean) => void;
  isFull: () => boolean;
  hydrate: () => Promise<void>;
  setHasHydrated: (value: boolean) => void;
}

export const useCompareStore = create<CompareState>()(
  persist(
    (set, get) => ({
      items: [],
      isBarOpen: true,
      hasHydrated: false,

      has: (propertyId) => get().items.some((item) => item.id === propertyId),

      isFull: () => get().items.length >= MAX_COMPARE_ITEMS,

      add: (item) => {
        const { items } = get();
        if (items.some((entry) => entry.id === item.id)) return { ok: false, reason: 'duplicate' };
        if (items.length >= MAX_COMPARE_ITEMS) return { ok: false, reason: 'full' };
        set({ items: [...items, item], isBarOpen: true });
        return { ok: true };
      },

      remove: (propertyId) =>
        set((state) => ({ items: state.items.filter((item) => item.id !== propertyId) })),

      toggle: (item) => {
        const { items, add, remove } = get();
        if (items.some((entry) => entry.id === item.id)) {
          remove(item.id);
          return { ok: true, added: false };
        }
        const result = add(item);
        return { ok: result.ok, added: result.ok, reason: result.reason };
      },

      clear: () => set({ items: [] }),

      setBarOpen: (open) => set({ isBarOpen: open }),

      hydrate: async () => {
        await useCompareStore.persist.rehydrate();
        if (!get().hasHydrated) set({ hasHydrated: true });
      },

      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: STORAGE_KEYS.compare,
      version: 1,
      storage: persistedStorage(),
      skipHydration: true,
      partialize: (state) => ({ items: state.items.slice(0, MAX_COMPARE_ITEMS) }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

/* ------------------------------------------------------------- selectors -- */

export const useCompareItems = () => useCompareStore((state) => state.items);
export const useCompareCount = () => useCompareStore((state) => state.items.length);
export const useIsCompared = (propertyId: string) =>
  useCompareStore((state) => state.items.some((item) => item.id === propertyId));
export const useCompareBarOpen = () =>
  useCompareStore((state) => state.isBarOpen && state.items.length > 0);

export const useCompareActions = () =>
  useCompareStore(
    useShallow((state) => ({
      add: state.add,
      remove: state.remove,
      toggle: state.toggle,
      clear: state.clear,
      setBarOpen: state.setBarOpen,
    })),
  );

export { MAX_COMPARE_ITEMS };
