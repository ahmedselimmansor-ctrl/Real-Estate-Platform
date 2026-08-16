import type { QueryParams } from '@/types/common';
import {
  isFinishing,
  isPropertyStatus,
  isPropertyType,
  isSaleType,
  isSearchSort,
} from '@/types/enums';
import type { SearchFilters } from '@/types/search';
import { DEFAULT_PAGE_SIZE } from './constants';

/**
 * Search-filter <-> URL serialisation. The query-string keys are exactly the
 * ones search-svc accepts (CONTRACT §6), so the browser URL, the API request
 * and a saved search all share one representation.
 */

export const EMPTY_FILTERS: SearchFilters = {};

/** Keys that are UI paging/ordering rather than "filters" for the badge count. */
const NON_FILTER_KEYS: ReadonlyArray<keyof SearchFilters> = ['sort', 'page', 'limit', 'q'];

type RawSearchParams =
  | URLSearchParams
  | Record<string, string | string[] | undefined>
  | string
  | null
  | undefined;

function toURLSearchParams(input: RawSearchParams): URLSearchParams {
  if (!input) return new URLSearchParams();
  if (input instanceof URLSearchParams) return input;
  if (typeof input === 'string') return new URLSearchParams(input);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const entry of value) params.append(key, entry);
    } else {
      params.append(key, value);
    }
  }
  return params;
}

function readNumber(params: URLSearchParams, key: string): number | undefined {
  const raw = params.get(key);
  if (raw === null || raw.trim() === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function readNumberList(params: URLSearchParams, key: string): number[] | undefined {
  const values = params
    .getAll(key)
    .flatMap((entry) => entry.split(','))
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry));
  return values.length ? Array.from(new Set(values)) : undefined;
}

function readStringList(params: URLSearchParams, key: string): string[] | undefined {
  const values = params
    .getAll(key)
    .flatMap((entry) => entry.split(','))
    .map((entry) => entry.trim())
    .filter(Boolean);
  return values.length ? Array.from(new Set(values)) : undefined;
}

/** Parse a URL query string (or Next.js `searchParams`) into typed filters. */
export function deserializeFilters(input: RawSearchParams): SearchFilters {
  const params = toURLSearchParams(input);
  const filters: SearchFilters = {};

  const q = params.get('q')?.trim();
  if (q) filters.q = q;

  const propertyType = readStringList(params, 'propertyType')?.filter(isPropertyType);
  if (propertyType?.length) filters.propertyType = propertyType;

  const saleType = params.get('saleType');
  if (saleType && isSaleType(saleType)) filters.saleType = saleType;

  const status = params.get('status');
  if (status && isPropertyStatus(status)) filters.status = status;

  const finishing = readStringList(params, 'finishing')?.filter(isFinishing);
  if (finishing?.length) filters.finishing = finishing;

  const minPrice = readNumber(params, 'minPrice');
  if (minPrice !== undefined) filters.minPrice = minPrice;
  const maxPrice = readNumber(params, 'maxPrice');
  if (maxPrice !== undefined) filters.maxPrice = maxPrice;

  const minArea = readNumber(params, 'minArea');
  if (minArea !== undefined) filters.minArea = minArea;
  const maxArea = readNumber(params, 'maxArea');
  if (maxArea !== undefined) filters.maxArea = maxArea;

  const bedrooms = readNumberList(params, 'bedrooms');
  if (bedrooms?.length) filters.bedrooms = bedrooms;
  const bathrooms = readNumberList(params, 'bathrooms');
  if (bathrooms?.length) filters.bathrooms = bathrooms;

  const areaId = readStringList(params, 'areaId');
  if (areaId?.length) filters.areaId = areaId;
  const compoundId = readStringList(params, 'compoundId');
  if (compoundId?.length) filters.compoundId = compoundId;
  const developerId = readStringList(params, 'developerId');
  if (developerId?.length) filters.developerId = developerId;
  const amenities = readStringList(params, 'amenities');
  if (amenities?.length) filters.amenities = amenities;

  const deliveryBefore = params.get('deliveryBefore');
  if (deliveryBefore) filters.deliveryBefore = deliveryBefore;

  const maxDownPayment = readNumber(params, 'maxDownPayment');
  if (maxDownPayment !== undefined) filters.maxDownPayment = maxDownPayment;
  const minInstallmentYears = readNumber(params, 'minInstallmentYears');
  if (minInstallmentYears !== undefined) filters.minInstallmentYears = minInstallmentYears;

  const lat = readNumber(params, 'lat');
  const lng = readNumber(params, 'lng');
  if (lat !== undefined && lng !== undefined) {
    filters.lat = lat;
    filters.lng = lng;
    const radiusKm = readNumber(params, 'radiusKm');
    if (radiusKm !== undefined) filters.radiusKm = radiusKm;
  }

  const sort = params.get('sort');
  if (sort && isSearchSort(sort)) filters.sort = sort;

  const page = readNumber(params, 'page');
  if (page !== undefined && page > 1) filters.page = Math.floor(page);

  const limit = readNumber(params, 'limit');
  if (limit !== undefined && limit !== DEFAULT_PAGE_SIZE) filters.limit = Math.floor(limit);

  return filters;
}

/** Typed filters → flat query params (arrays repeat the key). */
export function filtersToQueryParams(filters: SearchFilters): QueryParams {
  const params: QueryParams = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (!value.length) continue;
      params[key] = value as (string | number)[];
      continue;
    }
    params[key] = value as string | number;
  }
  return params;
}

/** Typed filters → `propertyType=villa&propertyType=chalet&minPrice=…`. */
export function serializeFilters(filters: SearchFilters): string {
  const params = new URLSearchParams();
  const ordered: Array<keyof SearchFilters> = [
    'q',
    'saleType',
    'propertyType',
    'areaId',
    'compoundId',
    'developerId',
    'minPrice',
    'maxPrice',
    'bedrooms',
    'bathrooms',
    'minArea',
    'maxArea',
    'finishing',
    'status',
    'amenities',
    'deliveryBefore',
    'maxDownPayment',
    'minInstallmentYears',
    'lat',
    'lng',
    'radiusKm',
    'sort',
    'page',
    'limit',
  ];

  for (const key of ordered) {
    const value = filters[key];
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const entry of value) params.append(key, String(entry));
      continue;
    }
    params.append(key, String(value));
  }

  return params.toString();
}

/** `/search?…` href for a filter set. */
export function filtersToHref(filters: SearchFilters, pathname = '/search'): string {
  const query = serializeFilters(filters);
  return query ? `${pathname}?${query}` : pathname;
}

/** Number of user-applied filters — drives the "Filters (3)" badge. */
export function countActiveFilters(filters: SearchFilters): number {
  let count = 0;
  for (const [key, value] of Object.entries(filters)) {
    if (NON_FILTER_KEYS.includes(key as keyof SearchFilters)) continue;
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length) count += 1;
      continue;
    }
    // lat/lng/radiusKm together count as a single "near me" filter.
    if (key === 'lng' || key === 'radiusKm') continue;
    count += 1;
  }
  return count;
}

export function hasActiveFilters(filters: SearchFilters): boolean {
  return countActiveFilters(filters) > 0;
}

/** Shallow merge that drops emptied keys instead of storing `undefined`. */
export function mergeFilters(base: SearchFilters, patch: Partial<SearchFilters>): SearchFilters {
  const next: SearchFilters = { ...base, ...patch };
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined || value === null || value === '') {
      delete next[key as keyof SearchFilters];
      continue;
    }
    if (Array.isArray(value) && value.length === 0) {
      delete next[key as keyof SearchFilters];
    }
  }
  return next;
}

/** Two filter sets are equal when their canonical query strings match. */
export function filtersEqual(a: SearchFilters, b: SearchFilters): boolean {
  return serializeFilters(a) === serializeFilters(b);
}
