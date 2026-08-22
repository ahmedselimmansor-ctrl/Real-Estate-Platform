import { beforeEach, describe, expect, it } from 'vitest';

import { useFiltersStore } from './filters.store';

/**
 * The invariant worth protecting here is the page reset: a visitor on page 5
 * who narrows the filters must land back on page 1, or they get an empty result
 * set for a search that has plenty of matches. Paging itself must *not* reset,
 * which is the easy way to get that wrong.
 */

const get = () => useFiltersStore.getState();

beforeEach(() => {
  useFiltersStore.getState().reset();
});

describe('page reset invariant', () => {
  it('drops back to page 1 when a filter changes', () => {
    get().setPage(5);
    expect(get().filters.page).toBe(5);

    get().setFilter('minPrice', 3_000_000);
    expect(get().filters.page).toBe(1);
  });

  it('stays put when only the page changes', () => {
    get().setFilter('minPrice', 3_000_000);
    get().setPage(4);

    expect(get().filters.page).toBe(4);
    expect(get().filters.minPrice).toBe(3_000_000);
  });

  it.each([
    ['toggleArrayFilter', () => get().toggleArrayFilter('propertyType', 'villa')],
    ['toggleNumberFilter', () => get().toggleNumberFilter('bedrooms', 3)],
    ['setPriceRange', () => get().setPriceRange(1, 2)],
    ['setAreaRange', () => get().setAreaRange(100, 200)],
    ['setSort', () => get().setSort('price_asc')],
    ['setLimit', () => get().setLimit(48)],
    ['clearFilter', () => get().clearFilter('minPrice')],
  ])('%s resets the page too', (_name, mutate) => {
    get().setPage(7);
    mutate();

    expect(get().filters.page).toBe(1);
  });
});

describe('array filters', () => {
  it('toggles a value on, then clears the key entirely when the last one goes', () => {
    get().toggleArrayFilter('propertyType', 'villa');
    expect(get().filters.propertyType).toEqual(['villa']);

    get().toggleArrayFilter('propertyType', 'villa');
    // Not `[]` — mergeFilters deletes emptied arrays so `propertyType=` never
    // reaches the URL or the query key.
    expect(get().filters.propertyType).toBeUndefined();
    expect(get().toQueryString()).not.toContain('propertyType');
  });

  it('accumulates distinct values', () => {
    get().toggleArrayFilter('propertyType', 'villa');
    get().toggleArrayFilter('propertyType', 'chalet');

    expect(get().filters.propertyType).toEqual(['villa', 'chalet']);
  });

  it('keeps numeric filters sorted so 4 then 3 reads as 3, 4', () => {
    get().toggleNumberFilter('bedrooms', 4);
    get().toggleNumberFilter('bedrooms', 3);

    expect(get().filters.bedrooms).toEqual([3, 4]);
  });
});

describe('setFilters and reset', () => {
  it('replaces rather than merges, so a stale filter cannot survive', () => {
    get().setFilter('minPrice', 1);
    get().setFilters({ q: 'zayed' });

    expect(get().filters.q).toBe('zayed');
    expect(get().filters.minPrice).toBeUndefined();
  });

  it('mirrors the committed filters into the draft', () => {
    get().setFilters({ q: 'zayed' });

    expect(get().draft.q).toBe('zayed');
  });

  it('returns to the defaults on reset', () => {
    get().setFilter('minPrice', 5_000_000);
    get().setPage(3);
    get().reset();

    expect(get().filters.minPrice).toBeUndefined();
    expect(get().filters.page).toBe(1);
  });
});

describe('the draft, which backs the filter sheet', () => {
  it('opens as a copy of the committed filters', () => {
    get().setFilter('minPrice', 2_000_000);
    get().openDraft();

    expect(get().draft.minPrice).toBe(2_000_000);
  });

  it('edits in isolation — the committed set does not move until applied', () => {
    get().openDraft();
    get().patchDraft({ minPrice: 9_000_000 });

    expect(get().draft.minPrice).toBe(9_000_000);
    expect(get().filters.minPrice).toBeUndefined();
  });

  it('resets the draft without touching the committed filters', () => {
    get().setFilter('minPrice', 2_000_000);
    get().openDraft();
    get().patchDraft({ minPrice: 9_000_000 });
    get().resetDraft();

    expect(get().draft.minPrice).toBeUndefined();
    expect(get().filters.minPrice).toBe(2_000_000);
  });
});

describe('serialisation round trip', () => {
  it('survives a trip through the query string', () => {
    get().setFilter('minPrice', 3_000_000);
    get().toggleArrayFilter('propertyType', 'villa');
    const query = get().toQueryString();

    get().reset();
    get().syncFromQueryString(query);

    expect(get().filters.minPrice).toBe(3_000_000);
    expect(get().filters.propertyType).toEqual(['villa']);
  });

  it('builds an href on the given pathname', () => {
    get().setFilter('q', 'zayed');

    expect(get().toHref('/map')).toContain('/map?');
    expect(get().toHref()).toContain('/search?');
  });
});

describe('activeCount', () => {
  it('ignores the defaults so a fresh search shows no filter badge', () => {
    expect(get().activeCount()).toBe(0);
  });

  it('counts a user-applied filter', () => {
    get().setFilter('minPrice', 3_000_000);

    expect(get().activeCount()).toBe(1);
  });

  it('does not count paging or sorting as filters', () => {
    get().setPage(3);
    get().setSort('price_asc');

    expect(get().activeCount()).toBe(0);
  });
});
