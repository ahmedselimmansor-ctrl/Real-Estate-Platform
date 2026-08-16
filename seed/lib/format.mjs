/**
 * Locale-independent formatting helpers.
 *
 * Intl is deliberately avoided so output never depends on the host ICU build —
 * the generated JSON must be byte-identical everywhere.
 */

/** 8500000 -> "8,500,000" */
export function groupDigits(value) {
  const rounded = Math.round(Number(value));
  const sign = rounded < 0 ? '-' : '';
  const digits = Math.abs(rounded).toString();
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 8500000 -> "EGP 8,500,000" */
export function egp(value) {
  return `EGP ${groupDigits(value)}`;
}

/** 8500000 -> "8,500,000 جنيه" */
export function egpAr(value) {
  return `${groupDigits(value)} جنيه`;
}

/** 8500000 -> "8.5M" (compact, English copy only) */
export function compactEgp(value) {
  const n = Number(value);
  if (n >= 1_000_000) {
    const millions = n / 1_000_000;
    const text = millions >= 10 ? millions.toFixed(0) : millions.toFixed(1).replace(/\.0$/, '');
    return `EGP ${text}M`;
  }
  return egp(n);
}

const EN_ORDINALS = [
  'ground',
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
  'eleventh',
  'twelfth',
];

/** 0 -> "ground", 5 -> "fifth", 20 -> "20th" */
export function floorOrdinalEn(floor) {
  if (floor >= 0 && floor < EN_ORDINALS.length) return EN_ORDINALS[floor];
  return `${floor}th`;
}

const AR_ORDINALS = [
  'الأرضي',
  'الأول',
  'الثاني',
  'الثالث',
  'الرابع',
  'الخامس',
  'السادس',
  'السابع',
  'الثامن',
  'التاسع',
  'العاشر',
  'الحادي عشر',
  'الثاني عشر',
];

export function floorOrdinalAr(floor) {
  if (floor >= 0 && floor < AR_ORDINALS.length) return AR_ORDINALS[floor];
  return `رقم ${floor}`;
}

/** ISO date-only string, e.g. "2027-06-30" */
export function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

/** Full ISO timestamp with milliseconds, e.g. "2026-01-10T00:00:00.000Z" */
export function isoTimestamp(date) {
  return date.toISOString();
}

/** "Q2 2027" */
export function quarterLabelEn(dateString) {
  const [year, month] = dateString.split('-').map(Number);
  return `Q${Math.ceil(month / 3)} ${year}`;
}

/** "الربع الثاني 2027" */
export function quarterLabelAr(dateString) {
  const [year, month] = dateString.split('-').map(Number);
  const names = ['الأول', 'الثاني', 'الثالث', 'الرابع'];
  return `الربع ${names[Math.ceil(month / 3) - 1]} ${year}`;
}

/** Join an English list: ["a","b","c"] -> "a, b and c" */
export function listEn(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Join an Arabic list: ["أ","ب","ج"] -> "أ، ب و ج" */
export function listAr(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join('، ')} و${items[items.length - 1]}`;
}
