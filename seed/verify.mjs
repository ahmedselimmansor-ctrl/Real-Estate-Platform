#!/usr/bin/env node
/**
 * Seed dataset self-check.
 *
 *   node seed/verify.mjs
 *
 * Parses the six emitted JSON files and asserts counts, enum membership,
 * uniqueness, foreign keys (developerId, areaId, compoundId, amenityIds,
 * amenity slugs) and the price / installment arithmetic. Exits non-zero with a
 * list of failures, so it can be wired into CI or a pre-seed step.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  AMENITY_CATEGORIES,
  FINISHINGS,
  PROPERTY_TYPES,
  SALE_TYPES,
  STATUSES,
} from './lib/enums.mjs';
import { SEED_DIR } from './lib/io.mjs';

const failures = [];
/** Asset URLs are either app-local (`/properties/…`) or absolute https. */
const isAssetUrl = (value) =>
  typeof value === 'string' && (value.startsWith('/properties/') || value.startsWith('https://'));

const check = (condition, message) => {
  if (!condition) failures.push(message);
};

const load = (fileName) => JSON.parse(readFileSync(resolve(SEED_DIR, fileName), 'utf8'));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ANCHOR_MS = Date.parse('2026-08-14T00:00:00.000Z');

const amenities = load('amenities.json');
const areas = load('areas.json');
const developers = load('developers.json');
const compounds = load('compounds.json');
const properties = load('properties.json');
const faq = load('faq.json');

// ------------------------------------------------------------- amenities ---
check(amenities.length === 24, `amenities.json: expected 24, got ${amenities.length}`);
const amenityIds = new Set(amenities.map((a) => a.id));
const amenitySlugs = new Set(amenities.map((a) => a.slug));
check(amenityIds.size === 24, 'amenities.json: duplicate ids');
check(amenitySlugs.size === 24, 'amenities.json: duplicate slugs');
for (const amenity of amenities) {
  check(UUID_RE.test(amenity.id), `amenity ${amenity.slug}: id is not a v5 UUID`);
  check(SLUG_RE.test(amenity.slug), `amenity ${amenity.slug}: bad slug`);
  check(
    AMENITY_CATEGORIES.includes(amenity.category),
    `amenity ${amenity.slug}: bad category ${amenity.category}`,
  );
  check(Boolean(amenity.nameEn && amenity.nameAr && amenity.icon), `amenity ${amenity.slug}: missing field`);
}
check(
  new Set(amenities.map((a) => a.category)).size === AMENITY_CATEGORIES.length,
  'amenities.json: not all five categories are represented',
);

// ----------------------------------------------------------------- areas ---
check(areas.length === 14, `areas.json: expected 14, got ${areas.length}`);
const areaIds = new Set(areas.map((a) => a.id));
check(areaIds.size === 14, 'areas.json: duplicate ids');
check(new Set(areas.map((a) => a.slug)).size === 14, 'areas.json: duplicate slugs');
for (const area of areas) {
  check(UUID_RE.test(area.id), `area ${area.slug}: id is not a v5 UUID`);
  check(Boolean(area.description?.en && area.description?.ar), `area ${area.slug}: missing description`);
  check(
    area.geo.lat > 21 && area.geo.lat < 32 && area.geo.lng > 24 && area.geo.lng < 37,
    `area ${area.slug}: geo outside Egypt`,
  );
  check(area.avgPricePerMeter > 10_000, `area ${area.slug}: implausible avgPricePerMeter`);
  check(isAssetUrl(area.heroImage), `area ${area.slug}: bad heroImage`);
}

// ------------------------------------------------------------ developers ---
check(developers.length === 12, `developers.json: expected 12, got ${developers.length}`);
const developerIds = new Set(developers.map((d) => d.id));
check(developerIds.size === 12, 'developers.json: duplicate ids');
for (const developer of developers) {
  check(UUID_RE.test(developer.id), `developer ${developer.slug}: id is not a v5 UUID`);
  check(
    developer.foundedYear > 1900 && developer.foundedYear <= 2026,
    `developer ${developer.slug}: implausible foundedYear`,
  );
  check(developer.website.startsWith('https://'), `developer ${developer.slug}: bad website`);
  check(Boolean(developer.description?.en && developer.description?.ar), `developer ${developer.slug}: missing description`);
}

// ------------------------------------------------------------- compounds ---
check(compounds.length === 30, `compounds.json: expected 30, got ${compounds.length}`);
const compoundIds = new Set(compounds.map((c) => c.id));
check(compoundIds.size === 30, 'compounds.json: duplicate ids');
check(new Set(compounds.map((c) => c.slug)).size === 30, 'compounds.json: duplicate slugs');
const compoundBySlug = new Map(compounds.map((c) => [c.slug, c]));
for (const compound of compounds) {
  check(UUID_RE.test(compound.id), `compound ${compound.slug}: id is not a v5 UUID`);
  check(developerIds.has(compound.developerId), `compound ${compound.slug}: unknown developerId`);
  check(areaIds.has(compound.areaId), `compound ${compound.slug}: unknown areaId`);
  check(compound.amenityIds.length >= 5, `compound ${compound.slug}: too few amenities`);
  for (const id of compound.amenityIds) {
    check(amenityIds.has(id), `compound ${compound.slug}: unknown amenityId ${id}`);
  }
  check(compound.images.length === 3, `compound ${compound.slug}: expected 3 images`);
  check(compound.unitTypes.length > 0, `compound ${compound.slug}: no unitTypes`);
  for (const type of compound.unitTypes) {
    check(PROPERTY_TYPES.includes(type), `compound ${compound.slug}: bad unitType ${type}`);
  }
  check(
    compound.startingPrice > 0 && compound.startingPrice <= compound.maxPrice,
    `compound ${compound.slug}: bad price aggregate`,
  );
  check(
    compound.minAreaSqm > 0 && compound.minAreaSqm <= compound.maxAreaSqm,
    `compound ${compound.slug}: bad area aggregate`,
  );
  check(
    compound.deliveryYear >= 2024 && compound.deliveryYear <= 2032,
    `compound ${compound.slug}: implausible deliveryYear`,
  );
  check(
    compound.downPaymentPercent > 0 && compound.downPaymentPercent <= 40,
    `compound ${compound.slug}: implausible downPaymentPercent`,
  );
  check(
    compound.installmentYears >= 3 && compound.installmentYears <= 12,
    `compound ${compound.slug}: implausible installmentYears`,
  );
}

// aggregates must equal what properties.json actually contains
const projectsByDeveloper = new Map();
for (const compound of compounds) {
  projectsByDeveloper.set(compound.developerId, (projectsByDeveloper.get(compound.developerId) ?? 0) + 1);
}
for (const developer of developers) {
  check(
    developer.projectsCount === (projectsByDeveloper.get(developer.id) ?? 0),
    `developer ${developer.slug}: projectsCount does not match compounds.json`,
  );
  check(developer.projectsCount > 0, `developer ${developer.slug}: has no compounds`);
}

// ------------------------------------------------------------ properties ---
check(properties.length === 180, `properties.json: expected 180, got ${properties.length}`);
const propertyIds = new Set(properties.map((p) => p.id));
const propertySlugs = new Set(properties.map((p) => p.slug));
const propertyRefs = new Set(properties.map((p) => p.referenceNo));
const mongoIds = new Set(properties.map((p) => p.mongoId));
check(propertyIds.size === 180, 'properties.json: duplicate ids');
check(propertySlugs.size === 180, 'properties.json: duplicate slugs');
check(propertyRefs.size === 180, 'properties.json: duplicate referenceNo');
check(mongoIds.size === 180, 'properties.json: duplicate mongoId');
for (let i = 0; i < 180; i += 1) {
  check(
    properties[i].referenceNo === `NWY-${1001 + i}`,
    `properties[${i}]: referenceNo ${properties[i].referenceNo} out of sequence`,
  );
}

const propertiesByArea = new Map();
const propertiesByCompound = new Map();
const typeCounts = new Map();

for (const property of properties) {
  const ref = property.referenceNo;

  check(UUID_RE.test(property.id), `${ref}: id is not a v5 UUID`);
  check(/^[0-9a-f]{24}$/.test(property.mongoId), `${ref}: mongoId is not 24 hex chars`);
  check(SLUG_RE.test(property.slug), `${ref}: bad slug`);
  check(Boolean(property.title?.en && property.title?.ar), `${ref}: missing title`);
  check(Boolean(property.description?.en && property.description?.ar), `${ref}: missing description`);
  check(property.description.en.split(/\s+/).length >= 45, `${ref}: EN description too short`);
  check(property.description.ar.split(/\s+/).length >= 25, `${ref}: AR description too short`);

  check(PROPERTY_TYPES.includes(property.propertyType), `${ref}: bad propertyType`);
  check(SALE_TYPES.includes(property.saleType), `${ref}: bad saleType`);
  check(STATUSES.includes(property.status), `${ref}: bad status`);
  check(FINISHINGS.includes(property.finishing), `${ref}: bad finishing`);

  // --- price arithmetic ---
  const { amount, currency, pricePerMeter } = property.price;
  const { areaSqm } = property.specs;
  check(currency === 'EGP', `${ref}: currency is not EGP`);
  check(amount >= 2_000_000 && amount <= 95_000_000, `${ref}: price ${amount} outside 2M–95M`);
  check(
    pricePerMeter === Math.round(amount / areaSqm),
    `${ref}: pricePerMeter ${pricePerMeter} !== round(${amount}/${areaSqm})`,
  );

  // --- payment plan arithmetic ---
  const plan = property.paymentPlan;
  const expectedMonthly = Math.round(
    (amount * (1 - plan.downPaymentPercent / 100)) / (plan.installmentYears * 12),
  );
  check(
    plan.monthlyInstallment === expectedMonthly,
    `${ref}: monthlyInstallment ${plan.monthlyInstallment} !== ${expectedMonthly}`,
  );
  check(DATE_RE.test(plan.deliveryDate), `${ref}: bad deliveryDate ${plan.deliveryDate}`);
  const deliveryInFuture = Date.parse(`${plan.deliveryDate}T00:00:00.000Z`) > ANCHOR_MS;
  check(
    !(property.status === 'delivered' && deliveryInFuture),
    `${ref}: status delivered but handover ${plan.deliveryDate} is in the future`,
  );
  check(
    !(property.status === 'off_plan' && !deliveryInFuture),
    `${ref}: status off_plan but handover ${plan.deliveryDate} already passed`,
  );

  // --- specs ---
  const specs = property.specs;
  check(specs.areaSqm >= 40 && specs.areaSqm <= 620, `${ref}: implausible areaSqm ${specs.areaSqm}`);
  check(specs.bathrooms >= 1, `${ref}: bathrooms < 1`);
  check(specs.gardenSqm >= 0 && specs.floor >= 0 && specs.parkingSpots >= 0, `${ref}: negative spec`);

  // --- foreign keys ---
  check(areaIds.has(property.location.areaId), `${ref}: unknown location.areaId`);
  check(compoundIds.has(property.compound.id), `${ref}: unknown compound.id`);
  check(developerIds.has(property.developer.id), `${ref}: unknown developer.id`);
  for (const slug of property.amenities) {
    check(amenitySlugs.has(slug), `${ref}: unknown amenity slug ${slug}`);
  }
  check(property.amenities.length >= 4, `${ref}: fewer than 4 amenities`);

  const compound = compoundBySlug.get(property.compound.slug);
  check(Boolean(compound), `${ref}: compound slug not found`);
  if (compound) {
    check(compound.id === property.compound.id, `${ref}: compound id/slug mismatch`);
    check(compound.areaId === property.location.areaId, `${ref}: area does not match its compound`);
    check(compound.developerId === property.developer.id, `${ref}: developer does not match its compound`);
    check(
      compound.unitTypes.includes(property.propertyType),
      `${ref}: ${property.propertyType} is not offered in ${compound.slug}`,
    );
    check(
      property.price.amount >= compound.startingPrice && property.price.amount <= compound.maxPrice,
      `${ref}: price outside its compound aggregate`,
    );
  }

  // --- geo ---
  const [lng, lat] = property.location.geo.coordinates;
  check(property.location.geo.type === 'Point', `${ref}: geo.type is not Point`);
  check(lat > 21 && lat < 32 && lng > 24 && lng < 37, `${ref}: geo outside Egypt`);

  // --- media ---
  const images = property.media.images;
  check(images.length >= 4 && images.length <= 8, `${ref}: ${images.length} images (want 4–8)`);
  check(images.filter((image) => image.isPrimary).length === 1, `${ref}: not exactly one primary image`);
  images.forEach((image, index) => {
    check(image.order === index, `${ref}: image order out of sequence`);
    check(isAssetUrl(image.url), `${ref}: image url must be a local /properties/ path or https`);
    check(typeof image.key === 'string' && image.key.length > 0, `${ref}: missing image key`);
  });
  check(property.media.floorPlans.length >= 1, `${ref}: no floor plans`);

  // --- timestamps ---
  check(ISO_RE.test(property.publishedAt), `${ref}: bad publishedAt`);
  check(ISO_RE.test(property.createdAt), `${ref}: bad createdAt`);
  check(ISO_RE.test(property.updatedAt), `${ref}: bad updatedAt`);
  check(property.deletedAt === null, `${ref}: deletedAt should be null`);
  const published = Date.parse(property.publishedAt);
  check(Date.parse(property.createdAt) <= published, `${ref}: createdAt after publishedAt`);
  check(Date.parse(property.updatedAt) >= published, `${ref}: updatedAt before publishedAt`);
  check(Date.parse(property.updatedAt) <= ANCHOR_MS, `${ref}: updatedAt in the future`);
  check(
    published >= ANCHOR_MS - 548 * 86_400_000 && published <= ANCHOR_MS,
    `${ref}: publishedAt outside the 18-month window`,
  );

  propertiesByArea.set(property.location.areaId, (propertiesByArea.get(property.location.areaId) ?? 0) + 1);
  propertiesByCompound.set(property.compound.id, (propertiesByCompound.get(property.compound.id) ?? 0) + 1);
  typeCounts.set(property.propertyType, (typeCounts.get(property.propertyType) ?? 0) + 1);
}

// area counts and compound aggregates must be reconciled
for (const area of areas) {
  check(
    area.propertyCount === (propertiesByArea.get(area.id) ?? 0),
    `area ${area.slug}: propertyCount ${area.propertyCount} !== ${propertiesByArea.get(area.id) ?? 0} listings`,
  );
  check(area.propertyCount > 0, `area ${area.slug}: has no listings`);
}
for (const compound of compounds) {
  const units = properties.filter((property) => property.compound.id === compound.id);
  check(units.length >= 3, `compound ${compound.slug}: only ${units.length} listings`);
  check(
    compound.startingPrice === Math.min(...units.map((u) => u.price.amount)),
    `compound ${compound.slug}: startingPrice is not the minimum listing price`,
  );
  check(
    compound.maxPrice === Math.max(...units.map((u) => u.price.amount)),
    `compound ${compound.slug}: maxPrice is not the maximum listing price`,
  );
  check(
    compound.minAreaSqm === Math.min(...units.map((u) => u.specs.areaSqm)),
    `compound ${compound.slug}: minAreaSqm mismatch`,
  );
  check(
    compound.maxAreaSqm === Math.max(...units.map((u) => u.specs.areaSqm)),
    `compound ${compound.slug}: maxAreaSqm mismatch`,
  );
}

// type mix
const expectedMix = {
  apartment: 99,
  villa: 27,
  townhouse: 22,
  twinhouse: 14,
  chalet: 9,
  duplex: 2,
  penthouse: 2,
  studio: 2,
  office: 1,
  retail: 1,
  clinic: 1,
};
for (const [type, expected] of Object.entries(expectedMix)) {
  check(
    (typeCounts.get(type) ?? 0) === expected,
    `type mix: ${type} = ${typeCounts.get(type) ?? 0}, expected ${expected}`,
  );
}
const featured = properties.filter((property) => property.isFeatured).length;
check(featured === 22, `featured listings: ${featured}, expected 22`);

// chalets only on the coast
const coastalAreas = new Set(
  areas.filter((area) => ['north-coast', 'ain-sokhna', 'ras-el-hekma'].includes(area.slug)).map((a) => a.id),
);
for (const property of properties.filter((p) => p.propertyType === 'chalet')) {
  check(coastalAreas.has(property.location.areaId), `${property.referenceNo}: chalet outside a coastal area`);
}

// ------------------------------------------------------------------- faq ---
check(faq.length === 40, `faq.json: expected 40, got ${faq.length}`);
check(new Set(faq.map((entry) => entry.id)).size === 40, 'faq.json: duplicate ids');
const FAQ_CATEGORIES = [
  'buying_process',
  'payment_plans',
  'mortgage',
  'legal_documents',
  'delivery_handover',
  'nawy_services',
  'resale',
  'rental',
  'fees_taxes',
  'account_support',
];
const faqByCategory = new Map();
for (const entry of faq) {
  check(UUID_RE.test(entry.id), `faq ${entry.category}: id is not a v5 UUID`);
  check(FAQ_CATEGORIES.includes(entry.category), `faq: unknown category ${entry.category}`);
  check(Boolean(entry.question?.en && entry.question?.ar), 'faq: missing question translation');
  check(Boolean(entry.answer?.en && entry.answer?.ar), 'faq: missing answer translation');
  const words = entry.answer.en.trim().split(/\s+/).length;
  check(words >= 60 && words <= 150, `faq "${entry.question.en}": EN answer is ${words} words (want 60–150)`);
  const wordsAr = entry.answer.ar.trim().split(/\s+/).length;
  check(wordsAr >= 50, `faq "${entry.question.en}": AR answer is only ${wordsAr} words`);
  check(Array.isArray(entry.tags) && entry.tags.length >= 3, 'faq: fewer than 3 tags');
  faqByCategory.set(entry.category, (faqByCategory.get(entry.category) ?? 0) + 1);
}
for (const category of FAQ_CATEGORIES) {
  check(faqByCategory.get(category) === 4, `faq: category ${category} has ${faqByCategory.get(category)} entries, expected 4`);
}

// ---------------------------------------------------------------- report ---
if (failures.length > 0) {
  process.stderr.write(`\n  ${failures.length} check(s) FAILED\n`);
  for (const failure of failures.slice(0, 60)) process.stderr.write(`   ✗ ${failure}\n`);
  if (failures.length > 60) process.stderr.write(`   … and ${failures.length - 60} more\n`);
  process.exit(1);
}

process.stdout.write(
  [
    '  seed dataset OK',
    `   amenities  ${amenities.length}`,
    `   areas      ${areas.length}`,
    `   developers ${developers.length}`,
    `   compounds  ${compounds.length}`,
    `   properties ${properties.length}`,
    `   faq        ${faq.length}`,
    '   every foreign key resolves; price, pricePerMeter and monthlyInstallment are consistent',
    '',
  ].join('\n'),
);
