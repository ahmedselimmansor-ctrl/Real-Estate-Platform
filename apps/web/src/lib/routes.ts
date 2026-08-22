import { filtersToHref } from './filters';
import type { SearchFilters } from '@/types/search';

/**
 * Single source of truth for internal hrefs. Every link in the app goes
 * through here so a route rename is one edit, not fifty.
 */
export const routes = {
  home: '/',

  search: (filters: SearchFilters = {}) => filtersToHref(filters, '/search'),

  buy: '/search?saleType=primary',
  rent: '/search?saleType=rent',

  property: (slug: string) => `/property/${slug}`,

  compounds: '/compounds',
  compound: (slug: string) => `/compounds/${slug}`,

  developers: '/developers',
  developer: (slug: string) => `/developers/${slug}`,

  areas: '/areas',
  area: (slug: string) => `/areas/${slug}`,

  topchoiceNow: '/topchoice-now',
  sell: '/sell',
  favorites: '/favorites',
  compare: '/compare',
  savedSearches: '/saved-searches',
  mortgageCalculator: '/mortgage-calculator',

  // Staff only — the storefront needs no account, so there is no /register.
  login: '/login',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',

  account: '/account',

  admin: '/admin',
  adminLeads: '/admin/leads',

  about: '/about',
  contact: '/contact',
  terms: '/terms',
  privacy: '/privacy',
} as const;

/** Route an autocomplete suggestion to its destination page. */
export function suggestionHref(suggestion: {
  type: string;
  slug: string;
  text: string;
}): string {
  switch (suggestion.type) {
    case 'property':
      return routes.property(suggestion.slug);
    case 'compound':
      return routes.compound(suggestion.slug);
    case 'developer':
      return routes.developer(suggestion.slug);
    case 'area':
      return routes.area(suggestion.slug);
    default:
      return routes.search({ q: suggestion.text });
  }
}

export type Routes = typeof routes;
