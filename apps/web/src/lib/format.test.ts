import { describe, expect, it } from 'vitest';

import {
  formatArea,
  formatBytes,
  formatCompactEGP,
  formatEGP,
  formatNumber,
  formatPercent,
  formatPhone,
  formatPriceRange,
  toArabicNumerals,
} from './format';

/**
 * These render the numbers a buyer makes a decision on. A price that silently
 * comes out as "-" or loses a digit is worse than a crash, because the page
 * still looks fine.
 */
describe('formatNumber', () => {
  it('groups thousands', () => {
    expect(formatNumber(8_500_000)).toBe('8,500,000');
  });

  it('renders nothing rather than NaN or null', () => {
    expect(formatNumber(null)).toBe('-');
    expect(formatNumber(undefined)).toBe('-');
    expect(formatNumber(Number.NaN)).toBe('-');
  });

  it('keeps zero, which is a real value and not missing data', () => {
    expect(formatNumber(0)).toBe('0');
  });
});

describe('formatEGP', () => {
  it('puts the symbol before the number in English', () => {
    expect(formatEGP(8_500_000)).toBe('EGP 8,500,000');
  });

  it('puts it after in Arabic, where it reads right to left', () => {
    expect(formatEGP(8_500_000, { locale: 'ar' })).toBe('8,500,000 ج.م');
  });

  it('can drop the symbol for tables that carry it in the header', () => {
    expect(formatEGP(8_500_000, { withSymbol: false })).toBe('8,500,000');
  });

  it('does not print a currency symbol next to a missing amount', () => {
    expect(formatEGP(null)).toBe('-');
  });
});

describe('formatCompactEGP', () => {
  it('shortens millions, which is what a listing card shows', () => {
    expect(formatCompactEGP(8_500_000)).toContain('M');
    expect(formatCompactEGP(8_500_000)).toContain('EGP');
  });

  it('uses the Arabic word rather than the Latin abbreviation', () => {
    expect(formatCompactEGP(8_500_000, { locale: 'ar' })).toContain('مليون');
  });
});

describe('toArabicNumerals', () => {
  it('converts every Latin digit', () => {
    expect(toArabicNumerals('0123456789')).toBe('٠١٢٣٤٥٦٧٨٩');
  });

  it('leaves separators and letters alone', () => {
    expect(toArabicNumerals('8,500,000 ج.م')).toBe('٨,٥٠٠,٠٠٠ ج.م');
  });
});

describe('formatArea and formatPercent', () => {
  it('renders square metres with the unit', () => {
    expect(formatArea(180)).toContain('180');
    expect(formatArea(180)).toMatch(/m²|متر/);
  });

  it('renders a percentage', () => {
    expect(formatPercent(10)).toContain('10');
  });
});

describe('formatPriceRange', () => {
  it('shows both ends of a closed range', () => {
    expect(formatPriceRange(3_000_000, 9_000_000)).toBe('EGP 3M – 9M');
  });

  it('marks an open-ended minimum with a trailing +', () => {
    expect(formatPriceRange(3_000_000, null)).toBe('EGP 3M+');
  });

  it('shows a ceiling on its own when there is no floor', () => {
    expect(formatPriceRange(null, 9_000_000)).toBe('EGP 9M');
  });

  it('renders nothing when neither end is known', () => {
    expect(formatPriceRange(null, null)).toBe('-');
  });
});

describe('formatPhone', () => {
  it('returns something printable for an Egyptian mobile', () => {
    expect(formatPhone('+201050000000')).toBeTruthy();
  });

  it('does not invent a number when there is none', () => {
    expect(formatPhone(null)).toBe('-');
    expect(formatPhone('')).toBe('-');
  });
});

describe('formatBytes', () => {
  it('scales the unit to the size', () => {
    expect(formatBytes(1024)).toContain('KB');
    expect(formatBytes(1024 * 1024)).toContain('MB');
  });

  it('handles zero without dividing by a log of it', () => {
    expect(formatBytes(0)).toContain('0');
  });
});
