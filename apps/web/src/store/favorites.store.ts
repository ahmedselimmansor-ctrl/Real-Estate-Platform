'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

import { ApiError, api } from '@/lib/api';
import type { Favorite } from '@/types/user';
import { useAuthStore } from './auth.store';
import { persistedStorage, STORAGE_KEYS } from './storage';

/**
 * Favourites (CONTRACT §8): persisted locally so guests can save listings, and
 * reconciled with `GET/POST/DELETE /favorites` the moment the user signs in.
 * Every mutation is optimistic and rolls back if the server rejects it.
 */

export interface FavoritesState {
  ids: string[];
  /** Property ids with an in-flight server mutation. */
  pending: Record<string, boolean>;
  hasHydrated: boolean;
  lastSyncedAt: number | null;

  isFavorite: (propertyId: string) => boolean;
  add: (propertyId: string) => Promise<boolean>;
  remove: (propertyId: string) => Promise<boolean>;
  toggle: (propertyId: string) => Promise<boolean>;
  setAll: (ids: string[]) => void;
  clear: () => void;
  /** Pull the server list and push any ids saved while signed out. */
  syncWithServer: () => Promise<void>;
  hydrate: () => Promise<void>;
  setHasHydrated: (value: boolean) => void;
}

function isAuthenticated(): boolean {
  return useAuthStore.getState().status === 'authenticated';
}

function setPending(
  state: FavoritesState,
  propertyId: string,
  value: boolean,
): Record<string, boolean> {
  const pending = { ...state.pending };
  if (value) pending[propertyId] = true;
  else delete pending[propertyId];
  return pending;
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      ids: [],
      pending: {},
      hasHydrated: false,
      lastSyncedAt: null,

      isFavorite: (propertyId) => get().ids.includes(propertyId),

      add: async (propertyId) => {
        if (get().ids.includes(propertyId)) return true;
        set((state) => ({
          ids: [propertyId, ...state.ids],
          pending: setPending(state, propertyId, true),
        }));

        if (!isAuthenticated()) {
          set((state) => ({ pending: setPending(state, propertyId, false) }));
          return true;
        }

        try {
          await api.post(`/favorites/${propertyId}`);
          set((state) => ({ pending: setPending(state, propertyId, false) }));
          return true;
        } catch (error) {
          // 409 = already saved server-side; treat as success.
          const conflict = error instanceof ApiError && error.status === 409;
          set((state) => ({
            ids: conflict ? state.ids : state.ids.filter((id) => id !== propertyId),
            pending: setPending(state, propertyId, false),
          }));
          return conflict;
        }
      },

      remove: async (propertyId) => {
        if (!get().ids.includes(propertyId)) return true;
        const snapshot = get().ids;
        set((state) => ({
          ids: state.ids.filter((id) => id !== propertyId),
          pending: setPending(state, propertyId, true),
        }));

        if (!isAuthenticated()) {
          set((state) => ({ pending: setPending(state, propertyId, false) }));
          return true;
        }

        try {
          await api.delete(`/favorites/${propertyId}`);
          set((state) => ({ pending: setPending(state, propertyId, false) }));
          return true;
        } catch (error) {
          const missing = error instanceof ApiError && error.status === 404;
          set((state) => ({
            ids: missing ? state.ids : snapshot,
            pending: setPending(state, propertyId, false),
          }));
          return missing;
        }
      },

      toggle: async (propertyId) => {
        const { ids, add, remove } = get();
        if (ids.includes(propertyId)) {
          await remove(propertyId);
          return false;
        }
        await add(propertyId);
        return true;
      },

      setAll: (ids) => set({ ids: Array.from(new Set(ids)) }),

      clear: () => set({ ids: [], pending: {}, lastSyncedAt: null }),

      syncWithServer: async () => {
        if (!isAuthenticated()) return;
        const local = get().ids;
        try {
          const { items } = await api.list<Favorite>('/favorites', { query: { limit: 100 } });
          const serverIds = items.map((favorite) => favorite.propertyId);

          // Push guest-era saves up to the account, ignoring individual failures.
          const missingOnServer = local.filter((id) => !serverIds.includes(id));
          await Promise.allSettled(
            missingOnServer.map((id) => api.post(`/favorites/${id}`)),
          );

          set({
            ids: Array.from(new Set([...serverIds, ...missingOnServer])),
            lastSyncedAt: Date.now(),
          });
        } catch {
          // Offline or 401 — keep the local list, try again on the next mount.
        }
      },

      hydrate: async () => {
        await useFavoritesStore.persist.rehydrate();
        if (!get().hasHydrated) set({ hasHydrated: true });
      },

      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: STORAGE_KEYS.favorites,
      version: 1,
      storage: persistedStorage(),
      skipHydration: true,
      partialize: (state) => ({ ids: state.ids, lastSyncedAt: state.lastSyncedAt }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

/* ------------------------------------------------------------- selectors -- */

export const useFavoriteIds = () => useFavoritesStore((state) => state.ids);
export const useFavoritesCount = () => useFavoritesStore((state) => state.ids.length);
export const useIsFavorite = (propertyId: string) =>
  useFavoritesStore((state) => state.ids.includes(propertyId));
export const useFavoritePending = (propertyId: string) =>
  useFavoritesStore((state) => Boolean(state.pending[propertyId]));

export const useFavoriteActions = () =>
  useFavoritesStore(
    useShallow((state) => ({
      add: state.add,
      remove: state.remove,
      toggle: state.toggle,
      clear: state.clear,
      syncWithServer: state.syncWithServer,
    })),
  );
