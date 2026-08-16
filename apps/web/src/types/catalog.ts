import type { Nullable } from './common';
import type { PropertyType } from './enums';

/**
 * Developers, compounds, areas and amenities: the Postgres-owned catalog.
 *
 * Shapes mirror what api-core actually serves. Bilingual copy arrives as flat
 * `descriptionEn` / `descriptionAr` columns and coordinates as `lat` / `lng`,
 * rather than the nested objects the Mongo listing document uses.
 */

export interface Developer {
  id: string;
  slug: string;
  name: string;
  nameAr: string;
  logoUrl: Nullable<string>;
  coverUrl: Nullable<string>;
  descriptionEn: Nullable<string>;
  descriptionAr: Nullable<string>;
  foundedYear: Nullable<number>;
  projectsCount: number;
  website: Nullable<string>;
  phone: Nullable<string>;
  isFeatured: boolean;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  /** Present on the detail endpoint. */
  compoundCount?: number;
  propertyCount?: number;
}

export interface Area {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  city: string;
  governorate: string;
  descriptionEn: Nullable<string>;
  descriptionAr: Nullable<string>;
  lat: number;
  lng: number;
  heroImage: Nullable<string>;
  propertyCount: number;
  avgPricePerMeter: Nullable<number>;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  /** Present on the detail endpoint. */
  compoundCount?: number;
  developerCount?: number;
  priceRange?: Nullable<{ min: number; max: number }>;
}

/** The subset of a developer/area embedded in a compound listing row. */
export interface DeveloperRef {
  id: string;
  slug: string;
  name: string;
  nameAr: string;
  logoUrl: Nullable<string>;
}

export interface AreaRef {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  city: string;
}

export interface Compound {
  id: string;
  slug: string;
  name: string;
  nameAr: string;
  developerId: string;
  areaId: string;
  descriptionEn: Nullable<string>;
  descriptionAr: Nullable<string>;
  startingPrice: Nullable<number>;
  maxPrice: Nullable<number>;
  minAreaSqm: Nullable<number>;
  maxAreaSqm: Nullable<number>;
  deliveryYear: Nullable<number>;
  installmentYears: Nullable<number>;
  downPaymentPercent: Nullable<number>;
  images: string[];
  masterPlanUrl: Nullable<string>;
  lat: number;
  lng: number;
  unitTypes: PropertyType[];
  isFeatured: boolean;
  isActive: boolean;
  developer: DeveloperRef;
  area: AreaRef;
  createdAt?: string;
  updatedAt?: string;
  /** Present on the detail endpoint. */
  amenities?: Amenity[];
  paymentPlans?: PaymentPlan[];
  propertyCount?: number;
  priceRange?: Nullable<{ min: number; max: number }>;
}

export interface PaymentPlan {
  id: string;
  compoundId: string;
  name: string;
  downPaymentPercent: number;
  installmentYears: number;
  monthlyInstallment: Nullable<number>;
  deliveryDate: Nullable<string>;
  description: Nullable<string>;
  isDefault: boolean;
}

export type AmenityCategory = 'lifestyle' | 'family' | 'wellness' | 'security' | 'services';

export interface Amenity {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  /** kebab-case lucide icon name, e.g. `shield-check`. */
  icon: string;
  category: AmenityCategory;
}
