/** CONTRACT §4 — HTTP envelope + pagination shapes shared by every service. */

/** Bilingual string blocks used across the domain (`title`, `description`, …). */
export interface LocalizedText {
  en: string;
  ar: string;
}

export interface GeoPoint {
  /** GeoJSON: [lng, lat] */
  type: 'Point';
  coordinates: [number, number];
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown[];
}

export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiErrorEnvelope {
  success: false;
  error: ApiErrorPayload;
}

export type ApiEnvelope<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope;

/** Client-side normalisation of `{ data: T[], meta }` into one object. */
export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  /** e.g. `-price`, `createdAt` (CONTRACT §4). */
  sort?: string;
}

/** Health payload exposed by every service (CONTRACT §4). */
export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  service: string;
  version: string;
  deps?: Record<string, unknown>;
}

export type Nullable<T> = T | null;
export type QueryPrimitive = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryPrimitive | QueryPrimitive[]>;
