#!/usr/bin/env node
/**
 * TopChoice — shared seed dataset generator.
 *
 *   node seed/generate.mjs
 *
 * Zero dependencies (node:crypto / node:fs / node:path only). Every identifier
 * is a deterministic UUID v5 derived from the entity slug, and every "random"
 * choice comes from a seeded PRNG, so re-running produces byte-identical JSON.
 *
 * Emits, into this directory:
 *   amenities.json    24  amenities
 *   areas.json        14  Egyptian areas
 *   developers.json   12  developers
 *   compounds.json    30  compounds  (developerId/areaId → the two files above)
 *   properties.json   180 listings   (Mongo document shape, CONTRACT §3)
 *   faq.json          40  RAG knowledge-base entries
 *
 * See seed/README.md for the schema of each file.
 */
import { buildAmenities } from './build/amenities.mjs';
import { buildAreas } from './build/areas.mjs';
import { buildCompounds } from './build/compounds.mjs';
import { buildDevelopers } from './build/developers.mjs';
import { buildFaq } from './build/faq.mjs';
import { ANCHOR_ISO, buildProperties } from './build/properties.mjs';
import { groupDigits } from './lib/format.mjs';
import { writeJson } from './lib/io.mjs';

/** areas[].propertyCount = listings actually seeded in that area. */
function reconcileAreaCounts(areas, properties) {
  const counts = new Map();
  for (const property of properties) {
    const key = property.location.areaId;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const area of areas) {
    area.propertyCount = counts.get(area.id) ?? 0;
  }
}

/** developers[].projectsCount = compounds owned by that developer in this seed. */
function reconcileDeveloperCounts(developers, compounds) {
  const counts = new Map();
  for (const compound of compounds) {
    counts.set(compound.developerId, (counts.get(compound.developerId) ?? 0) + 1);
  }
  for (const developer of developers) {
    developer.projectsCount = counts.get(developer.id) ?? 0;
  }
}

/** compounds[] price/area aggregates = min/max over that compound's listings. */
function reconcileCompoundAggregates(compounds, properties) {
  const grouped = new Map();
  for (const property of properties) {
    const bucket = grouped.get(property.compound.id) ?? [];
    bucket.push(property);
    grouped.set(property.compound.id, bucket);
  }

  for (const compound of compounds) {
    const units = grouped.get(compound.id) ?? [];
    if (units.length === 0) {
      throw new Error(`Compound ${compound.slug} has no properties — adjust the quotas.`);
    }
    const prices = units.map((unit) => unit.price.amount);
    const areas = units.map((unit) => unit.specs.areaSqm);
    compound.startingPrice = Math.min(...prices);
    compound.maxPrice = Math.max(...prices);
    compound.minAreaSqm = Math.min(...areas);
    compound.maxAreaSqm = Math.max(...areas);
  }
}

function summarise(properties) {
  const byType = new Map();
  for (const property of properties) {
    byType.set(property.propertyType, (byType.get(property.propertyType) ?? 0) + 1);
  }
  const prices = properties.map((property) => property.price.amount);
  return {
    types: [...byType.entries()].sort((a, b) => b[1] - a[1]),
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    featured: properties.filter((property) => property.isFeatured).length,
  };
}

function main() {
  const amenities = buildAmenities();
  const areas = buildAreas();
  const developers = buildDevelopers();
  const compounds = buildCompounds();
  const properties = buildProperties();
  const faq = buildFaq();

  reconcileAreaCounts(areas, properties);
  reconcileDeveloperCounts(developers, compounds);
  reconcileCompoundAggregates(compounds, properties);

  const files = [
    ['amenities.json', amenities],
    ['areas.json', areas],
    ['developers.json', developers],
    ['compounds.json', compounds],
    ['properties.json', properties],
    ['faq.json', faq],
  ];

  for (const [fileName, payload] of files) {
    const bytes = writeJson(fileName, payload);
    process.stdout.write(
      `  ${fileName.padEnd(18)} ${String(payload.length).padStart(4)} records  ${groupDigits(bytes).padStart(9)} bytes\n`,
    );
  }

  const stats = summarise(properties);
  process.stdout.write(`\n  anchor date      ${ANCHOR_ISO}\n`);
  process.stdout.write(
    `  price range      EGP ${groupDigits(stats.minPrice)} — EGP ${groupDigits(stats.maxPrice)}\n`,
  );
  process.stdout.write(`  featured         ${stats.featured}\n`);
  process.stdout.write(
    `  type mix         ${stats.types.map(([type, count]) => `${type}:${count}`).join(' ')}\n`,
  );
}

main();
