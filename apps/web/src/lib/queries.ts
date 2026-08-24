'use client';

import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';

import { useAuthStore } from '@/store/auth.store';
import { useFavoritesStore } from '@/store/favorites.store';
import type { Paginated, PaginationMeta, QueryParams } from '@/types/common';
import type { Amenity, Area, Compound, Developer } from '@/types/catalog';
import type { CreateLeadPayload, Lead, LeadListParams, UpdateLeadPayload } from '@/types/lead';
import type { Property, PropertyListParams, PropertySearchHit } from '@/types/property';
import type {
  AutocompleteResponse,
  AutocompleteSuggestion,
  MapBounds,
  MapSearchResponse,
  SearchFacets,
  SearchFilters,
  SearchResponse,
  SearchResults,
} from '@/types/search';
import type {
  AdminStats,
  CreateSavedSearchPayload,
  Favorite,
  ForgotPasswordPayload,
  LoginPayload,
  RegisterPayload,
  ResetPasswordPayload,
  SavedSearch,
  User,
} from '@/types/user';
import type {
  InstallmentSchedule,
  InstallmentSchedulePayload,
  MarketSummary,
  MortgageCalculation,
  MortgageCalculationPayload,
} from '@/types/reports';
import { api, reportsApi, requestWithMeta, type ApiError } from './api';
import { DEFAULT_PAGE_SIZE } from './constants';
import { filtersToQueryParams } from './filters';
import { queryKeys } from './query-keys';

/**
 * Typed react-query hooks for the endpoints in CONTRACT §6.
 * Convention: queries are read-only and keyed through `queryKeys`; mutations
 * invalidate the narrowest key that could have changed.
 */

type QueryOpts<TData> = Omit<UseQueryOptions<TData, ApiError, TData>, 'queryKey' | 'queryFn'>;

type MutationOpts<TData, TVariables> = Omit<
  UseMutationOptions<TData, ApiError, TVariables>,
  'mutationFn'
>;

function metaFor(page: number, limit: number, total: number): PaginationMeta {
  return { page, limit, total, totalPages: limit > 0 ? Math.ceil(total / limit) : 0 };
}

/* ========================================================================== */
/*  Properties (api-core)                                                     */
/* ========================================================================== */

export function useProperties(
  params: PropertyListParams = {},
  options: QueryOpts<Paginated<Property>> = {},
) {
  return useQuery<Paginated<Property>, ApiError>({
    queryKey: queryKeys.properties.list(params),
    queryFn: ({ signal }) =>
      api.list<Property>('/properties', { query: params as QueryParams, signal }),
    placeholderData: keepPreviousData,
    ...options,
  });
}

export function useProperty(idOrSlug: string, options: QueryOpts<Property> = {}) {
  return useQuery<Property, ApiError>({
    queryKey: queryKeys.properties.detail(idOrSlug),
    queryFn: ({ signal }) => api.get<Property>(`/properties/${idOrSlug}`, { signal }),
    enabled: Boolean(idOrSlug),
    ...options,
  });
}

export function useSimilarProperties(id: string, options: QueryOpts<Property[]> = {}) {
  return useQuery<Property[], ApiError>({
    queryKey: queryKeys.properties.similar(id),
    queryFn: ({ signal }) => api.get<Property[]>(`/properties/${id}/similar`, { signal }),
    enabled: Boolean(id),
    staleTime: 5 * 60_000,
    ...options,
  });
}

/** Fire-and-forget view counter (CONTRACT §6). */
export function useRecordPropertyView(options: MutationOpts<void, string> = {}) {
  return useMutation<void, ApiError, string>({
    mutationFn: (propertyId) => api.post<void>(`/properties/${propertyId}/view`),
    ...options,
  });
}

/* ========================================================================== */
/*  Compounds / developers / areas / amenities                                */
/* ========================================================================== */

export function useCompounds(
  params: QueryParams = {},
  options: QueryOpts<Paginated<Compound>> = {},
) {
  return useQuery<Paginated<Compound>, ApiError>({
    queryKey: queryKeys.compounds.list(params),
    queryFn: ({ signal }) => api.list<Compound>('/compounds', { query: params, signal }),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    ...options,
  });
}

export function useCompound(idOrSlug: string, options: QueryOpts<Compound> = {}) {
  return useQuery<Compound, ApiError>({
    queryKey: queryKeys.compounds.detail(idOrSlug),
    queryFn: ({ signal }) => api.get<Compound>(`/compounds/${idOrSlug}`, { signal }),
    enabled: Boolean(idOrSlug),
    staleTime: 5 * 60_000,
    ...options,
  });
}

export function useDevelopers(
  params: QueryParams = {},
  options: QueryOpts<Paginated<Developer>> = {},
) {
  return useQuery<Paginated<Developer>, ApiError>({
    queryKey: queryKeys.developers.list(params),
    queryFn: ({ signal }) => api.list<Developer>('/developers', { query: params, signal }),
    placeholderData: keepPreviousData,
    staleTime: 15 * 60_000,
    ...options,
  });
}

export function useDeveloper(idOrSlug: string, options: QueryOpts<Developer> = {}) {
  return useQuery<Developer, ApiError>({
    queryKey: queryKeys.developers.detail(idOrSlug),
    queryFn: ({ signal }) => api.get<Developer>(`/developers/${idOrSlug}`, { signal }),
    enabled: Boolean(idOrSlug),
    staleTime: 15 * 60_000,
    ...options,
  });
}

export function useAreas(params: QueryParams = {}, options: QueryOpts<Paginated<Area>> = {}) {
  return useQuery<Paginated<Area>, ApiError>({
    queryKey: queryKeys.areas.list(params),
    queryFn: ({ signal }) => api.list<Area>('/areas', { query: params, signal }),
    placeholderData: keepPreviousData,
    staleTime: 15 * 60_000,
    ...options,
  });
}

export function useArea(idOrSlug: string, options: QueryOpts<Area> = {}) {
  return useQuery<Area, ApiError>({
    queryKey: queryKeys.areas.detail(idOrSlug),
    queryFn: ({ signal }) => api.get<Area>(`/areas/${idOrSlug}`, { signal }),
    enabled: Boolean(idOrSlug),
    staleTime: 15 * 60_000,
    ...options,
  });
}

export function useAmenities(options: QueryOpts<Amenity[]> = {}) {
  return useQuery<Amenity[], ApiError>({
    queryKey: queryKeys.amenities.list(),
    queryFn: ({ signal }) => api.get<Amenity[]>('/amenities', { signal }),
    staleTime: 60 * 60_000,
    ...options,
  });
}

/* ========================================================================== */
/*  Favorites                                                                 */
/* ========================================================================== */

export function useFavorites(
  params: QueryParams = { limit: 50 },
  options: QueryOpts<Paginated<Favorite>> = {},
) {
  const isAuthenticated = useAuthStore((state) => state.status === 'authenticated');
  return useQuery<Paginated<Favorite>, ApiError>({
    queryKey: queryKeys.favorites.list(params),
    queryFn: ({ signal }) => api.list<Favorite>('/favorites', { query: params, signal }),
    enabled: isAuthenticated,
    ...options,
  });
}

/**
 * Optimistic favourite toggle. The zustand store is the source of truth (it
 * also works signed-out); this hook keeps the server-backed list in sync.
 */
export function useToggleFavorite() {
  const queryClient = useQueryClient();
  const toggle = useFavoritesStore((state) => state.toggle);

  return useMutation<boolean, ApiError, string>({
    mutationFn: (propertyId) => toggle(propertyId),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.favorites.all });
    },
  });
}

/* ========================================================================== */
/*  Saved searches                                                            */
/* ========================================================================== */

export function useSavedSearches(options: QueryOpts<Paginated<SavedSearch>> = {}) {
  const isAuthenticated = useAuthStore((state) => state.status === 'authenticated');
  return useQuery<Paginated<SavedSearch>, ApiError>({
    queryKey: queryKeys.savedSearches.list(),
    queryFn: ({ signal }) => api.list<SavedSearch>('/saved-searches', { signal }),
    enabled: isAuthenticated,
    ...options,
  });
}

export function useCreateSavedSearch(
  options: MutationOpts<SavedSearch, CreateSavedSearchPayload> = {},
) {
  const queryClient = useQueryClient();
  return useMutation<SavedSearch, ApiError, CreateSavedSearchPayload>({
    mutationFn: (payload) => api.post<SavedSearch>('/saved-searches', payload),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.savedSearches.all });
      options.onSuccess?.(...args);
    },
  });
}

export function useDeleteSavedSearch(options: MutationOpts<void, string> = {}) {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (id) => api.delete<void>(`/saved-searches/${id}`),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.savedSearches.all });
      options.onSuccess?.(...args);
    },
  });
}

/* ========================================================================== */
/*  Leads                                                                     */
/* ========================================================================== */

export function useCreateLead(options: MutationOpts<Lead, CreateLeadPayload> = {}) {
  const queryClient = useQueryClient();
  return useMutation<Lead, ApiError, CreateLeadPayload>({
    mutationFn: (payload) => api.post<Lead>('/leads', payload),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.leads.all });
      options.onSuccess?.(...args);
    },
  });
}

export function useLeads(params: LeadListParams = {}, options: QueryOpts<Paginated<Lead>> = {}) {
  return useQuery<Paginated<Lead>, ApiError>({
    queryKey: queryKeys.leads.list(params),
    queryFn: ({ signal }) => api.list<Lead>('/leads', { query: params as QueryParams, signal }),
    placeholderData: keepPreviousData,
    ...options,
  });
}

export function useUpdateLead(
  options: MutationOpts<Lead, { id: string; patch: UpdateLeadPayload }> = {},
) {
  const queryClient = useQueryClient();
  return useMutation<Lead, ApiError, { id: string; patch: UpdateLeadPayload }>({
    mutationFn: ({ id, patch }) => api.patch<Lead>(`/leads/${id}`, patch),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.leads.all });
      options.onSuccess?.(...args);
    },
  });
}

/* ========================================================================== */
/*  Search (search-svc)                                                       */
/* ========================================================================== */

function normalizeSearch(
  payload: SearchResponse | PropertySearchHit[],
  meta: PaginationMeta | undefined,
  filters: SearchFilters,
): SearchResults {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? DEFAULT_PAGE_SIZE;

  if (Array.isArray(payload)) {
    return { hits: payload, meta: meta ?? metaFor(page, limit, payload.length) };
  }

  // search-svc returns `results`; keep `hits` as a fallback so a shape change
  // upstream degrades to an empty list rather than a crash.
  const hits = payload?.results ?? payload?.hits ?? [];
  const resolvedLimit = payload?.limit ?? limit;
  const resolvedTotal = payload?.total ?? hits.length;

  return {
    hits,
    facets: payload?.facets,
    took: payload?.took,
    meta:
      meta ??
      ({
        page: payload?.page ?? page,
        limit: resolvedLimit,
        total: resolvedTotal,
        totalPages: payload?.totalPages ?? metaFor(page, resolvedLimit, resolvedTotal).totalPages,
      } satisfies PaginationMeta),
  };
}

async function fetchSearch(filters: SearchFilters, signal?: AbortSignal): Promise<SearchResults> {
  const result = await requestWithMeta<SearchResponse | PropertySearchHit[]>('', {
    service: 'search',
    query: filtersToQueryParams(filters),
    signal,
  });
  return normalizeSearch(result.data, result.meta, filters);
}

export function useSearch(filters: SearchFilters, options: QueryOpts<SearchResults> = {}) {
  return useQuery<SearchResults, ApiError>({
    queryKey: queryKeys.search.results(filters),
    queryFn: ({ signal }) => fetchSearch(filters, signal),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    ...options,
  });
}

/** "Load more" variant used by the mobile results feed. */
export function useInfiniteSearch(filters: SearchFilters) {
  const limit = filters.limit ?? DEFAULT_PAGE_SIZE;
  return useInfiniteQuery<SearchResults, ApiError>({
    queryKey: queryKeys.search.infinite(filters),
    initialPageParam: filters.page ?? 1,
    queryFn: ({ pageParam, signal }) =>
      fetchSearch({ ...filters, page: Number(pageParam) || 1, limit }, signal),
    getNextPageParam: (lastPage) =>
      lastPage.meta.page < lastPage.meta.totalPages ? lastPage.meta.page + 1 : undefined,
    staleTime: 60_000,
  });
}

export function useSearchFacets(filters: SearchFilters, options: QueryOpts<SearchFacets> = {}) {
  return useQuery<SearchFacets, ApiError>({
    queryKey: queryKeys.search.facets(filters),
    queryFn: ({ signal }) =>
      api.get<SearchFacets>('/facets', {
        service: 'search',
        query: filtersToQueryParams({ ...filters, page: undefined, limit: undefined }),
        signal,
      }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    ...options,
  });
}

export function useAutocomplete(
  term: string,
  limit = 8,
  options: QueryOpts<AutocompleteSuggestion[]> = {},
) {
  const query = term.trim();
  return useQuery<AutocompleteSuggestion[], ApiError>({
    queryKey: queryKeys.search.autocomplete(query, limit),
    queryFn: async ({ signal }) => {
      const data = await api.get<AutocompleteResponse | AutocompleteSuggestion[]>('/autocomplete', {
        service: 'search',
        query: { q: query, limit },
        signal,
      });
      return Array.isArray(data) ? data : (data?.suggestions ?? []);
    },
    enabled: query.length >= 2,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    ...options,
  });
}

export function useMapSearch(
  bounds: MapBounds | null,
  filters: SearchFilters = {},
  options: QueryOpts<MapSearchResponse> = {},
) {
  return useQuery<MapSearchResponse, ApiError>({
    queryKey: queryKeys.search.map(
      bounds ?? { minLng: 0, minLat: 0, maxLng: 0, maxLat: 0 },
      filters,
    ),
    queryFn: ({ signal }) =>
      api.get<MapSearchResponse>('/map', {
        service: 'search',
        query: {
          ...filtersToQueryParams(filters),
          bbox: bounds
            ? `${bounds.minLng},${bounds.minLat},${bounds.maxLng},${bounds.maxLat}`
            : undefined,
        },
        signal,
      }),
    enabled: Boolean(bounds),
    placeholderData: keepPreviousData,
    ...options,
  });
}

export function useSimilarSearch(id: string, options: QueryOpts<PropertySearchHit[]> = {}) {
  return useQuery<PropertySearchHit[], ApiError>({
    queryKey: queryKeys.search.similar(id),
    queryFn: async ({ signal }) => {
      const data = await api.get<SearchResponse | PropertySearchHit[]>(`/similar/${id}`, {
        service: 'search',
        signal,
      });
      return Array.isArray(data) ? data : (data?.hits ?? []);
    },
    enabled: Boolean(id),
    staleTime: 5 * 60_000,
    ...options,
  });
}

/* ========================================================================== */
/*  Auth + profile                                                            */
/* ========================================================================== */

export function useMe(options: QueryOpts<User> = {}) {
  const isAuthenticated = useAuthStore((state) => state.status === 'authenticated');
  const setUser = useAuthStore((state) => state.setUser);

  return useQuery<User, ApiError>({
    queryKey: queryKeys.auth.me(),
    queryFn: async ({ signal }) => {
      const user = await api.get<User>('/auth/me', { signal });
      setUser(user);
      return user;
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
    ...options,
  });
}

export interface AuthResponse {
  user: User;
  accessToken: string;
}

export function useLogin(options: MutationOpts<AuthResponse, LoginPayload> = {}) {
  const queryClient = useQueryClient();
  const login = useAuthStore((state) => state.login);
  const syncFavorites = useFavoritesStore((state) => state.syncWithServer);

  return useMutation<AuthResponse, ApiError, LoginPayload>({
    mutationFn: (payload) => api.post<AuthResponse>('/auth/login', payload),
    ...options,
    onSuccess: (...args) => {
      const [data] = args;
      login({ user: data.user, accessToken: data.accessToken });
      void syncFavorites();
      void queryClient.invalidateQueries();
      options.onSuccess?.(...args);
    },
  });
}

export function useRegister(options: MutationOpts<AuthResponse, RegisterPayload> = {}) {
  const queryClient = useQueryClient();
  const login = useAuthStore((state) => state.login);
  const syncFavorites = useFavoritesStore((state) => state.syncWithServer);

  return useMutation<AuthResponse, ApiError, RegisterPayload>({
    mutationFn: (payload) => api.post<AuthResponse>('/auth/register', payload),
    ...options,
    onSuccess: (...args) => {
      const [data] = args;
      login({ user: data.user, accessToken: data.accessToken });
      void syncFavorites();
      void queryClient.invalidateQueries();
      options.onSuccess?.(...args);
    },
  });
}

/**
 * Ask for a reset link.
 *
 * The endpoint always answers 200, whether or not the address belongs to an
 * account (CONTRACT §5) — so this deliberately cannot tell the caller which it
 * was, and the UI must not try to infer it.
 */
export function useForgotPassword(
  options: MutationOpts<{ sent: true }, ForgotPasswordPayload> = {},
) {
  return useMutation<{ sent: true }, ApiError, ForgotPasswordPayload>({
    mutationFn: (payload) => api.post<{ sent: true }>('/auth/forgot-password', payload),
    ...options,
  });
}

/** Consume a single-use reset token and set the new password. */
export function useResetPassword(
  options: MutationOpts<{ reset: true }, ResetPasswordPayload> = {},
) {
  return useMutation<{ reset: true }, ApiError, ResetPasswordPayload>({
    mutationFn: (payload) => api.post<{ reset: true }>('/auth/reset-password', payload),
    ...options,
  });
}

export function useLogout(options: MutationOpts<void, void> = {}) {
  const queryClient = useQueryClient();
  const logout = useAuthStore((state) => state.logout);

  return useMutation<void, ApiError, void>({
    mutationFn: async () => {
      try {
        await api.post<void>('/auth/logout');
      } catch {
        // The refresh cookie may already be gone — always clear locally.
      }
    },
    ...options,
    onSuccess: (...args) => {
      logout();
      queryClient.clear();
      options.onSuccess?.(...args);
    },
  });
}

export function useUpdateProfile(options: MutationOpts<User, Partial<User>> = {}) {
  const queryClient = useQueryClient();
  const setUser = useAuthStore((state) => state.setUser);

  return useMutation<User, ApiError, Partial<User>>({
    mutationFn: (patch) => api.patch<User>('/users/me', patch),
    ...options,
    onSuccess: (...args) => {
      const [data] = args;
      setUser(data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() });
      options.onSuccess?.(...args);
    },
  });
}

/* ========================================================================== */
/*  Reports (reports-svc)                                                     */
/* ========================================================================== */

export function useMortgageCalculation(
  options: MutationOpts<MortgageCalculation, MortgageCalculationPayload> = {},
) {
  return useMutation<MortgageCalculation, ApiError, MortgageCalculationPayload>({
    mutationFn: (payload) => reportsApi.post<MortgageCalculation>('/mortgage/calculate', payload),
    ...options,
  });
}

export function useInstallmentSchedule(
  options: MutationOpts<InstallmentSchedule, InstallmentSchedulePayload> = {},
) {
  return useMutation<InstallmentSchedule, ApiError, InstallmentSchedulePayload>({
    mutationFn: (payload) => reportsApi.post<InstallmentSchedule>('/installment/schedule', payload),
    ...options,
  });
}

export function useMarketSummary(params: QueryParams = {}, options: QueryOpts<MarketSummary> = {}) {
  return useQuery<MarketSummary, ApiError>({
    queryKey: queryKeys.reports.marketSummary(params),
    queryFn: ({ signal }) =>
      reportsApi.get<MarketSummary>('/market/summary', { query: params, signal }),
    staleTime: 15 * 60_000,
    ...options,
  });
}

/* ========================================================================== */
/*  Admin (api-core)                                                          */
/* ========================================================================== */

/** Dashboard KPIs. Admin only; the API rejects anyone else with 403. */
export function useAdminStats(options: QueryOpts<AdminStats> = {}) {
  return useQuery<AdminStats, ApiError>({
    queryKey: queryKeys.admin.stats(),
    queryFn: ({ signal }) => api.get<AdminStats>('/admin/stats', { signal }),
    staleTime: 60_000,
    ...options,
  });
}

/* -------------------------------------------------------------------------- */
/*  Catalogue writes (staff only)                                             */
/* -------------------------------------------------------------------------- */

/**
 * The API has carried POST/PATCH/DELETE on properties, compounds, developers
 * and areas since the beginning; nothing in the dashboard could reach any of
 * it, so the catalogue was editable only through the seeder or by hand.
 *
 * Each mutation invalidates the entity's whole key space rather than patching a
 * single cache entry. A listing edit moves it between filtered lists, changes
 * its position under every sort, and alters the admin counters — reconciling
 * that by hand is how a stale row ends up on screen.
 */

export function useCreateProperty(options: MutationOpts<Property, Partial<Property>> = {}) {
  const queryClient = useQueryClient();
  return useMutation<Property, ApiError, Partial<Property>>({
    mutationFn: (payload) => api.post<Property>('/properties', payload),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.properties.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.all });
      options.onSuccess?.(...args);
    },
  });
}

export function useUpdateProperty(
  options: MutationOpts<Property, { id: string; patch: Partial<Property> }> = {},
) {
  const queryClient = useQueryClient();
  return useMutation<Property, ApiError, { id: string; patch: Partial<Property> }>({
    mutationFn: ({ id, patch }) => api.patch<Property>(`/properties/${id}`, patch),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.properties.all });
      // The search index is rebuilt from the catalogue, so a listing edit can
      // change what a search returns too.
      void queryClient.invalidateQueries({ queryKey: queryKeys.search.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.all });
      options.onSuccess?.(...args);
    },
  });
}

export function useDeleteProperty(options: MutationOpts<void, string> = {}) {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (id) => api.delete<void>(`/properties/${id}`),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.properties.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.search.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.all });
      options.onSuccess?.(...args);
    },
  });
}

export function useCreateCompound(options: MutationOpts<Compound, Partial<Compound>> = {}) {
  const queryClient = useQueryClient();
  return useMutation<Compound, ApiError, Partial<Compound>>({
    mutationFn: (payload) => api.post<Compound>('/compounds', payload),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.compounds.all });
      options.onSuccess?.(...args);
    },
  });
}

export function useUpdateCompound(
  options: MutationOpts<Compound, { id: string; patch: Partial<Compound> }> = {},
) {
  const queryClient = useQueryClient();
  return useMutation<Compound, ApiError, { id: string; patch: Partial<Compound> }>({
    mutationFn: ({ id, patch }) => api.patch<Compound>(`/compounds/${id}`, patch),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.compounds.all });
      // Listings carry a denormalised copy of the compound name.
      void queryClient.invalidateQueries({ queryKey: queryKeys.properties.all });
      options.onSuccess?.(...args);
    },
  });
}

export function useDeleteCompound(options: MutationOpts<void, string> = {}) {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (id) => api.delete<void>(`/compounds/${id}`),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.compounds.all });
      options.onSuccess?.(...args);
    },
  });
}

export function useCreateDeveloper(options: MutationOpts<Developer, Partial<Developer>> = {}) {
  const queryClient = useQueryClient();
  return useMutation<Developer, ApiError, Partial<Developer>>({
    mutationFn: (payload) => api.post<Developer>('/developers', payload),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.developers.all });
      options.onSuccess?.(...args);
    },
  });
}

export function useUpdateDeveloper(
  options: MutationOpts<Developer, { id: string; patch: Partial<Developer> }> = {},
) {
  const queryClient = useQueryClient();
  return useMutation<Developer, ApiError, { id: string; patch: Partial<Developer> }>({
    mutationFn: ({ id, patch }) => api.patch<Developer>(`/developers/${id}`, patch),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.developers.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.compounds.all });
      options.onSuccess?.(...args);
    },
  });
}

export function useDeleteDeveloper(options: MutationOpts<void, string> = {}) {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (id) => api.delete<void>(`/developers/${id}`),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.developers.all });
      options.onSuccess?.(...args);
    },
  });
}

export function useCreateArea(options: MutationOpts<Area, Partial<Area>> = {}) {
  const queryClient = useQueryClient();
  return useMutation<Area, ApiError, Partial<Area>>({
    mutationFn: (payload) => api.post<Area>('/areas', payload),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.areas.all });
      options.onSuccess?.(...args);
    },
  });
}

export function useUpdateArea(
  options: MutationOpts<Area, { id: string; patch: Partial<Area> }> = {},
) {
  const queryClient = useQueryClient();
  return useMutation<Area, ApiError, { id: string; patch: Partial<Area> }>({
    mutationFn: ({ id, patch }) => api.patch<Area>(`/areas/${id}`, patch),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.areas.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.compounds.all });
      options.onSuccess?.(...args);
    },
  });
}

export function useDeleteArea(options: MutationOpts<void, string> = {}) {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (id) => api.delete<void>(`/areas/${id}`),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.areas.all });
      options.onSuccess?.(...args);
    },
  });
}

export { queryKeys };
