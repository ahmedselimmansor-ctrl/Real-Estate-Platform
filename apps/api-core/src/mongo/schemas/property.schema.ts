import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import {
  CURRENCIES,
  Currency,
  FINISHING_TYPES,
  FinishingType,
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  PropertyStatus,
  PropertyType,
  SALE_TYPES,
  SaleType,
} from '../../common/enums';

/**
 * CONTRACT §3 — the canonical listing document (MongoDB `nawy.properties`).
 * Elasticsearch holds a denormalised copy; Postgres holds the thin
 * `property_index` mirror. This document is the source of truth.
 */

@Schema({ _id: false })
export class LocalizedText {
  @Prop({ type: String, required: true, trim: true })
  en: string;

  @Prop({ type: String, required: true, trim: true })
  ar: string;
}
export const LocalizedTextSchema = SchemaFactory.createForClass(LocalizedText);

@Schema({ _id: false })
export class PropertyPrice {
  /** EGP integer, 2,000,000 – 95,000,000 in the seeded dataset. */
  @Prop({ type: Number, required: true, min: 0 })
  amount: number;

  @Prop({ type: String, required: true, enum: CURRENCIES, default: 'EGP' })
  currency: Currency;

  @Prop({ type: Number, required: true, min: 0 })
  pricePerMeter: number;
}
export const PropertyPriceSchema = SchemaFactory.createForClass(PropertyPrice);

@Schema({ _id: false })
export class PropertyPaymentPlan {
  @Prop({ type: Number, required: true, min: 0, max: 100 })
  downPaymentPercent: number;

  @Prop({ type: Number, required: true, min: 0 })
  installmentYears: number;

  @Prop({ type: Number, required: true, min: 0 })
  monthlyInstallment: number;

  /** ISO date (YYYY-MM-DD) — kept as a string exactly as the contract shows. */
  @Prop({ type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ })
  deliveryDate: string;
}
export const PropertyPaymentPlanSchema = SchemaFactory.createForClass(PropertyPaymentPlan);

@Schema({ _id: false })
export class PropertySpecs {
  @Prop({ type: Number, required: true, min: 0 })
  bedrooms: number;

  @Prop({ type: Number, required: true, min: 0 })
  bathrooms: number;

  @Prop({ type: Number, required: true, min: 0 })
  areaSqm: number;

  @Prop({ type: Number, default: 0, min: 0 })
  gardenSqm: number;

  @Prop({ type: Number, default: 0 })
  floor: number;

  @Prop({ type: Number, default: 0, min: 0 })
  parkingSpots: number;
}
export const PropertySpecsSchema = SchemaFactory.createForClass(PropertySpecs);

/** GeoJSON Point — `[lng, lat]`, indexed with 2dsphere. */
@Schema({ _id: false })
export class GeoPoint {
  @Prop({ type: String, required: true, enum: ['Point'], default: 'Point' })
  type: 'Point';

  @Prop({ type: [Number], required: true })
  coordinates: number[];
}
export const GeoPointSchema = SchemaFactory.createForClass(GeoPoint);

@Schema({ _id: false })
export class PropertyLocation {
  /** → Postgres `areas.id` / `seed/areas.json[].id`. */
  @Prop({ type: String, required: true })
  areaId: string;

  @Prop({ type: String, required: true, trim: true })
  areaName: string;

  @Prop({ type: String, required: true, trim: true })
  city: string;

  @Prop({ type: String, required: true, trim: true })
  governorate: string;

  @Prop({ type: String, default: '' })
  address: string;

  @Prop({ type: GeoPointSchema, required: true })
  geo: GeoPoint;
}
export const PropertyLocationSchema = SchemaFactory.createForClass(PropertyLocation);

@Schema({ _id: false, id: false })
export class CompoundRef {
  /** → Postgres `compounds.id`. */
  @Prop({ type: String, required: true })
  id: string;

  @Prop({ type: String, required: true, trim: true })
  name: string;

  @Prop({ type: String, required: true, trim: true })
  slug: string;
}
export const CompoundRefSchema = SchemaFactory.createForClass(CompoundRef);

@Schema({ _id: false, id: false })
export class DeveloperRef {
  /** → Postgres `developers.id`. */
  @Prop({ type: String, required: true })
  id: string;

  @Prop({ type: String, required: true, trim: true })
  name: string;

  @Prop({ type: String, required: true, trim: true })
  slug: string;

  @Prop({ type: String, default: null })
  logoUrl: string | null;
}
export const DeveloperRefSchema = SchemaFactory.createForClass(DeveloperRef);

@Schema({ _id: false })
export class PropertyImage {
  @Prop({ type: String, required: true })
  url: string;

  /** S3 object key under `S3_PUBLIC_BASE_URL`, e.g. `properties/<slug>/1.jpg`. */
  @Prop({ type: String, required: true })
  key: string;

  @Prop({ type: Number, default: 1600 })
  width: number;

  @Prop({ type: Number, default: 900 })
  height: number;

  @Prop({ type: Boolean, default: false })
  isPrimary: boolean;

  @Prop({ type: Number, default: 0 })
  order: number;
}
export const PropertyImageSchema = SchemaFactory.createForClass(PropertyImage);

@Schema({ _id: false })
export class FloorPlan {
  @Prop({ type: String, required: true })
  url: string;

  @Prop({ type: String, default: '' })
  label: string;
}
export const FloorPlanSchema = SchemaFactory.createForClass(FloorPlan);

@Schema({ _id: false })
export class PropertyMedia {
  @Prop({ type: [PropertyImageSchema], default: [] })
  images: PropertyImage[];

  @Prop({ type: [FloorPlanSchema], default: [] })
  floorPlans: FloorPlan[];

  @Prop({ type: String, default: null })
  videoUrl: string | null;

  @Prop({ type: String, default: null })
  tourUrl: string | null;
}
export const PropertyMediaSchema = SchemaFactory.createForClass(PropertyMedia);

@Schema({ _id: false })
export class PropertyStats {
  @Prop({ type: Number, default: 0, min: 0 })
  views: number;

  @Prop({ type: Number, default: 0, min: 0 })
  favorites: number;

  @Prop({ type: Number, default: 0, min: 0 })
  leads: number;
}
export const PropertyStatsSchema = SchemaFactory.createForClass(PropertyStats);

@Schema({
  collection: 'properties',
  timestamps: true,
  versionKey: false,
  minimize: false,
})
export class Property {
  /**
   * Shared listing UUID — identical to Postgres `property_index.id`, the
   * Elasticsearch document id and `seed/properties.json[].id`. `_id` stays the
   * ObjectId built from `seed/properties.json[].mongoId`.
   */
  @Prop({ type: String, required: true })
  propertyId: string;

  @Prop({ type: String, required: true, trim: true, lowercase: true })
  slug: string;

  @Prop({ type: String, required: true, trim: true })
  referenceNo: string;

  @Prop({ type: LocalizedTextSchema, required: true })
  title: LocalizedText;

  @Prop({ type: LocalizedTextSchema, required: true })
  description: LocalizedText;

  @Prop({ type: String, required: true, enum: PROPERTY_TYPES })
  propertyType: PropertyType;

  @Prop({ type: String, required: true, enum: SALE_TYPES })
  saleType: SaleType;

  @Prop({ type: String, required: true, enum: PROPERTY_STATUSES, default: 'available' })
  status: PropertyStatus;

  @Prop({ type: String, required: true, enum: FINISHING_TYPES })
  finishing: FinishingType;

  @Prop({ type: PropertyPriceSchema, required: true })
  price: PropertyPrice;

  @Prop({ type: PropertyPaymentPlanSchema, required: true })
  paymentPlan: PropertyPaymentPlan;

  @Prop({ type: PropertySpecsSchema, required: true })
  specs: PropertySpecs;

  @Prop({ type: PropertyLocationSchema, required: true })
  location: PropertyLocation;

  @Prop({ type: CompoundRefSchema, required: true })
  compound: CompoundRef;

  @Prop({ type: DeveloperRefSchema, required: true })
  developer: DeveloperRef;

  /** Amenity **slugs** (→ Postgres `amenities.slug`). */
  @Prop({ type: [String], default: [] })
  amenities: string[];

  @Prop({ type: PropertyMediaSchema, default: () => ({}) })
  media: PropertyMedia;

  @Prop({ type: PropertyStatsSchema, default: () => ({}) })
  stats: PropertyStats;

  @Prop({ type: Boolean, default: false })
  isFeatured: boolean;

  @Prop({ type: Date, default: null })
  publishedAt: Date | null;

  /** Soft delete marker — every read filters on `deletedAt: null`. */
  @Prop({ type: Date, default: null })
  deletedAt: Date | null;

  // Managed by `timestamps: true`.
  createdAt: Date;
  updatedAt: Date;
}

export type PropertyDocument = HydratedDocument<Property>;

export const PropertySchema = SchemaFactory.createForClass(Property);

// ------------------------------------------------------------------- indexes
PropertySchema.index({ propertyId: 1 }, { unique: true });
PropertySchema.index({ slug: 1 }, { unique: true });
PropertySchema.index({ referenceNo: 1 }, { unique: true });
PropertySchema.index({ propertyType: 1 });
PropertySchema.index({ saleType: 1 });
PropertySchema.index({ status: 1 });
PropertySchema.index({ finishing: 1 });
PropertySchema.index({ 'price.amount': 1 });
PropertySchema.index({ 'specs.bedrooms': 1 });
PropertySchema.index({ 'specs.areaSqm': 1 });
PropertySchema.index({ 'compound.id': 1 });
PropertySchema.index({ 'developer.id': 1 });
PropertySchema.index({ 'location.areaId': 1 });
PropertySchema.index({ publishedAt: -1 });
PropertySchema.index({ isFeatured: -1 });
PropertySchema.index({ deletedAt: 1 });
PropertySchema.index({ amenities: 1 });
PropertySchema.index({ 'location.geo': '2dsphere' });

// Common list/filter combinations.
PropertySchema.index({ deletedAt: 1, status: 1, publishedAt: -1 });
PropertySchema.index({ 'location.areaId': 1, 'price.amount': 1 });
PropertySchema.index({ propertyType: 1, 'price.amount': 1 });

// Single bilingual full-text index (MongoDB allows exactly one per collection).
PropertySchema.index(
  {
    'title.en': 'text',
    'title.ar': 'text',
    'description.en': 'text',
    'description.ar': 'text',
    'location.areaName': 'text',
    'compound.name': 'text',
    'developer.name': 'text',
    referenceNo: 'text',
  },
  {
    name: 'property_text_idx',
    default_language: 'english',
    weights: {
      'title.en': 10,
      'title.ar': 10,
      referenceNo: 8,
      'compound.name': 6,
      'developer.name': 4,
      'location.areaName': 4,
      'description.en': 1,
      'description.ar': 1,
    },
  },
);
