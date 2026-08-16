'use client';

import { useCallback, useMemo } from 'react';

import {
  formatArea,
  formatCompactEGP,
  formatDate,
  formatEGP,
  formatNumber,
  formatRelativeTime,
} from '@/lib/format';
import type { LocalizedText } from '@/types/common';
import { useUiStore } from '@/store/ui.store';

/**
 * Locale-bound presentation helpers. Components call `t(property.title)` and
 * `fmt.price(...)` instead of threading the locale through every call site.
 */
export function useI18n() {
  const locale = useUiStore((state) => state.locale);
  const dir = useUiStore((state) => state.dir);

  const t = useCallback(
    (text: LocalizedText | string | null | undefined): string => {
      if (!text) return '';
      if (typeof text === 'string') return text;
      return (locale === 'ar' ? text.ar : text.en) || text.en || text.ar || '';
    },
    [locale],
  );

  /** Pick between an English and Arabic label pair. */
  const pick = useCallback((en: string, ar: string) => (locale === 'ar' ? ar : en), [locale]);

  const fmt = useMemo(
    () => ({
      price: (value: number | null | undefined) => formatEGP(value, { locale }),
      compactPrice: (value: number | null | undefined) => formatCompactEGP(value, { locale }),
      number: (value: number | null | undefined) => formatNumber(value, { locale }),
      area: (value: number | null | undefined) => formatArea(value, { locale }),
      date: (value: string | Date | null | undefined) => formatDate(value, { locale }),
      relative: (value: string | Date | null | undefined) => formatRelativeTime(value, { locale }),
    }),
    [locale],
  );

  return { locale, dir, isRtl: dir === 'rtl', t, pick, fmt };
}
