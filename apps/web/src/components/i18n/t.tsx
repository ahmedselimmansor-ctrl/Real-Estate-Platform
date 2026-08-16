'use client';

import { useUiStore } from '@/store/ui.store';

export interface TProps {
  en: string;
  ar: string;
}

/**
 * Renders a string in the reader's language.
 *
 * The locale is client state (persisted, so it survives a reload), which server
 * components cannot read. Rather than turn every page into a client component
 * just to translate its copy, pages stay on the server for data fetching and
 * SEO and drop this leaf in wherever a string appears. It matches how the
 * header and footer already localise.
 *
 * Server-rendered HTML carries the English string and the client swaps it on
 * hydration, so English stays the indexable default.
 *
 *   <T en="Compounds" ar="الكمبوندات" />
 */
export function T({ en, ar }: TProps) {
  const locale = useUiStore((state) => state.locale);
  return <>{locale === 'ar' ? ar : en}</>;
}

/**
 * Same choice as a plain string, for places that need one: `aria-label`,
 * `placeholder`, `title`, `alt`. Client components only.
 */
export function useT(): (en: string, ar: string) => string {
  const locale = useUiStore((state) => state.locale);
  return (en, ar) => (locale === 'ar' ? ar : en);
}
