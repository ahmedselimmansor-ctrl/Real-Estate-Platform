/** CONTRACT §4 response envelopes — shared by every service. */

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  /** Present only on paginated endpoints. */
  meta?: PaginationMeta;
}

export interface ApiErrorDetail {
  field?: string;
  message: string;
  /** Machine readable hint, e.g. the failed class-validator constraint. */
  rule?: string;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details: ApiErrorDetail[];
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorBody;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/** What paginated services return before the interceptor wraps it. */
export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}

/** CONTRACT §4 health payload. */
export type DependencyStatus = 'up' | 'down';

export interface HealthResponse {
  status: 'ok' | 'error';
  service: string;
  version: string;
  deps: Record<string, DependencyStatus>;
}
