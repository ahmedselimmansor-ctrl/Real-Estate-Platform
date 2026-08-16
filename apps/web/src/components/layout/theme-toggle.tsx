'use client';

import { useTheme } from 'next-themes';
import { Check, Monitor, Moon, Sun } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useI18n } from '@/hooks/use-i18n';
import { useMounted } from '@/hooks/use-mounted';
import { cn } from '@/lib/utils';
import { useUiStore, type ThemePreference } from '@/store/ui.store';

const OPTIONS: Array<{ value: ThemePreference; en: string; ar: string; icon: typeof Sun }> = [
  { value: 'light', en: 'Light', ar: 'فاتح', icon: Sun },
  { value: 'dark', en: 'Dark', ar: 'داكن', icon: Moon },
  { value: 'system', en: 'System', ar: 'النظام', icon: Monitor },
];

/**
 * Theme switcher. next-themes owns the `.dark` class; we mirror the choice into
 * the ui store so non-DOM consumers (charts, map styles) can read it.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const mounted = useMounted();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const mirrorTheme = useUiStore((state) => state.setTheme);
  const { locale, pick } = useI18n();

  const isDark = mounted && resolvedTheme === 'dark';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn(className)}
          aria-label={pick('Change theme', 'تغيير المظهر')}
        >
          {/* Rendered without `mounted` gating the icon would flip after hydration. */}
          {isDark ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-40">
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          const isActive = mounted && theme === option.value;

          return (
            <DropdownMenuItem
              key={option.value}
              onSelect={() => {
                setTheme(option.value);
                mirrorTheme(option.value);
              }}
            >
              <Icon aria-hidden="true" />
              <span>{locale === 'ar' ? option.ar : option.en}</span>
              {isActive ? <Check className="ms-auto size-4 text-primary" aria-hidden="true" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
