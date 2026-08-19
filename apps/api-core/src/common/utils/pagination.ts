import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../constants';
import { PaginatedResult, PaginationMeta } from '../types/api-response';

export interface PaginationInput {
  page?: number;
  limit?: number;
}

export interface NormalizedPagination {
  page: number;
  limit: number;
  skip: number;
}

/** Clamps user supplied pagination to the CONTRACT §4 bounds. */
export function normalizePagination(input: PaginationInput = {}): NormalizedPagination {
  const page = Number.isFinite(input.page)
    ? Math.max(1, Math.trunc(input.page as number))
    : DEFAULT_PAGE;
  const rawLimit = Number.isFinite(input.limit)
    ? Math.trunc(input.limit as number)
    : DEFAULT_PAGE_SIZE;
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, rawLimit));

  return { page, limit, skip: (page - 1) * limit };
}

export function buildPaginationMeta(total: number, input: PaginationInput = {}): PaginationMeta {
  const { page, limit } = normalizePagination(input);
  const safeTotal = Math.max(0, Math.trunc(total));

  return {
    page,
    limit,
    total: safeTotal,
    totalPages: safeTotal === 0 ? 0 : Math.ceil(safeTotal / limit),
  };
}

/** Builds the `{ data, meta }` shape the response interceptor turns into an envelope. */
export function paginate<T>(
  data: T[],
  total: number,
  input: PaginationInput = {},
): PaginatedResult<T> {
  return { data, meta: buildPaginationMeta(total, input) };
}

export type SortDirection = 'asc' | 'desc';

export interface ParsedSort<TField extends string = string> {
  field: TField;
  direction: SortDirection;
}

/**
 * Parses `-price` / `createdAt` style sort params against an allow-list so a
 * caller can never sort by an unindexed or private column.
 */
export function parseSort<TField extends string>(
  sort: string | undefined,
  allowedFields: readonly TField[],
  fallback: ParsedSort<TField>,
): ParsedSort<TField> {
  if (!sort) {
    return fallback;
  }

  const trimmed = sort.trim();
  const direction: SortDirection = trimmed.startsWith('-') ? 'desc' : 'asc';
  const field = trimmed.replace(/^[-+]/, '');

  if (!(allowedFields as readonly string[]).includes(field)) {
    return fallback;
  }

  return { field: field as TField, direction };
}

/** `{ price: 'desc' }` — Prisma `orderBy`. */
export function toPrismaOrderBy<TField extends string>(
  parsed: ParsedSort<TField>,
): Record<string, SortDirection> {
  return { [parsed.field]: parsed.direction };
}

/** `{ price: -1 }` — Mongo `sort`. */
export function toMongoSort<TField extends string>(
  parsed: ParsedSort<TField>,
): Record<string, 1 | -1> {
  return { [parsed.field]: parsed.direction === 'desc' ? -1 : 1 };
}
