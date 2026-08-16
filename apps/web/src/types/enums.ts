/**
 * CONTRACT §3 — canonical enum strings. These exact values are shared by
 * api-core (TS), search-svc (Python), rag-svc (Python), reports-svc (Ruby) and
 * Elasticsearch. Never localise or re-case them on the wire.
 */

export const PROPERTY_TYPES = [
  'apartment',
  'villa',
  'townhouse',
  'twinhouse',
  'duplex',
  'penthouse',
  'studio',
  'chalet',
  'office',
  'retail',
  'clinic',
] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const SALE_TYPES = ['primary', 'resale', 'rent'] as const;
export type SaleType = (typeof SALE_TYPES)[number];

export const PROPERTY_STATUSES = ['available', 'reserved', 'sold', 'off_plan', 'delivered'] as const;
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];

export const FINISHING_TYPES = [
  'core_shell',
  'semi_finished',
  'fully_finished',
  'furnished',
] as const;
export type Finishing = (typeof FINISHING_TYPES)[number];

export const USER_ROLES = ['user', 'agent', 'admin', 'superadmin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const LEAD_STATUSES = [
  'new',
  'contacted',
  'qualified',
  'viewing',
  'negotiating',
  'won',
  'lost',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** search-svc `sort` values (CONTRACT §6). */
export const SEARCH_SORTS = [
  'relevance',
  'price_asc',
  'price_desc',
  'newest',
  'area_desc',
] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];

/** Supported UI locales. Arabic flips the document to RTL. */
export const LOCALES = ['en', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];
export type Direction = 'ltr' | 'rtl';

export function isPropertyType(value: string): value is PropertyType {
  return (PROPERTY_TYPES as readonly string[]).includes(value);
}

export function isSaleType(value: string): value is SaleType {
  return (SALE_TYPES as readonly string[]).includes(value);
}

export function isPropertyStatus(value: string): value is PropertyStatus {
  return (PROPERTY_STATUSES as readonly string[]).includes(value);
}

export function isFinishing(value: string): value is Finishing {
  return (FINISHING_TYPES as readonly string[]).includes(value);
}

export function isSearchSort(value: string): value is SearchSort {
  return (SEARCH_SORTS as readonly string[]).includes(value);
}

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}
