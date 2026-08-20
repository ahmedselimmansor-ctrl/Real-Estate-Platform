import { describe, expect, it } from 'vitest';

import {
  countActiveFilters,
  deserializeFilters,
  filtersEqual,
  filtersToHref,
  hasActiveFilters,
  mergeFilters,
  serializeFilters,
} from './filters';
import type { SearchFilters } from '@/types/search';

/**
 * Every shared search link, every "back" out of a listing and the whole filter
 * sidebar depend on this round trip. If a filter survives serialization but not
 * deserialization the failure is silent: the visitor gets results for a query
 * they did not ask for, and nothing throws.
 */
describe('filters round trip', () => {
  it('survives a full set of filters unchanged', () => {
    const filters: SearchFilters = {
      q: 'new cairo',
      saleType: 'primary',
      propertyType: ['apartment', 'villa'],
      minPrice: 3_000_000,
      maxPrice: 12_000_000,
      bedrooms: [3, 4],
      minArea: 120,
      maxArea: 400,
      finishing: ['fully_finished'],
      status: 'available',
      sort: 'price_asc',
      page: 2,
    };

    expect(deserializeFilters(serializeFilters(filters))).toEqual(filters);
  });

  it('keeps every value of a repeated parameter rather than the last one', () => {
    const filters = deserializeFilters('propertyType=apartment&propertyType=villa&bedrooms=3&bedrooms=4');

    expect(filters.propertyType).toEqual(['apartment', 'villa']);
    expect(filters.bedrooms).toEqual([3, 4]);
  });

  it('reads numbers as numbers, not the strings the URL carries', () => {
    const filters = deserializeFilters('minPrice=3000000&maxPrice=12000000&page=2');

    expect(filters.minPrice).toBe(3_000_000);
    expect(filters.maxPrice).toBe(12_000_000);
    expect(filters.page).toBe(2);
  });

  it('drops values the API would reject instead of forwarding them', () => {
    const filters = deserializeFilters('propertyType=spaceship&saleType=barter&status=imaginary');

    expect(filters.propertyType).toBeUndefined();
    expect(filters.saleType).toBeUndefined();
    expect(filters.status).toBeUndefined();
  });

  it('ignores an empty query string rather than searching for ""', () => {
    expect(deserializeFilters('q=%20%20')).toEqual({});
  });

  it('accepts the object form Next hands a server component', () => {
    const filters = deserializeFilters({ q: 'zayed', propertyType: ['villa'], minPrice: '5000000' });

    expect(filters).toEqual({ q: 'zayed', propertyType: ['villa'], minPrice: 5_000_000 });
  });
});

describe('serializeFilters', () => {
  it('orders keys deterministically so the same filters give the same URL', () => {
    const a = serializeFilters({ minPrice: 1_000_000, q: 'zayed', saleType: 'resale' });
    const b = serializeFilters({ saleType: 'resale', q: 'zayed', minPrice: 1_000_000 });

    expect(a).toBe(b);
    // A cache key and a browser history entry both key off this string.
    expect(a).toBe('q=zayed&saleType=resale&minPrice=1000000');
  });

  it('omits empty arrays and blank strings entirely', () => {
    expect(serializeFilters({ propertyType: [], q: '', bedrooms: [] })).toBe('');
  });
});

describe('filtersToHref', () => {
  it('returns the bare path when nothing is filtered', () => {
    expect(filtersToHref({})).toBe('/search');
  });

  it('appends the query when something is', () => {
    expect(filtersToHref({ q: 'zayed' })).toBe('/search?q=zayed');
  });

  it('honours a different pathname, which is how /map reuses it', () => {
    expect(filtersToHref({ q: 'zayed' }, '/map')).toBe('/map?q=zayed');
  });
});

describe('countActiveFilters', () => {
  it('counts an array as one filter, not one per value', () => {
    expect(countActiveFilters({ propertyType: ['villa', 'chalet', 'townhouse'] })).toBe(1);
  });

  it('ignores paging and sorting, which are not filters the visitor set', () => {
    expect(countActiveFilters({ page: 3, limit: 24, sort: 'price_asc' })).toBe(0);
  });

  it('agrees with hasActiveFilters', () => {
    expect(hasActiveFilters({ page: 2 })).toBe(false);
    expect(hasActiveFilters({ minPrice: 5_000_000 })).toBe(true);
  });
});

describe('mergeFilters', () => {
  it('applies the patch over the base', () => {
    expect(mergeFilters({ q: 'zayed', minPrice: 1 }, { minPrice: 2 })).toMatchObject({
      q: 'zayed',
      minPrice: 2,
    });
  });

  it('clears a filter when the patch sets it undefined', () => {
    expect(mergeFilters({ q: 'zayed' }, { q: undefined }).q).toBeUndefined();
  });
});

describe('filtersEqual', () => {
  it('is insensitive to key order', () => {
    expect(filtersEqual({ q: 'a', minPrice: 1 }, { minPrice: 1, q: 'a' })).toBe(true);
  });

  it('separates genuinely different filter sets', () => {
    expect(filtersEqual({ minPrice: 1 }, { minPrice: 2 })).toBe(false);
  });
});
