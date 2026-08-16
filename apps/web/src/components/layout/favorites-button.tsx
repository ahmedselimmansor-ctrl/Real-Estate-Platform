'use client';

import Link from 'next/link';
import { Heart } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/hooks/use-i18n';
import { useMounted } from '@/hooks/use-mounted';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { useFavoritesCount } from '@/store/favorites.store';

/** Header shortcut to saved listings with a live count badge. */
export function FavoritesButton({ className }: { className?: string }) {
  const mounted = useMounted();
  const count = useFavoritesCount();
  const { pick } = useI18n();

  const label = pick('Saved properties', 'العقارات المحفوظة');

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button asChild variant="ghost" size="icon-sm" className={cn('relative', className)}>
          <Link href={routes.favorites} aria-label={label}>
            <Heart aria-hidden="true" />
            {mounted && count > 0 ? (
              <span
                className="absolute -top-1 -end-1 flex min-w-4.5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-semibold text-destructive-foreground"
                aria-hidden="true"
              >
                {count > 99 ? '99+' : count}
              </span>
            ) : null}
            {mounted && count > 0 ? <span className="sr-only">{count}</span> : null}
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
