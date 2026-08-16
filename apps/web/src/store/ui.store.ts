'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

import type { Direction, Locale } from '@/types/enums';
import { persistedStorage, STORAGE_KEYS } from './storage';

/**
 * Global UI chrome (CONTRACT §8): locale/direction, theme mirror, and the
 * open/closed state of the mobile filter sheet, search overlay and nav drawer.
 *
 * `next-themes` owns the actual `.dark` class; `theme` here is a mirror so
 * non-DOM consumers (charts, map styles) can read it without a hook.
 */

export type ThemePreference = 'light' | 'dark' | 'system';

export interface UiState {
  locale: Locale;
  dir: Direction;
  theme: ThemePreference;
  isMobileNavOpen: boolean;
  isFilterSheetOpen: boolean;
  isSearchOverlayOpen: boolean;
  isCommandMenuOpen: boolean;
  hasHydrated: boolean;

  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  setTheme: (theme: ThemePreference) => void;
  setMobileNavOpen: (open: boolean) => void;
  setFilterSheetOpen: (open: boolean) => void;
  setSearchOverlayOpen: (open: boolean) => void;
  setCommandMenuOpen: (open: boolean) => void;
  closeAllOverlays: () => void;
  hydrate: () => Promise<void>;
  setHasHydrated: (value: boolean) => void;
}

export const directionForLocale = (locale: Locale): Direction => (locale === 'ar' ? 'rtl' : 'ltr');

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      locale: 'en',
      dir: 'ltr',
      theme: 'system',
      isMobileNavOpen: false,
      isFilterSheetOpen: false,
      isSearchOverlayOpen: false,
      isCommandMenuOpen: false,
      hasHydrated: false,

      setLocale: (locale) => set({ locale, dir: directionForLocale(locale) }),

      toggleLocale: () =>
        set((state) => {
          const locale: Locale = state.locale === 'en' ? 'ar' : 'en';
          return { locale, dir: directionForLocale(locale) };
        }),

      setTheme: (theme) => set({ theme }),

      setMobileNavOpen: (open) => set({ isMobileNavOpen: open }),
      setFilterSheetOpen: (open) => set({ isFilterSheetOpen: open }),
      setSearchOverlayOpen: (open) => set({ isSearchOverlayOpen: open }),
      setCommandMenuOpen: (open) => set({ isCommandMenuOpen: open }),

      closeAllOverlays: () =>
        set({
          isMobileNavOpen: false,
          isFilterSheetOpen: false,
          isSearchOverlayOpen: false,
          isCommandMenuOpen: false,
        }),

      hydrate: async () => {
        await useUiStore.persist.rehydrate();
        if (!get().hasHydrated) set({ hasHydrated: true });
      },

      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: STORAGE_KEYS.ui,
      version: 1,
      storage: persistedStorage(),
      skipHydration: true,
      partialize: (state) => ({ locale: state.locale, dir: state.dir, theme: state.theme }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

/* ------------------------------------------------------------- selectors -- */

export const useLocale = () => useUiStore((state) => state.locale);
export const useDirection = () => useUiStore((state) => state.dir);
export const useIsRtl = () => useUiStore((state) => state.dir === 'rtl');
export const useUiHydrated = () => useUiStore((state) => state.hasHydrated);
export const useMobileNavOpen = () => useUiStore((state) => state.isMobileNavOpen);
export const useFilterSheetOpen = () => useUiStore((state) => state.isFilterSheetOpen);
export const useCommandMenuOpen = () => useUiStore((state) => state.isCommandMenuOpen);

export const useUiActions = () =>
  useUiStore(
    useShallow((state) => ({
      setLocale: state.setLocale,
      toggleLocale: state.toggleLocale,
      setTheme: state.setTheme,
      setMobileNavOpen: state.setMobileNavOpen,
      setFilterSheetOpen: state.setFilterSheetOpen,
      setSearchOverlayOpen: state.setSearchOverlayOpen,
      setCommandMenuOpen: state.setCommandMenuOpen,
      closeAllOverlays: state.closeAllOverlays,
    })),
  );

/** Non-reactive read for formatters called outside React. */
export const getLocale = () => useUiStore.getState().locale;
