'use client';

import { Languages } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useMounted } from '@/hooks/use-mounted';
import { LOCALE_LABELS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/ui.store';

/** EN ⇄ AR switch. Flipping the locale flips `<html dir>` via `LocaleSync`. */
export function LanguageToggle({ className, compact = false }: { className?: string; compact?: boolean }) {
  const mounted = useMounted();
  const locale = useUiStore((state) => state.locale);
  const toggleLocale = useUiStore((state) => state.toggleLocale);

  const next = locale === 'en' ? 'ar' : 'en';
  const label = mounted ? LOCALE_LABELS[next].native : LOCALE_LABELS.ar.native;

  const button = (
    <Button
      variant="ghost"
      size={compact ? 'icon-sm' : 'sm'}
      onClick={toggleLocale}
      aria-label={`Switch to ${LOCALE_LABELS[next].en}`}
      className={cn('font-semibold', className)}
    >
      <Languages aria-hidden="true" />
      {compact ? null : <span suppressHydrationWarning>{label}</span>}
    </Button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{`Switch to ${LOCALE_LABELS[next].en}`}</TooltipContent>
    </Tooltip>
  );
}
