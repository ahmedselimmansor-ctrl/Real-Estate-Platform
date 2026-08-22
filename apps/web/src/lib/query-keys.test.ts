import { describe, expect, it } from 'vitest';

import { queryKeys } from './query-keys';

/**
 * Cache-key bugs are invisible: two queries that should share a key end up with
 * separate caches (stale data on screen), or two that should differ collide
 * (one endpoint's results rendered for another). Invalidation depends on the
 * prefix nesting, so that is what these pin down.
 */

describe('key prefixes nest so invalidation stays surgical', () => {
  it('a detail key starts with its entity root', () => {
    expect(queryKeys.properties.detail('tc-1042').slice(0, 1)).toEqual(queryKeys.properties.all);
    expect(queryKeys.compounds.detail('palm-hills').slice(0, 1)).toEqual(queryKeys.compounds.all);
    expect(queryKeys.leads.detail('l1').slice(0, 1)).toEqual(queryKeys.leads.all);
  });

  it('a list key starts with the lists prefix, so lists can be nuked without details', () => {
    const list = queryKeys.properties.list({ page: 2 });
    expect(list.slice(0, 2)).toEqual(queryKeys.properties.lists());
  });

  it('entity roots are distinct, so invalidating one leaves the others alone', () => {
    const roots = [
      queryKeys.properties.all,
      queryKeys.compounds.all,
      queryKeys.developers.all,
      queryKeys.areas.all,
      queryKeys.amenities.all,
      queryKeys.favorites.all,
      queryKeys.savedSearches.all,
      queryKeys.leads.all,
      queryKeys.search.all,
      queryKeys.auth.all,
      queryKeys.users.all,
      queryKeys.admin.all,
      queryKeys.reports.all,
    ].map((k) => k[0]);

    expect(new Set(roots).size).toBe(roots.length);
  });
});

describe('keys separate what must not share a cache', () => {
  it('different ids do not collide', () => {
    expect(queryKeys.properties.detail('a')).not.toEqual(queryKeys.properties.detail('b'));
  });

  it('a detail and a similar-listing query for the same id stay apart', () => {
    expect(queryKeys.properties.detail('a')).not.toEqual(queryKeys.properties.similar('a'));
  });

  it('search results, facets and the infinite feed are three caches, not one', () => {
    const filters = { q: 'zayed' };
    const keys = [
      JSON.stringify(queryKeys.search.results(filters)),
      JSON.stringify(queryKeys.search.facets(filters)),
      JSON.stringify(queryKeys.search.infinite(filters)),
    ];
    expect(new Set(keys).size).toBe(3);
  });

  it('different filters produce different search keys', () => {
    expect(queryKeys.search.results({ q: 'a' })).not.toEqual(queryKeys.search.results({ q: 'b' }));
  });

  it('autocomplete distinguishes the limit', () => {
    expect(queryKeys.search.autocomplete('new', 5)).not.toEqual(queryKeys.search.autocomplete('new', 10));
  });

  it('autocomplete normalises an absent limit to null rather than leaving a hole', () => {
    expect(queryKeys.search.autocomplete('new')).toEqual([...queryKeys.search.all, 'autocomplete', 'new', null]);
  });
});

describe('keys are stable for equal inputs', () => {
  it('the same params give a deep-equal key', () => {
    expect(queryKeys.properties.list({ page: 1, limit: 24 })).toEqual(
      queryKeys.properties.list({ page: 1, limit: 24 }),
    );
  });

  it('an omitted params object matches an explicit empty one', () => {
    expect(queryKeys.properties.list()).toEqual(queryKeys.properties.list({}));
    expect(queryKeys.compounds.list()).toEqual(queryKeys.compounds.list({}));
    expect(queryKeys.leads.list()).toEqual(queryKeys.leads.list({}));
  });

  it('the map key carries both bounds and filters', () => {
    const bounds = { minLng: 31.4, minLat: 30.0, maxLng: 31.5, maxLat: 30.1 };
    expect(queryKeys.search.map(bounds, { q: 'a' })).not.toEqual(
      queryKeys.search.map(bounds, { q: 'b' }),
    );
  });
});
