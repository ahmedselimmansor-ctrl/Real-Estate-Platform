'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, Layers, MapPin, Search, Users, X, type LucideIcon } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useI18n } from '@/hooks/use-i18n';
import { POPULAR_AREAS } from '@/lib/constants';
import { useAutocomplete } from '@/lib/queries';
import { routes, suggestionHref } from '@/lib/routes';
import { cn } from '@/lib/utils';
import type { AutocompleteSuggestion, AutocompleteType } from '@/types/search';

/**
 * Header omnibox — one field for "New Cairo", "Palm Hills", "3 bedroom villa".
 * Implements the WAI-ARIA combobox pattern against `GET /api/search/autocomplete`.
 */

const TYPE_ICONS: Record<AutocompleteType, LucideIcon> = {
  property: Building2,
  compound: Layers,
  developer: Users,
  area: MapPin,
  city: MapPin,
  query: Search,
};

const TYPE_LABELS: Record<AutocompleteType, { en: string; ar: string }> = {
  property: { en: 'Property', ar: 'عقار' },
  compound: { en: 'Compound', ar: 'كمبوند' },
  developer: { en: 'Developer', ar: 'مطور' },
  area: { en: 'Area', ar: 'منطقة' },
  city: { en: 'City', ar: 'مدينة' },
  query: { en: 'Search', ar: 'بحث' },
};

export interface OmniboxSearchProps {
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  defaultValue?: string;
  /** Fired after a navigation so parents can close a sheet/overlay. */
  onNavigate?: () => void;
  size?: 'default' | 'lg';
}

export function OmniboxSearch({
  className,
  placeholder,
  autoFocus,
  defaultValue = '',
  onNavigate,
  size = 'default',
}: OmniboxSearchProps) {
  const router = useRouter();
  const { locale, pick } = useI18n();

  const [term, setTerm] = React.useState(defaultValue);
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);

  const inputRef = React.useRef<HTMLInputElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const listboxId = React.useId();

  const debounced = useDebouncedValue(term.trim(), 250);
  const { data: suggestions = [], isFetching } = useAutocomplete(debounced, 8);

  const showSuggestions = debounced.length >= 2;
  const options: AutocompleteSuggestion[] = showSuggestions ? suggestions : [];

  // Close on outside click.
  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  React.useEffect(() => {
    setActiveIndex(-1);
  }, [debounced]);

  function go(href: string) {
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
    router.push(href);
    onNavigate?.();
  }

  function submitFreeText() {
    const query = term.trim();
    go(query ? routes.search({ q: query }) : routes.search());
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!options.length) return;
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => {
        const next = event.key === 'ArrowDown' ? current + 1 : current - 1;
        if (next < 0) return options.length - 1;
        if (next >= options.length) return 0;
        return next;
      });
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const active = activeIndex >= 0 ? options[activeIndex] : undefined;
      if (active) go(suggestionHref(active));
      else submitFreeText();
    }
  }

  const hasPanel = open && (showSuggestions || term.trim().length === 0);

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          submitFreeText();
        }}
      >
        <Input
          ref={inputRef}
          type="search"
          value={term}
          autoFocus={autoFocus}
          inputSize={size === 'lg' ? 'lg' : 'default'}
          placeholder={
            placeholder ??
            pick('Search area, compound or developer…', 'ابحث عن منطقة أو كمبوند أو مطور…')
          }
          aria-label={pick('Search properties', 'ابحث عن عقارات')}
          role="combobox"
          aria-expanded={hasPanel}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
          }
          startAdornment={<Search />}
          endAdornment={
            isFetching && showSuggestions ? (
              <Spinner size="xs" tone="muted" label={pick('Searching', 'جارٍ البحث')} />
            ) : term ? (
              <button
                type="button"
                onClick={() => {
                  setTerm('');
                  inputRef.current?.focus();
                }}
                className="pointer-events-auto rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={pick('Clear search', 'مسح البحث')}
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            ) : null
          }
          onChange={(event) => {
            setTerm(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="bg-card ps-10 pe-10 shadow-xs"
        />
      </form>

      {hasPanel ? (
        <div
          className={cn(
            'absolute inset-inline-full top-[calc(100%+0.5rem)] z-50 overflow-hidden',
            'rounded-xl border border-border bg-popover text-popover-foreground shadow-float',
            'animate-in fade-in-0 slide-in-from-top-2',
          )}
        >
          {showSuggestions ? (
            <ul id={listboxId} role="listbox" className="max-h-80 overflow-y-auto scrollbar-thin p-1.5">
              {options.map((suggestion, index) => {
                const Icon = TYPE_ICONS[suggestion.type] ?? Search;
                const typeLabel = TYPE_LABELS[suggestion.type];

                return (
                  <li key={`${suggestion.type}-${suggestion.id}-${index}`}>
                    <button
                      type="button"
                      id={`${listboxId}-option-${index}`}
                      role="option"
                      aria-selected={index === activeIndex}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => go(suggestionHref(suggestion))}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-start transition-colors',
                        index === activeIndex ? 'bg-muted' : 'hover:bg-muted/60',
                      )}
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {suggestion.text}
                        </span>
                        {suggestion.subtitle ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {suggestion.subtitle}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-[11px] font-medium text-muted-foreground uppercase">
                        {typeLabel ? (locale === 'ar' ? typeLabel.ar : typeLabel.en) : suggestion.type}
                      </span>
                    </button>
                  </li>
                );
              })}

              {!options.length && !isFetching ? (
                <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {pick('No matches. Press Enter to search anyway.', 'لا توجد نتائج. اضغط Enter للبحث.')}
                </li>
              ) : null}
            </ul>
          ) : (
            <div className="p-4">
              <p className="mb-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {pick('Popular areas', 'مناطق شائعة')}
              </p>
              <div className="flex flex-wrap gap-2">
                {POPULAR_AREAS.slice(0, 6).map((area) => (
                  <Link
                    key={area.slug}
                    href={routes.area(area.slug)}
                    onClick={() => {
                      setOpen(false);
                      onNavigate?.();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary-soft"
                  >
                    <MapPin className="size-3.5 text-primary" aria-hidden="true" />
                    {locale === 'ar' ? area.labelAr : area.labelEn}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
