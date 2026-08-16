'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';

import { AUTH_EXPIRED_EVENT } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { useChatStore } from '@/store/chat.store';
import { useCompareStore } from '@/store/compare.store';
import { useFavoritesStore } from '@/store/favorites.store';
import { useUiStore } from '@/store/ui.store';

/**
 * Every persisted store uses `skipHydration: true`, which keeps the SSR HTML
 * and the first client render byte-identical. This component performs the
 * explicit rehydration afterwards — mount it once, from the root layout.
 */
export function StoreHydrator() {
  useEffect(() => {
    let cancelled = false;

    async function hydrateAll() {
      await Promise.all([
        useUiStore.getState().hydrate(),
        useAuthStore.getState().hydrate(),
        useFavoritesStore.getState().hydrate(),
        useCompareStore.getState().hydrate(),
        useChatStore.getState().hydrate(),
      ]);

      if (cancelled) return;

      // Reconcile guest-era favourites with the account once we know who we are.
      if (useAuthStore.getState().status === 'authenticated') {
        void useFavoritesStore.getState().syncWithServer();
      }
    }

    void hydrateAll();

    return () => {
      cancelled = true;
    };
  }, []);

  // A failed refresh clears the session — tell the user instead of silently 401ing.
  useEffect(() => {
    function onAuthExpired() {
      toast.info('Your session expired. Please sign in again.');
    }

    window.addEventListener(AUTH_EXPIRED_EVENT, onAuthExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onAuthExpired);
  }, []);

  return null;
}
