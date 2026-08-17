import { format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns';
import { ar as arLocale, enUS as enLocale } from 'date-fns/locale';
import type { Locale } from '@/types/enums';

/**
 * Presentation helpers. Egyptian market conventions:
 *   price   → `EGP 8,500,000`      (never `E£`, never trailing `.00`)
 *   compact → `EGP 8.5M`
 *   area    → `180 m²`
 *   Arabic  → optional Arabic-Indic numerals (`٨٬٥٠٠٬٠٠٠`)
 */

export type Numerals = 'latn' | 'arab';

export interface NumberFormatOptions {
  locale?: Locale;
  /** Force a numbering system; defaults to latin for `en`, latin for `ar` too
   *  (TopChoice shows western digits by default) unless explicitly requested. */
  numerals?: Numerals;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

const ARABIC_INDIC = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'] as const;

/** Convert every ASCII digit in a string to Arabic-Indic. */
export function toArabicNumerals(value: string): string {
  return value.replace(/[0-9]/g, (digit) => ARABIC_INDIC[Number(digit)]);
}

function intlLocale(locale: Locale = 'en', numerals: Numerals = 'latn'): string {
  const base = locale === 'ar' ? 'ar-EG' : 'en-EG';
  return `${base}-u-nu-${numerals}`;
}

export function formatNumber(value: number | null | undefined, options: NumberFormatOptions = {}): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  const { locale = 'en', numerals = 'latn', minimumFractionDigits, maximumFractionDigits } = options;
  return new Intl.NumberFormat(intlLocale(locale, numerals), {
    minimumFractionDigits: minimumFractionDigits ?? 0,
    maximumFractionDigits: maximumFractionDigits ?? 0,
  }).format(value);
}

/** `8500000` → `EGP 8,500,000` (Arabic: `8,500,000 ج.م`). */
export function formatEGP(
  amount: number | null | undefined,
  options: NumberFormatOptions & { withSymbol?: boolean } = {},
): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '-';
  const { locale = 'en', withSymbol = true } = options;
  const number = formatNumber(amount, options);
  if (!withSymbol) return number;
  return locale === 'ar' ? `${number} ج.م` : `EGP ${number}`;
}

const COMPACT_TIERS = [
  { threshold: 1_000_000_000, suffix: { en: 'B', ar: 'مليار' } },
  { threshold: 1_000_000, suffix: { en: 'M', ar: 'مليون' } },
  { threshold: 1_000, suffix: { en: 'K', ar: 'ألف' } },
] as const;

/** `8500000` → `8.5M`. Keeps one decimal only when it carries information. */
export function formatCompactNumber(
  value: number | null | undefined,
  options: NumberFormatOptions = {},
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  const { locale = 'en' } = options;
  const abs = Math.abs(value);
  const tier = COMPACT_TIERS.find((entry) => abs >= entry.threshold);
  if (!tier) return formatNumber(value, options);

  const scaled = value / tier.threshold;
  const decimals = Math.abs(scaled) < 10 && Math.round(scaled * 10) % 10 !== 0 ? 1 : 0;
  const number = formatNumber(scaled, {
    ...options,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const suffix = locale === 'ar' ? tier.suffix.ar : tier.suffix.en;
  return locale === 'ar' ? `${number} ${suffix}` : `${number}${suffix}`;
}

/** `8500000` → `EGP 8.5M` — used on cards and map pins. */
export function formatCompactEGP(
  amount: number | null | undefined,
  options: NumberFormatOptions = {},
): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '-';
  const { locale = 'en' } = options;
  const compact = formatCompactNumber(amount, options);
  return locale === 'ar' ? `${compact} ج.م` : `EGP ${compact}`;
}

/** `47222` → `EGP 47,222 / m²`. */
export function formatPricePerMeter(
  value: number | null | undefined,
  options: NumberFormatOptions = {},
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  const { locale = 'en' } = options;
  const price = formatEGP(value, options);
  return locale === 'ar' ? `${price} / م²` : `${price} / m²`;
}

/** `180` → `180 m²` (Arabic: `180 م²`). */
export function formatArea(
  sqm: number | null | undefined,
  options: NumberFormatOptions = {},
): string {
  if (sqm === null || sqm === undefined || Number.isNaN(sqm)) return '-';
  const { locale = 'en' } = options;
  return `${formatNumber(sqm, options)} ${locale === 'ar' ? 'م²' : 'm²'}`;
}

export function formatPercent(
  value: number | null | undefined,
  options: NumberFormatOptions = {},
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return `${formatNumber(value, options)}%`;
}

/** `2` → `2 Bedrooms` / `Studio` when zero. */
export function formatBedrooms(count: number, locale: Locale = 'en'): string {
  if (count <= 0) return locale === 'ar' ? 'استوديو' : 'Studio';
  if (locale === 'ar') return count === 1 ? 'غرفة واحدة' : count === 2 ? 'غرفتان' : `${count} غرف`;
  return count === 1 ? '1 Bedroom' : `${count} Bedrooms`;
}

export function formatBathrooms(count: number, locale: Locale = 'en'): string {
  if (locale === 'ar') return count === 1 ? 'حمام واحد' : count === 2 ? 'حمامان' : `${count} حمامات`;
  return count === 1 ? '1 Bathroom' : `${count} Bathrooms`;
}

// ------------------------------------------------------------------- dates --

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : typeof value === 'number' ? new Date(value) : parseISO(value);
  return isValid(date) ? date : null;
}

function dateFnsLocale(locale: Locale) {
  return locale === 'ar' ? arLocale : enLocale;
}

/** `2027-06-30` → `30 Jun 2027`. */
export function formatDate(
  value: string | number | Date | null | undefined,
  options: { locale?: Locale; pattern?: string; numerals?: Numerals } = {},
): string {
  const date = toDate(value);
  if (!date) return '-';
  const { locale = 'en', pattern = 'd MMM yyyy', numerals = 'latn' } = options;
  const output = format(date, pattern, { locale: dateFnsLocale(locale) });
  return numerals === 'arab' ? toArabicNumerals(output) : output;
}

/** `2027-06-30` → `Jun 2027` — the handover label used on cards. */
export function formatMonthYear(
  value: string | number | Date | null | undefined,
  options: { locale?: Locale; numerals?: Numerals } = {},
): string {
  return formatDate(value, { ...options, pattern: 'MMM yyyy' });
}

/** `2027-06-30` → `Q2 2027` — how Egyptian developers quote delivery. */
export function formatDeliveryQuarter(
  value: string | number | Date | null | undefined,
  options: { locale?: Locale; numerals?: Numerals } = {},
): string {
  const date = toDate(value);
  if (!date) return '-';
  const { locale = 'en', numerals = 'latn' } = options;
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  const year = date.getFullYear();
  const label = locale === 'ar' ? `الربع ${quarter} ${year}` : `Q${quarter} ${year}`;
  return numerals === 'arab' ? toArabicNumerals(label) : label;
}

/** `2026-08-01` → `2 weeks ago` / `منذ أسبوعين`. */
export function formatRelativeTime(
  value: string | number | Date | null | undefined,
  options: { locale?: Locale; numerals?: Numerals } = {},
): string {
  const date = toDate(value);
  if (!date) return '-';
  const { locale = 'en', numerals = 'latn' } = options;
  const output = formatDistanceToNowStrict(date, {
    addSuffix: true,
    locale: dateFnsLocale(locale),
  });
  return numerals === 'arab' ? toArabicNumerals(output) : output;
}

// ------------------------------------------------------------------ misc ----

/** `01001234567` / `+201001234567` → `+20 100 123 4567`. */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return '-';
  const digits = raw.replace(/[^\d+]/g, '');
  const national = digits.startsWith('+20')
    ? digits.slice(3)
    : digits.startsWith('0020')
      ? digits.slice(4)
      : digits.startsWith('0')
        ? digits.slice(1)
        : digits;
  if (national.length !== 10) return raw;
  return `+20 ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
}

/** `EGP 8.5M – 12M` range label used on compound cards. */
export function formatPriceRange(
  min: number | null | undefined,
  max: number | null | undefined,
  options: NumberFormatOptions = {},
): string {
  if (!min && !max) return '-';
  if (min && !max) return `${formatCompactEGP(min, options)}+`;
  if (!min && max) return `${formatCompactEGP(max, options)}`;
  return `${formatCompactEGP(min, options)} – ${formatCompactNumber(max, options)}`;
}

/** `180` – `400` → `180 – 400 m²`. */
export function formatAreaRange(
  min: number | null | undefined,
  max: number | null | undefined,
  options: NumberFormatOptions = {},
): string {
  if (!min && !max) return '-';
  if (min && max) return `${formatNumber(min, options)} – ${formatArea(max, options)}`;
  return formatArea(min ?? max, options);
}

/** Bytes → `2.4 MB`, used by the media uploader in later stages. */
export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : decimals)} ${units[index]}`;
}
