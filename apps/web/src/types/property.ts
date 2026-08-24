import type { GeoPoint, LocalizedText, Nullable } from './common';
import type { Finishing, PropertyStatus, PropertyType, SaleType } from './enums';

/** CONTRACT §3 — canonical Mongo `properties` document, as served by api-core. */

export interface PropertyPrice {
  amount: number;
  currency: 'EGP';
  pricePerMeter: number;
}

export interface PropertyPaymentPlan {
  downPaymentPercent: number;
  installmentYears: number;
  monthlyInstallment: number;
  /** ISO date (`2027-06-30`). */
  deliveryDate: string;
}

export interface PropertySpecs {
  bedrooms: number;
  bathrooms: number;
  areaSqm: number;
  gardenSqm: number;
  floor: number;
  parkingSpots: number;
}

export interface PropertyLocation {
  areaId: string;
  areaName: string;
  city: string;
  governorate: string;
  address: string;
  geo: GeoPoint;
}

export interface PropertyCompoundRef {
  id: string;
  name: string;
  slug: string;
}

export interface PropertyDeveloperRef {
  id: string;
  name: string;
  slug: string;
  logoUrl?: Nullable<string>;
}

export interface PropertyImage {
  url: string;
  key: string;
  width: number;
  height: number;
  isPrimary: boolean;
  order: number;
}

export interface PropertyFloorPlan {
  url: string;
  label: string;
}

export interface PropertyMedia {
  images: PropertyImage[];
  floorPlans: PropertyFloorPlan[];
  videoUrl: Nullable<string>;
  tourUrl: Nullable<string>;
}

export interface PropertyStats {
  views: number;
  favorites: number;
  leads: number;
}

export interface Property {
  /**
   * The listing's identity everywhere — identical to Postgres
   * `property_index.id` and to the Elasticsearch document id, which is why
   * favourites, leads and view tracking all key on it.
   *
   * There is deliberately no `id` alongside it. This interface used to declare
   * one, documented as "Mongo `_id` serialised as a string by api-core", but
   * nothing performs that mapping: the service returns lean documents, so a
   * response carries a raw `_id` and no `id` at all. Because the type asserted
   * the field, `property.id` type-checked everywhere while being `undefined` at
   * runtime, and five React lists were keyed on it.
   */
  propertyId: string;
  slug: string;
  referenceNo: string;
  title: LocalizedText;
  description: LocalizedText;
  propertyType: PropertyType;
  saleType: SaleType;
  status: PropertyStatus;
  finishing: Finishing;
  price: PropertyPrice;
  paymentPlan: PropertyPaymentPlan;
  specs: PropertySpecs;
  location: PropertyLocation;
  compound: Nullable<PropertyCompoundRef>;
  developer: Nullable<PropertyDeveloperRef>;
  /** Amenity slugs (`pool`, `gym`, …). */
  amenities: string[];
  media: PropertyMedia;
  stats: PropertyStats;
  isFeatured: boolean;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: Nullable<string>;
}

/**
 * Flattened Elasticsearch hit returned by search-svc (CONTRACT §3,
 * index `properties_v1`). Deliberately narrower than `Property`.
 */
export interface PropertySearchHit {
  id: string;
  slug: string;
  referenceNo: string;
  title: LocalizedText;
  description: LocalizedText;
  /** EGP. Flat on the hit — the nested `price` object is the api-core shape. */
  price: number;
  currency: 'EGP';
  pricePerMeter: number;
  propertyType: PropertyType;
  saleType: SaleType;
  status: PropertyStatus;
  finishing: Finishing;
  specs: PropertySpecs;
  paymentPlan: PropertyPaymentPlan & { downPaymentAmount: number };

  areaId: string;
  areaName: string;
  areaSlug: string;
  city: string;
  compoundId: Nullable<string>;
  compoundName: Nullable<string>;
  compoundSlug: Nullable<string>;
  developerId: Nullable<string>;
  developerName: Nullable<string>;
  developerSlug: Nullable<string>;

  amenities: string[];
  primaryImage: Nullable<string>;
  isFeatured: boolean;
  geo: { lat: number; lng: number };
  publishedAt: string;

  /** Relevance score when `sort=relevance`. */
  score?: number;
  /** Set when the query supplied `lat`/`lng`. */
  distanceKm?: Nullable<number>;
  /** Elasticsearch highlight fragments, when `q` was supplied. */
  highlight?: Record<string, string[]>;
}


/** api-core `GET /properties` basic (non-Elasticsearch) filters. */
export interface PropertyListParams {
  page?: number;
  limit?: number;
  sort?: string;
  propertyType?: PropertyType;
  saleType?: SaleType;
  status?: PropertyStatus;
  areaId?: string;
  compoundId?: string;
  developerId?: string;
  isFeatured?: boolean;
  minPrice?: number;
  maxPrice?: number;
  q?: string;
}
