import type { Nullable } from './common';
import type { LeadStatus, UserRole } from './enums';
import type { Property } from './property';
import type { SearchFilters } from './search';

/** Identity + user-owned records (api-core / Postgres). */

export interface User {
  id: string;
  name: string;
  email: string;
  phone: Nullable<string>;
  role: UserRole;
  avatarUrl: Nullable<string>;
  emailVerified?: boolean;
  locale?: string;
  createdAt: string;
  updatedAt?: string;
}

/** Decoded access-token claims (CONTRACT §5 — exact keys). */
export interface AccessTokenClaims {
  sub: string;
  email: string;
  role: UserRole;
  name: string;
  jti: string;
  iss: 'nawy-api';
  aud: 'nawy-clients';
  iat: number;
  exp: number;
}

export interface AuthSession {
  user: User;
  accessToken: string;
  /** Epoch ms parsed from the token `exp`, when available. */
  expiresAt?: number;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

export interface ForgotPasswordPayload {
  email: string;
}

export interface ResetPasswordPayload {
  token: string;
  password: string;
}

export interface Favorite {
  id: string;
  userId: string;
  propertyId: string;
  createdAt: string;
  /** api-core hydrates the listing on `GET /favorites`. */
  property?: Property;
}

export interface SavedSearch {
  id: string;
  userId: string;
  name: string;
  filters: SearchFilters;
  /** Serialized query string so the UI can restore the exact results page. */
  queryString?: string;
  alertsEnabled: boolean;
  lastRunAt: Nullable<string>;
  createdAt: string;
}

export interface CreateSavedSearchPayload {
  name: string;
  filters: SearchFilters;
  alertsEnabled?: boolean;
}

/** `GET /api/v1/admin/stats` — dashboard KPIs (CONTRACT §6). */
export interface AdminStats {
  properties: {
    total: number;
    available: number;
    sold: number;
    reserved: number;
    featured: number;
    newThisMonth: number;
    soldThisMonth: number;
    portfolioValue: number;
    avgPrice: number;
    avgPricePerMeter: number;
  };
  users: { total: number; byRole: Record<UserRole, number>; newThisMonth: number };
  leads: { total: number; byStatus: Record<LeadStatus, number>; newThisMonth: number };
  engagement: { totalViews: number; totalFavorites: number; totalLeads: number };
  topAreas: { areaId: string; areaName: string; count: number; avgPrice: number }[];
  topDevelopers: { developerId: string; developerName: string; count: number }[];
  trend: { month: string; listings: number; leads: number }[];
}
