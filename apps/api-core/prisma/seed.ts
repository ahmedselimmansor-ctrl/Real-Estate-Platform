/**
 * Idempotent seeder for the shared dataset in `seed/` (see `seed/README.md`).
 *
 *   npm run seed
 *
 * Everything is upserted on the stable seed ids, so re-running updates rather
 * than duplicates. PostgreSQL gets the relational catalogue plus the thin
 * `property_index` mirror; MongoDB gets the canonical listing documents keyed by
 * `_id = ObjectId(properties[].mongoId)`.
 */
import 'reflect-metadata';

import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import mongoose, { Types } from 'mongoose';
import { v5 as uuidv5 } from 'uuid';

import { Property, PropertySchema } from '../src/mongo/schemas/property.schema';
import { loadSeedDataset, SeedProperty } from './seed-data';
import { seedEngagement } from './seed-engagement';

/** Fixed namespace so generated ids (payment plans, demo users) stay stable. */
const SEED_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const deterministicId = (key: string): string => uuidv5(`topchoice-api-core:${key}`, SEED_NAMESPACE);

const prisma = new PrismaClient();

const log = (message: string): void => {
  process.stdout.write(`[seed] ${message}\n`);
};

const toDate = (value: string | null | undefined): Date | null =>
  value ? new Date(value) : null;

// --------------------------------------------------------------------- users
interface DemoUser {
  key: string;
  email: string;
  name: string;
  phone: string;
  role: 'user' | 'agent' | 'admin';
  password: string;
}

/** Development-only accounts so the UI is usable straight after `docker compose up`. */
const DEMO_USERS: DemoUser[] = [
  {
    key: 'user:admin',
    email: 'admin@topchoice.local',
    name: 'TopChoice Admin',
    phone: '+201000000001',
    role: 'admin',
    password: 'TopChoice@Demo123',
  },
  {
    key: 'user:agent',
    email: 'agent@topchoice.local',
    name: 'Mona Farid',
    phone: '+201000000002',
    role: 'agent',
    password: 'TopChoice@Demo123',
  },
  {
    key: 'user:buyer',
    email: 'buyer@topchoice.local',
    name: 'Ahmed Salah',
    phone: '+201000000003',
    role: 'user',
    password: 'TopChoice@Demo123',
  },
];

async function seedUsers(): Promise<void> {
  for (const user of DEMO_USERS) {
    const passwordHash = await argon2.hash(user.password, { type: argon2.argon2id });

    await prisma.user.upsert({
      where: { email: user.email },
      create: {
        id: deterministicId(user.key),
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        passwordHash,
        isVerified: true,
      },
      update: {
        name: user.name,
        phone: user.phone,
        role: user.role,
        isVerified: true,
      },
    });
  }

  log(`users:          ${DEMO_USERS.length} demo accounts (password "TopChoice@Demo123")`);
}

// ---------------------------------------------------------------- postgresql
async function seedPostgres(): Promise<void> {
  const dataset = loadSeedDataset();
  log(`dataset:        ${dataset.directory}`);

  for (const amenity of dataset.amenities) {
    const data = {
      slug: amenity.slug,
      nameEn: amenity.nameEn,
      nameAr: amenity.nameAr,
      icon: amenity.icon,
      category: amenity.category,
    };
    await prisma.amenity.upsert({
      where: { id: amenity.id },
      create: { id: amenity.id, ...data },
      update: data,
    });
  }
  log(`amenities:      ${dataset.amenities.length}`);

  for (const area of dataset.areas) {
    const data = {
      slug: area.slug,
      nameEn: area.nameEn,
      nameAr: area.nameAr,
      city: area.city,
      governorate: area.governorate,
      descriptionEn: area.description.en,
      descriptionAr: area.description.ar,
      lat: area.geo.lat,
      lng: area.geo.lng,
      heroImage: area.heroImage,
      propertyCount: area.propertyCount,
      avgPricePerMeter: area.avgPricePerMeter,
    };
    await prisma.area.upsert({
      where: { id: area.id },
      create: { id: area.id, ...data },
      update: data,
    });
  }
  log(`areas:          ${dataset.areas.length}`);

  for (const developer of dataset.developers) {
    const data = {
      slug: developer.slug,
      name: developer.name,
      nameAr: developer.nameAr,
      logoUrl: developer.logoUrl,
      coverUrl: developer.coverUrl,
      descriptionEn: developer.description.en,
      descriptionAr: developer.description.ar,
      foundedYear: developer.foundedYear,
      projectsCount: developer.projectsCount,
      website: developer.website,
      phone: developer.phone,
    };
    await prisma.developer.upsert({
      where: { id: developer.id },
      create: { id: developer.id, ...data },
      update: data,
    });
  }
  log(`developers:     ${dataset.developers.length}`);

  for (const compound of dataset.compounds) {
    const data = {
      slug: compound.slug,
      name: compound.name,
      nameAr: compound.nameAr,
      developerId: compound.developerId,
      areaId: compound.areaId,
      descriptionEn: compound.description.en,
      descriptionAr: compound.description.ar,
      startingPrice: compound.startingPrice,
      maxPrice: compound.maxPrice,
      minAreaSqm: compound.minAreaSqm,
      maxAreaSqm: compound.maxAreaSqm,
      deliveryYear: compound.deliveryYear,
      installmentYears: compound.installmentYears,
      downPaymentPercent: compound.downPaymentPercent,
      images: compound.images,
      masterPlanUrl: compound.masterPlanUrl,
      lat: compound.geo.lat,
      lng: compound.geo.lng,
      unitTypes: compound.unitTypes,
      isFeatured: compound.isFeatured,
    };

    await prisma.compound.upsert({
      where: { id: compound.id },
      create: { id: compound.id, ...data },
      update: data,
    });

    await prisma.compoundAmenity.deleteMany({
      where: { compoundId: compound.id, amenityId: { notIn: compound.amenityIds } },
    });
    await prisma.compoundAmenity.createMany({
      data: compound.amenityIds.map((amenityId) => ({ compoundId: compound.id, amenityId })),
      skipDuplicates: true,
    });

    const planId = deterministicId(`payment-plan:${compound.slug}:default`);
    const planData = {
      compoundId: compound.id,
      name: `${compound.downPaymentPercent}% down · ${compound.installmentYears} years`,
      downPaymentPercent: compound.downPaymentPercent,
      installmentYears: compound.installmentYears,
      monthlyInstallment: Math.round(
        (compound.startingPrice * (1 - compound.downPaymentPercent / 100)) /
          (compound.installmentYears * 12),
      ),
      deliveryDate: new Date(Date.UTC(compound.deliveryYear, 11, 31)),
      description: `Developer plan for ${compound.name}`,
      isDefault: true,
    };
    await prisma.paymentPlan.upsert({
      where: { id: planId },
      create: { id: planId, ...planData },
      update: planData,
    });
  }
  log(`compounds:      ${dataset.compounds.length} (+ amenities, default payment plans)`);

  for (const property of dataset.properties) {
    const data = {
      mongoId: property.mongoId,
      slug: property.slug,
      compoundId: property.compound.id,
      developerId: property.developer.id,
      areaId: property.location.areaId,
      priceMin: property.price.amount,
      status: property.status,
      isFeatured: property.isFeatured,
      publishedAt: toDate(property.publishedAt),
      deletedAt: toDate(property.deletedAt),
      createdAt: new Date(property.createdAt),
      updatedAt: new Date(property.updatedAt),
    };
    await prisma.propertyIndex.upsert({
      where: { id: property.id },
      create: { id: property.id, ...data },
      update: data,
    });
  }
  log(`property_index: ${dataset.properties.length}`);
}

// --------------------------------------------------------------------- mongo
function toMongoDocument(property: SeedProperty): Record<string, unknown> {
  return {
    propertyId: property.id,
    slug: property.slug,
    referenceNo: property.referenceNo,
    title: property.title,
    description: property.description,
    propertyType: property.propertyType,
    saleType: property.saleType,
    status: property.status,
    finishing: property.finishing,
    price: property.price,
    paymentPlan: property.paymentPlan,
    specs: property.specs,
    location: property.location,
    compound: property.compound,
    developer: property.developer,
    amenities: property.amenities,
    media: property.media,
    stats: property.stats,
    isFeatured: property.isFeatured,
    publishedAt: toDate(property.publishedAt),
    deletedAt: toDate(property.deletedAt),
    createdAt: new Date(property.createdAt),
    updatedAt: new Date(property.updatedAt),
  };
}

async function seedMongo(): Promise<void> {
  const dataset = loadSeedDataset();
  const uri = process.env.MONGO_URI ?? 'mongodb://mongo:27017/topchoice';

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });

  const PropertyModel = mongoose.model<Property>(Property.name, PropertySchema);

  const operations = dataset.properties.map((property) => ({
    updateOne: {
      filter: { _id: new Types.ObjectId(property.mongoId) },
      update: { $set: toMongoDocument(property) },
      upsert: true,
    },
  }));

  // Written through the raw driver so the seeded createdAt/updatedAt survive
  // verbatim (mongoose `timestamps: true` would rewrite them on every upsert).
  await PropertyModel.collection.bulkWrite(operations as never, { ordered: false });
  await PropertyModel.createIndexes();

  const total = await PropertyModel.estimatedDocumentCount();
  log(`mongo:          ${dataset.properties.length} upserted (${total} documents total)`);

  await syncEngagementStats(PropertyModel);

  await mongoose.disconnect();
}

/**
 * Mirrors the seeded favourites/leads onto `properties.stats` so the admin
 * dashboard and property cards show consistent numbers, and gives every listing
 * a plausible view count derived from its own id (stable across reruns).
 */
async function syncEngagementStats(
  PropertyModel: mongoose.Model<Property>,
): Promise<void> {
  const [favorites, leads] = await Promise.all([
    prisma.favorite.groupBy({ by: ['propertyId'], _count: { _all: true } }),
    prisma.lead.groupBy({
      by: ['propertyId'],
      _count: { _all: true },
      where: { propertyId: { not: null } },
    }),
  ]);

  const favoriteCounts = new Map(favorites.map((row) => [row.propertyId, row._count._all]));
  const leadCounts = new Map(
    leads.filter((row) => row.propertyId).map((row) => [row.propertyId as string, row._count._all]),
  );

  const ids = await PropertyModel.distinct('propertyId').exec();

  const operations = (ids as string[]).map((propertyId) => {
    // Deterministic pseudo-random view count in [40, 2039) seeded by the id.
    const fingerprint = Number.parseInt(propertyId.slice(0, 8), 16);
    const views = 40 + (fingerprint % 2000);

    return {
      updateOne: {
        filter: { propertyId },
        update: {
          $set: {
            'stats.views': views,
            'stats.favorites': favoriteCounts.get(propertyId) ?? 0,
            'stats.leads': leadCounts.get(propertyId) ?? 0,
          },
        },
      },
    };
  });

  if (operations.length > 0) {
    await PropertyModel.collection.bulkWrite(operations as never, { ordered: false });
  }

  log(`stats:          synced views/favorites/leads onto ${operations.length} listings`);
}

// ---------------------------------------------------------------------- main
async function main(): Promise<void> {
  const startedAt = Date.now();
  log('starting');

  await seedPostgres();
  await seedUsers();

  const engagement = await seedEngagement(prisma);
  log(`leads:          ${engagement.leads}`);
  log(`favorites:      ${engagement.favorites}`);

  // Last, so it can mirror the engagement counts onto the listing documents.
  await seedMongo();

  log(`done in ${Date.now() - startedAt}ms`);
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`[seed] failed: ${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
    void mongoose.disconnect();
  });
