'use client';

import * as React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

/**
 * next-themes wrapper. `attribute="class"` matches the `@custom-variant dark`
 * declaration in globals.css, and the inline script it injects sets the class
 * before first paint so there is no flash and no hydration warning.
 */
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="topchoice.theme"
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
