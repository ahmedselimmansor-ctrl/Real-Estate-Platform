import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  FinishingType,
  PropertyStatus,
  PropertyType,
  SaleType,
} from '../src/common/enums';

/** Shapes of the shared `seed/*.json` files (see `seed/README.md`). */

export interface LocalizedCopy {
  en: string;
  ar: string;
}

export interface SeedAmenity {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  icon: string;
  category: string;
}

export interface SeedArea {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  city: string;
  governorate: string;
  description: LocalizedCopy;
  geo: { lat: number; lng: number };
  heroImage: string;
  propertyCount: number;
  avgPricePerMeter: number;
}

export interface SeedDeveloper {
  id: string;
  slug: string;
  name: string;
  nameAr: string;
  logoUrl: string;
  coverUrl: string;
  description: LocalizedCopy;
  foundedYear: number;
  projectsCount: number;
  website: string;
  phone: string;
}

export interface SeedCompound {
  id: string;
  slug: string;
  name: string;
  nameAr: string;
  developerId: string;
  areaId: string;
  description: LocalizedCopy;
  startingPrice: number;
  maxPrice: number;
  minAreaSqm: number;
  maxAreaSqm: number;
  deliveryYear: number;
  installmentYears: number;
  downPaymentPercent: number;
  amenityIds: string[];
  images: string[];
  geo: { lat: number; lng: number };
  masterPlanUrl: string;
  unitTypes: PropertyType[];
  isFeatured: boolean;
}

export interface SeedProperty {
  id: string;
  mongoId: string;
  slug: string;
  referenceNo: string;
  title: LocalizedCopy;
  description: LocalizedCopy;
  propertyType: PropertyType;
  saleType: SaleType;
  status: PropertyStatus;
  finishing: FinishingType;
  price: { amount: number; currency: 'EGP'; pricePerMeter: number };
  paymentPlan: {
    downPaymentPercent: number;
    installmentYears: number;
    monthlyInstallment: number;
    deliveryDate: string;
  };
  specs: {
    bedrooms: number;
    bathrooms: number;
    areaSqm: number;
    gardenSqm: number;
    floor: number;
    parkingSpots: number;
  };
  location: {
    areaId: string;
    areaName: string;
    city: string;
    governorate: string;
    address: string;
    geo: { type: 'Point'; coordinates: [number, number] };
  };
  compound: { id: string; name: string; slug: string };
  developer: { id: string; name: string; slug: string; logoUrl: string };
  amenities: string[];
  media: {
    images: Array<{
      url: string;
      key: string;
      width: number;
      height: number;
      isPrimary: boolean;
      order: number;
    }>;
    floorPlans: Array<{ url: string; label: string }>;
    videoUrl: string | null;
    tourUrl: string | null;
  };
  stats: { views: number; favorites: number; leads: number };
  isFeatured: boolean;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface SeedDataset {
  directory: string;
  amenities: SeedAmenity[];
  areas: SeedArea[];
  developers: SeedDeveloper[];
  compounds: SeedCompound[];
  properties: SeedProperty[];
}

/**
 * The dataset is mounted read-only at `/app/seed` in docker and lives at
 * `<repo>/seed` when running from the workspace.
 */
export function resolveSeedDir(): string {
  const candidates = [
    join(process.cwd(), 'seed'),
    resolve(process.cwd(), '..', '..', 'seed'),
    '/app/seed',
  ];

  const found = candidates.find((candidate) => existsSync(join(candidate, 'properties.json')));

  if (!found) {
    throw new Error(
      `Could not locate the shared seed dataset. Looked in:\n${candidates
        .map((candidate) => `  - ${candidate}`)
        .join('\n')}`,
    );
  }

  return found;
}

function readJson<T>(directory: string, file: string): T {
  const path = join(directory, file);
  if (!existsSync(path)) {
    throw new Error(`Missing seed file: ${path}`);
  }
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export function loadSeedDataset(directory = resolveSeedDir()): SeedDataset {
  return {
    directory,
    amenities: readJson<SeedAmenity[]>(directory, 'amenities.json'),
    areas: readJson<SeedArea[]>(directory, 'areas.json'),
    developers: readJson<SeedDeveloper[]>(directory, 'developers.json'),
    compounds: readJson<SeedCompound[]>(directory, 'compounds.json'),
    properties: readJson<SeedProperty[]>(directory, 'properties.json'),
  };
}
