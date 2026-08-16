import {
  buildPaginationMeta,
  normalizePagination,
  paginate,
  parseSort,
  toMongoSort,
  toPrismaOrderBy,
} from './pagination';

describe('normalizePagination', () => {
  it('applies CONTRACT §4 defaults', () => {
    expect(normalizePagination()).toEqual({ page: 1, limit: 20, skip: 0 });
  });

  it('clamps the limit to 100 and the page to 1', () => {
    expect(normalizePagination({ page: 0, limit: 5_000 })).toEqual({
      page: 1,
      limit: 100,
      skip: 0,
    });
  });

  it('computes the offset', () => {
    expect(normalizePagination({ page: 4, limit: 25 })).toEqual({ page: 4, limit: 25, skip: 75 });
  });
});

describe('buildPaginationMeta', () => {
  it('matches the contract example', () => {
    expect(buildPaginationMeta(134, { page: 1, limit: 20 })).toEqual({
      page: 1,
      limit: 20,
      total: 134,
      totalPages: 7,
    });
  });

  it('reports zero pages for an empty result set', () => {
    expect(buildPaginationMeta(0, { page: 1, limit: 20 }).totalPages).toBe(0);
  });
});

describe('paginate', () => {
  it('returns the { data, meta } shape the interceptor unwraps', () => {
    const result = paginate([{ id: 'a' }], 1, { page: 1, limit: 20 });
    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(1);
    expect(result.meta.totalPages).toBe(1);
  });
});

describe('parseSort', () => {
  const allowed = ['price', 'createdAt'] as const;
  const fallback = { field: 'createdAt' as const, direction: 'desc' as const };

  it('parses a descending sort', () => {
    expect(parseSort('-price', allowed, fallback)).toEqual({ field: 'price', direction: 'desc' });
  });

  it('parses an ascending sort', () => {
    expect(parseSort('price', allowed, fallback)).toEqual({ field: 'price', direction: 'asc' });
  });

  it('falls back for unknown fields', () => {
    expect(parseSort('-passwordHash', allowed, fallback)).toEqual(fallback);
    expect(parseSort(undefined, allowed, fallback)).toEqual(fallback);
  });

  it('maps onto Prisma and Mongo sort objects', () => {
    const parsed = parseSort('-price', allowed, fallback);
    expect(toPrismaOrderBy(parsed)).toEqual({ price: 'desc' });
    expect(toMongoSort(parsed)).toEqual({ price: -1 });
  });
});
