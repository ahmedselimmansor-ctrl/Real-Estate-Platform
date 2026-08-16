import type { Nullable, PaginationMeta } from './common';
import type { Finishing, PropertyStatus, PropertyType, SaleType, SearchSort } from './enums';
import type { PropertySearchHit } from './property';

/**
 * CONTRACT §6 — `GET /api/search` query surface. Field names here are the exact
 * query-string keys accepted by search-svc; `filters.store.ts` serialises this
 * object straight into a `URLSearchParams`.
 */
export interface SearchFilters {
  q?: string;
  propertyType?: PropertyType[];
  saleType?: SaleType;
  minPrice?: number;
  maxPrice?: number;
  bedrooms?: number[];
  bathrooms?: number[];
  minArea?: number;
  maxArea?: number;
  areaId?: string[];
  compoundId?: string[];
  developerId?: string[];
  amenities?: string[];
  finishing?: Finishing[];
  status?: PropertyStatus;
  /** ISO date — handover on/before this date. */
  deliveryBefore?: string;
  maxDownPayment?: number;
  minInstallmentYears?: number;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  sort?: SearchSort;
  page?: number;
  limit?: number;
}

export type SearchFilterKey = keyof SearchFilters;

export interface SearchResponse {
  /** search-svc names this `results`; `hits` is accepted as a fallback. */
  results?: PropertySearchHit[];
  hits?: PropertySearchHit[];
  /** Present when the request asked for `facets=true`. */
  facets?: SearchFacets;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  took?: number;
  /** Echoed back so the UI can prove what was actually queried. */
  appliedFilters?: Partial<SearchFilters>;
}

export interface FacetBucket {
  /** The filter value to send back, e.g. `apartment` or `3`. */
  value: string | number;
  label?: string;
  labelAr?: Nullable<string>;
  slug?: Nullable<string>;
  count: number;
}

export interface RangeFacetStats {
  min: number;
  max: number;
  avg?: number;
  count?: number;
}

export interface HistogramBucket {
  key: number;
  min: number;
  max: number;
  count: number;
}

/** `price` / `areaSqm` — summary stats plus a histogram for the range slider. */
export interface RangeFacet {
  stats: RangeFacetStats;
  interval?: number;
  histogram?: HistogramBucket[];
}

/** `GET /api/search/facets` — aggregation buckets that drive the sidebar. */
export interface SearchFacets {
  propertyType: FacetBucket[];
  saleType: FacetBucket[];
  finishing: FacetBucket[];
  status: FacetBucket[];
  bedrooms: FacetBucket[];
  bathrooms: FacetBucket[];
  /** Bucket `value` is the area/compound/developer **id**; `slug` is its href. */
  areas: FacetBucket[];
  compounds: FacetBucket[];
  developers: FacetBucket[];
  amenities: FacetBucket[];
  deliveryYear: FacetBucket[];
  installmentYears: FacetBucket[];
  price: RangeFacet;
  areaSqm: RangeFacet;
  total?: number;
}

export type AutocompleteType =
  | 'property'
  | 'compound'
  | 'developer'
  | 'area'
  | 'query'
  | 'city';

export interface AutocompleteSuggestion {
  text: string;
  type: AutocompleteType;
  id: string;
  slug: string;
  subtitle?: string;
  count?: number;
}

export interface AutocompleteResponse {
  suggestions: AutocompleteSuggestion[];
}

export interface MapBounds {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export interface MapCluster {
  key: string;
  lat: number;
  lng: number;
  count: number;
  avgPrice?: number;
  /** Present when the cluster resolves to a single listing. */
  propertyId?: string;
  slug?: string;
}

export interface MapSearchResponse {
  clusters: MapCluster[];
  total: number;
}

/** Paginated search results after envelope normalisation. */
export interface SearchResults {
  hits: PropertySearchHit[];
  meta: PaginationMeta;
  /** Only when the request passed `facets=true`. */
  facets?: SearchFacets;
  took?: number;
}
