'use client';

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import {
  countActiveFilters,
  deserializeFilters,
  filtersEqual,
  filtersToHref,
  mergeFilters,
  serializeFilters,
} from '@/lib/filters';
import { DEFAULT_PAGE_SIZE, DEFAULT_SORT } from '@/lib/constants';
import { toggleInArray } from '@/lib/utils';
import type { SearchSort } from '@/types/enums';
import type { SearchFilters } from '@/types/search';

/**
 * Search filter state (CONTRACT §8). Deliberately NOT persisted — the URL is
 * the source of truth so results pages stay shareable and SSR-able.
 */

export type ListLayout = 'grid' | 'list' | 'map';

export interface FiltersState {
  filters: SearchFilters;
  /** Draft edits inside the mobile filter sheet, applied on "Show results". */
  draft: SearchFilters;
  layout: ListLayout;

  setFilters: (filters: SearchFilters) => void;
  patchFilters: (patch: Partial<SearchFilters>) => void;
  setFilter: <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => void;
  toggleArrayFilter: <K extends 'propertyType' | 'finishing' | 'areaId' | 'compoundId' | 'developerId' | 'amenities'>(
    key: K,
    value: NonNullable<SearchFilters[K]>[number],
  ) => void;
  toggleNumberFilter: (key: 'bedrooms' | 'bathrooms', value: number) => void;
  setPriceRange: (min?: number, max?: number) => void;
  setAreaRange: (min?: number, max?: number) => void;
  setSort: (sort: SearchSort) => void;
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;
  setLayout: (layout: ListLayout) => void;
  clearFilter: (key: keyof SearchFilters) => void;
  reset: () => void;

  /** Draft helpers (mobile sheet). */
  openDraft: () => void;
  patchDraft: (patch: Partial<SearchFilters>) => void;
  resetDraft: () => void;
  applyDraft: () => void;

  /** URL sync. */
  syncFromQueryString: (queryString: string) => void;
  toQueryString: () => string;
  toHref: (pathname?: string) => string;
  activeCount: () => number;
}

const INITIAL: SearchFilters = { sort: DEFAULT_SORT, page: 1, limit: DEFAULT_PAGE_SIZE };

/** Page always resets to 1 whenever the result set changes shape. */
function withPageReset(filters: SearchFilters, patch: Partial<SearchFilters>): SearchFilters {
  const resetsPage = Object.keys(patch).some((key) => key !== 'page');
  return mergeFilters(filters, resetsPage ? { ...patch, page: 1 } : patch);
}

export const useFiltersStore = create<FiltersState>()((set, get) => ({
  filters: { ...INITIAL },
  draft: { ...INITIAL },
  layout: 'grid',

  setFilters: (filters) => set({ filters: mergeFilters({}, filters), draft: mergeFilters({}, filters) }),

  patchFilters: (patch) => set((state) => ({ filters: withPageReset(state.filters, patch) })),

  setFilter: (key, value) =>
    set((state) => ({ filters: withPageReset(state.filters, { [key]: value } as Partial<SearchFilters>) })),

  toggleArrayFilter: (key, value) =>
    set((state) => {
      const current = (state.filters[key] ?? []) as string[];
      const next = toggleInArray(current, value as string);
      return { filters: withPageReset(state.filters, { [key]: next } as Partial<SearchFilters>) };
    }),

  toggleNumberFilter: (key, value) =>
    set((state) => {
      const current = state.filters[key] ?? [];
      const next = toggleInArray(current, value).sort((a, b) => a - b);
      return { filters: withPageReset(state.filters, { [key]: next } as Partial<SearchFilters>) };
    }),

  setPriceRange: (min, max) =>
    set((state) => ({ filters: withPageReset(state.filters, { minPrice: min, maxPrice: max }) })),

  setAreaRange: (min, max) =>
    set((state) => ({ filters: withPageReset(state.filters, { minArea: min, maxArea: max }) })),

  setSort: (sort) => set((state) => ({ filters: withPageReset(state.filters, { sort }) })),

  setPage: (page) => set((state) => ({ filters: mergeFilters(state.filters, { page }) })),

  setLimit: (limit) => set((state) => ({ filters: withPageReset(state.filters, { limit }) })),

  setLayout: (layout) => set({ layout }),

  clearFilter: (key) =>
    set((state) => ({ filters: withPageReset(state.filters, { [key]: undefined } as Partial<SearchFilters>) })),

  reset: () => set({ filters: { ...INITIAL }, draft: { ...INITIAL } }),

  openDraft: () => set((state) => ({ draft: { ...state.filters } })),

  patchDraft: (patch) => set((state) => ({ draft: mergeFilters(state.draft, patch) })),

  resetDraft: () => set({ draft: { ...INITIAL } }),

  applyDraft: () =>
    set((state) => ({ filters: mergeFilters(state.draft, { page: 1 }), draft: { ...state.draft } })),

  syncFromQueryString: (queryString) => {
    const parsed = mergeFilters(INITIAL, deserializeFilters(queryString));
    if (filtersEqual(parsed, get().filters)) return;
    set({ filters: parsed, draft: parsed });
  },

  toQueryString: () => serializeFilters(get().filters),

  toHref: (pathname = '/search') => filtersToHref(get().filters, pathname),

  activeCount: () => countActiveFilters(get().filters),
}));

/* ------------------------------------------------------------- selectors -- */

export const useFilters = () => useFiltersStore((state) => state.filters);
export const useDraftFilters = () => useFiltersStore((state) => state.draft);
export const useListLayout = () => useFiltersStore((state) => state.layout);
export const useActiveFilterCount = () =>
  useFiltersStore((state) => countActiveFilters(state.filters));

export const useFilterActions = () =>
  useFiltersStore(
    useShallow((state) => ({
      setFilters: state.setFilters,
      patchFilters: state.patchFilters,
      setFilter: state.setFilter,
      toggleArrayFilter: state.toggleArrayFilter,
      toggleNumberFilter: state.toggleNumberFilter,
      setPriceRange: state.setPriceRange,
      setAreaRange: state.setAreaRange,
      setSort: state.setSort,
      setPage: state.setPage,
      setLimit: state.setLimit,
      setLayout: state.setLayout,
      clearFilter: state.clearFilter,
      reset: state.reset,
      syncFromQueryString: state.syncFromQueryString,
    })),
  );

export const useDraftActions = () =>
  useFiltersStore(
    useShallow((state) => ({
      openDraft: state.openDraft,
      patchDraft: state.patchDraft,
      resetDraft: state.resetDraft,
      applyDraft: state.applyDraft,
    })),
  );
