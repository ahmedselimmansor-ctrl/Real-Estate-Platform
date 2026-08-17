'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

import { tokenExpiresAt } from '@/lib/jwt';
import type { User } from '@/types/user';
import type { UserRole } from '@/types/enums';
import { persistedStorage, STORAGE_KEYS } from './storage';

/**
 * Auth state (CONTRACT §8). The access token lives here (memory + localStorage);
 * the refresh token is an httpOnly `topchoice_rt` cookie the browser never reads.
 *
 * This module intentionally imports nothing from `@/lib/api` — `api.ts` reads
 * this store, so the dependency must stay one-directional.
 */

export type AuthStatus = 'unauthenticated' | 'authenticated';

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  /** Epoch ms derived from the token `exp` claim. */
  expiresAt: number | null;
  status: AuthStatus;
  /** `true` once localStorage has been read on the client. */
  hasHydrated: boolean;

  login: (payload: { user: User; accessToken: string }) => void;
  setSession: (payload: { user?: User | null; accessToken: string | null }) => void;
  setAccessToken: (accessToken: string | null) => void;
  setUser: (user: User | null) => void;
  logout: () => void;
  hydrate: () => Promise<void>;
  setHasHydrated: (value: boolean) => void;
}

/** The subset of `AuthState` that survives a reload. */
type PersistedAuth = Pick<AuthState, 'user' | 'accessToken' | 'expiresAt'>;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      expiresAt: null,
      status: 'unauthenticated',
      hasHydrated: false,

      login: ({ user, accessToken }) =>
        set({
          user,
          accessToken,
          expiresAt: tokenExpiresAt(accessToken),
          status: 'authenticated',
        }),

      setSession: ({ user, accessToken }) =>
        set((state) => {
          const nextUser = user === undefined ? state.user : user;
          return {
            user: nextUser,
            accessToken,
            expiresAt: tokenExpiresAt(accessToken),
            status: accessToken && nextUser ? 'authenticated' : 'unauthenticated',
          };
        }),

      setAccessToken: (accessToken) =>
        set((state) => ({
          accessToken,
          expiresAt: tokenExpiresAt(accessToken),
          status: accessToken && state.user ? 'authenticated' : 'unauthenticated',
        })),

      setUser: (user) =>
        set((state) => ({
          user,
          status: user && state.accessToken ? 'authenticated' : 'unauthenticated',
        })),

      logout: () =>
        set({
          user: null,
          accessToken: null,
          expiresAt: null,
          status: 'unauthenticated',
        }),

      hydrate: async () => {
        await useAuthStore.persist.rehydrate();
        if (!get().hasHydrated) set({ hasHydrated: true });
      },

      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: STORAGE_KEYS.auth,
      version: 1,
      // Typed for the partialized slice below — `persist` stores only that.
      storage: persistedStorage(),
      skipHydration: true,
      partialize: (state): PersistedAuth => ({
        user: state.user,
        accessToken: state.accessToken,
        expiresAt: state.expiresAt,
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<AuthState>;
        return {
          ...current,
          ...saved,
          status: saved.accessToken && saved.user ? 'authenticated' : 'unauthenticated',
        };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

/* ------------------------------------------------------------- selectors -- */

export const useUser = () => useAuthStore((state) => state.user);
export const useAccessToken = () => useAuthStore((state) => state.accessToken);
export const useIsAuthenticated = () => useAuthStore((state) => state.status === 'authenticated');
export const useAuthHydrated = () => useAuthStore((state) => state.hasHydrated);

export const useAuthActions = () =>
  useAuthStore(
    useShallow((state) => ({
      login: state.login,
      logout: state.logout,
      setUser: state.setUser,
      setSession: state.setSession,
      setAccessToken: state.setAccessToken,
    })),
  );

export function useHasRole(...roles: UserRole[]): boolean {
  return useAuthStore((state) => (state.user ? roles.includes(state.user.role) : false));
}

/** Non-reactive read — safe to call from `api.ts` and event handlers. */
export const getAccessToken = () => useAuthStore.getState().accessToken;
