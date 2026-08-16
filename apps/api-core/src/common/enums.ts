/**
 * CONTRACT §3 enums. These exact strings are shared by TypeScript, Python, Ruby,
 * Elasticsearch and the UI — never translate, capitalise or alias them.
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

export const PROPERTY_STATUSES = [
  'available',
  'reserved',
  'sold',
  'off_plan',
  'delivered',
] as const;
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];

export const FINISHING_TYPES = [
  'core_shell',
  'semi_finished',
  'fully_finished',
  'furnished',
] as const;
export type FinishingType = (typeof FINISHING_TYPES)[number];

export const USER_ROLES = ['user', 'agent', 'admin', 'superadmin'] as const;
export type UserRoleValue = (typeof USER_ROLES)[number];

export const LEAD_STATUSES = [
  'new',
  'contacted',
  'qualified',
  'viewing',
  'negotiating',
  'won',
  'lost',
] as const;
export type LeadStatusValue = (typeof LEAD_STATUSES)[number];

/** Currency is EGP everywhere in this marketplace. */
export const CURRENCIES = ['EGP'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Roles that may manage catalogue content. */
export const STAFF_ROLES: readonly UserRoleValue[] = ['agent', 'admin', 'superadmin'];

/** Roles with full administrative access. */
export const ADMIN_ROLES: readonly UserRoleValue[] = ['admin', 'superadmin'];

const includes = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (values as readonly string[]).includes(value);

export const isPropertyType = (value: unknown): value is PropertyType =>
  includes(PROPERTY_TYPES, value);
export const isSaleType = (value: unknown): value is SaleType => includes(SALE_TYPES, value);
export const isPropertyStatus = (value: unknown): value is PropertyStatus =>
  includes(PROPERTY_STATUSES, value);
export const isFinishingType = (value: unknown): value is FinishingType =>
  includes(FINISHING_TYPES, value);
export const isUserRole = (value: unknown): value is UserRoleValue => includes(USER_ROLES, value);
export const isLeadStatus = (value: unknown): value is LeadStatusValue =>
  includes(LEAD_STATUSES, value);
