import type { QueryParams } from '@/types/common';
import type { LeadListParams, PropertyListParams } from '@/types';
import type { MapBounds, SearchFilters } from '@/types/search';

/**
 * Central query-key registry. Every hook in `queries.ts` builds its key here so
 * invalidation stays surgical (`queryKeys.properties.all` nukes only listings).
 */
export const queryKeys = {
  properties: {
    all: ['properties'] as const,
    lists: () => [...queryKeys.properties.all, 'list'] as const,
    list: (params: PropertyListParams = {}) => [...queryKeys.properties.lists(), params] as const,
    details: () => [...queryKeys.properties.all, 'detail'] as const,
    detail: (idOrSlug: string) => [...queryKeys.properties.details(), idOrSlug] as const,
    similar: (id: string) => [...queryKeys.properties.all, 'similar', id] as const,
  },

  compounds: {
    all: ['compounds'] as const,
    lists: () => [...queryKeys.compounds.all, 'list'] as const,
    list: (params: QueryParams = {}) => [...queryKeys.compounds.lists(), params] as const,
    detail: (idOrSlug: string) => [...queryKeys.compounds.all, 'detail', idOrSlug] as const,
  },

  developers: {
    all: ['developers'] as const,
    lists: () => [...queryKeys.developers.all, 'list'] as const,
    list: (params: QueryParams = {}) => [...queryKeys.developers.lists(), params] as const,
    detail: (idOrSlug: string) => [...queryKeys.developers.all, 'detail', idOrSlug] as const,
  },

  areas: {
    all: ['areas'] as const,
    lists: () => [...queryKeys.areas.all, 'list'] as const,
    list: (params: QueryParams = {}) => [...queryKeys.areas.lists(), params] as const,
    detail: (idOrSlug: string) => [...queryKeys.areas.all, 'detail', idOrSlug] as const,
  },

  amenities: {
    all: ['amenities'] as const,
    list: () => [...queryKeys.amenities.all, 'list'] as const,
  },

  favorites: {
    all: ['favorites'] as const,
    list: (params: QueryParams = {}) => [...queryKeys.favorites.all, 'list', params] as const,
  },

  savedSearches: {
    all: ['saved-searches'] as const,
    list: () => [...queryKeys.savedSearches.all, 'list'] as const,
  },

  leads: {
    all: ['leads'] as const,
    list: (params: LeadListParams = {}) => [...queryKeys.leads.all, 'list', params] as const,
    detail: (id: string) => [...queryKeys.leads.all, 'detail', id] as const,
  },

  search: {
    all: ['search'] as const,
    results: (filters: SearchFilters) => [...queryKeys.search.all, 'results', filters] as const,
    infinite: (filters: SearchFilters) => [...queryKeys.search.all, 'infinite', filters] as const,
    facets: (filters: SearchFilters) => [...queryKeys.search.all, 'facets', filters] as const,
    autocomplete: (q: string, limit?: number) =>
      [...queryKeys.search.all, 'autocomplete', q, limit ?? null] as const,
    map: (bounds: MapBounds, filters: SearchFilters = {}) =>
      [...queryKeys.search.all, 'map', bounds, filters] as const,
    similar: (id: string) => [...queryKeys.search.all, 'similar', id] as const,
  },

  auth: {
    all: ['auth'] as const,
    me: () => [...queryKeys.auth.all, 'me'] as const,
  },

  users: {
    all: ['users'] as const,
    me: () => [...queryKeys.users.all, 'me'] as const,
    list: (params: QueryParams = {}) => [...queryKeys.users.all, 'list', params] as const,
  },

  admin: {
    all: ['admin'] as const,
    stats: () => [...queryKeys.admin.all, 'stats'] as const,
    activity: (params: QueryParams = {}) =>
      [...queryKeys.admin.all, 'activity', params] as const,
  },

  reports: {
    all: ['reports'] as const,
    marketSummary: (params: QueryParams = {}) =>
      [...queryKeys.reports.all, 'market-summary', params] as const,
  },
} as const;

export type QueryKeys = typeof queryKeys;
