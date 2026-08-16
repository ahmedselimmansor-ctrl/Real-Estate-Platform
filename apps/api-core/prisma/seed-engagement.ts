/**
 * Demo engagement data: enquiries and saved listings.
 *
 * Split out from `seed.ts` because it is the only part that invents records
 * rather than mirroring `seed/*.json`. Everything is derived from a seeded PRNG
 * keyed on the listing ids, so re-running produces the same rows and the
 * `deterministicId` upserts stay idempotent.
 */
import type { LeadStatus, PrismaClient } from '@prisma/client';
import { v5 as uuidv5 } from 'uuid';

const SEED_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const deterministicId = (key: string): string =>
  uuidv5(`nawy-api-core:${key}`, SEED_NAMESPACE);

/** Deterministic 32-bit PRNG — same sequence on every run. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LEAD_NAMES = [
  'Mostafa Kamel', 'Nour El-Sayed', 'Karim Adel', 'Salma Ibrahim', 'Youssef Tarek',
  'Dina Mahmoud', 'Omar Shalaby', 'Hana Fouad', 'Ziad Nabil', 'Mariam Sobhy',
  'Tamer Hosny', 'Rana Kamal', 'Amr Diab', 'Laila Hassan', 'Sherif Mounir',
  'Yasmine Raafat', 'Hossam Ghaly', 'Nada Khaled', 'Bassem Youssef', 'Farida Adel',
];

const MESSAGES = [
  'I would like to schedule a viewing this weekend if possible.',
  'Could you share the full payment plan and delivery timeline?',
  'Is the price negotiable for a cash purchase?',
  'Are there any similar units with a larger garden?',
  'What are the maintenance fees for this compound?',
  'I am interested — please call me in the evening.',
  'Does this unit qualify for bank mortgage financing?',
  'Can I get the floor plans and finishing specification?',
];

const SOURCES = ['property_detail', 'contact_page', 'chatbot', 'compound_page', 'phone'];
const STATUSES: LeadStatus[] = [
  'new', 'new', 'new', 'contacted', 'contacted', 'qualified', 'viewing', 'negotiating', 'won', 'lost',
];

export interface EngagementCounts {
  leads: number;
  favorites: number;
}

export async function seedEngagement(
  prisma: PrismaClient,
  options: { leadCount?: number; favoriteCount?: number } = {},
): Promise<EngagementCounts> {
  const leadCount = options.leadCount ?? 40;
  const favoriteCount = options.favoriteCount ?? 30;

  const properties = await prisma.propertyIndex.findMany({
    where: { deletedAt: null },
    select: { id: true },
    orderBy: { id: 'asc' },
  });

  const users = await prisma.user.findMany({
    select: { id: true, role: true },
    orderBy: { email: 'asc' },
  });

  if (properties.length === 0 || users.length === 0) {
    return { leads: 0, favorites: 0 };
  }

  const agents = users.filter((user) => user.role === 'agent' || user.role === 'admin');
  const buyer = users.find((user) => user.role === 'user') ?? users[0];

  // ------------------------------------------------------------------ leads
  const random = mulberry32(0x4e415759); // "NAWY"

  for (let index = 0; index < leadCount; index += 1) {
    const id = deterministicId(`lead:${index}`);
    const property = properties[Math.floor(random() * properties.length)];
    const name = LEAD_NAMES[index % LEAD_NAMES.length];
    const status = STATUSES[Math.floor(random() * STATUSES.length)];
    const assigned = agents.length > 0 ? agents[Math.floor(random() * agents.length)] : null;

    // Spread across the last 90 days, anchored so reruns are stable.
    const daysAgo = Math.floor(random() * 90);
    const createdAt = new Date(Date.UTC(2026, 7, 14) - daysAgo * 86_400_000);

    const data = {
      propertyId: property.id,
      name,
      phone: `+2010${String(10_000_000 + index * 137).slice(0, 8)}`,
      email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`,
      message: MESSAGES[Math.floor(random() * MESSAGES.length)],
      source: SOURCES[Math.floor(random() * SOURCES.length)],
      status,
      assignedToId: status === 'new' ? null : (assigned?.id ?? null),
      contactedAt: status === 'new' ? null : createdAt,
      createdAt,
    };

    await prisma.lead.upsert({ where: { id }, create: { id, ...data }, update: data });
  }

  // -------------------------------------------------------------- favourites
  const chosen = new Set<string>();
  const favRandom = mulberry32(0x46415653); // "FAVS"

  while (chosen.size < Math.min(favoriteCount, properties.length)) {
    chosen.add(properties[Math.floor(favRandom() * properties.length)].id);
  }

  for (const propertyId of chosen) {
    await prisma.favorite.upsert({
      where: { userId_propertyId: { userId: buyer.id, propertyId } },
      create: { userId: buyer.id, propertyId },
      update: {},
    });
  }

  return { leads: leadCount, favorites: chosen.size };
}
