import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Cairo, IBM_Plex_Mono, Inter } from 'next/font/google';
import { Toaster } from 'sonner';

import { ChatWidgetMount } from '@/components/chat/chat-widget-mount';
import { SiteFooter } from '@/components/layout/footer';
import { SiteHeader } from '@/components/layout/header';
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav';
import { LocaleScript } from '@/components/providers/locale-provider';
import { BRAND } from '@/lib/constants';
import { publicEnv } from '@/lib/env';
import { Providers } from './providers';

import './globals.css';

/* Latin UI type. Both families are variable fonts, so no `weight` axis is
   pinned, the whole 400–700 range the design system uses is available. */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  fallback: ['system-ui', 'arial'],
});

/* Arabic type — used whenever `lang="ar"` / `dir="rtl"`. */
/* Display face. Architectural, slightly irregular widths, used sparingly for
   headlines and the affordability instrument. */
const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  axes: ['opsz'],
});

/* Every figure on the site is monospaced: prices, instalments, m², percentages,
   delivery dates, reference numbers. The market sells a payment schedule, so
   the type should read like one, and columns of numbers line up. */
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-mono-figures',
  weight: ['400', '500', '600'],
  display: 'swap',
});

const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  variable: '--font-cairo',
  display: 'swap',
  fallback: ['system-ui', 'arial'],
});

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.siteUrl),
  title: {
    default: `${BRAND.name}, Buy a home in Egypt`,
    template: `%s | ${BRAND.name}`,
  },
  description:
    'Browse apartments, villas and chalets across New Cairo, Sheikh Zayed, the North Coast and the New Capital. Compare compounds, payment plans and developers on TopChoice.',
  applicationName: BRAND.name,
  keywords: [
    'Egypt real estate',
    'New Cairo apartments',
    'Sheikh Zayed villas',
    'North Coast chalets',
    'New Administrative Capital',
    'compounds Egypt',
    'payment plans',
  ],
  openGraph: {
    type: 'website',
    siteName: BRAND.name,
    title: `${BRAND.name}, Buy a home in Egypt`,
    description:
      'Every compound in Egypt in one place: prices in EGP, payment plans, delivery dates and real advisors.',
    locale: 'en_EG',
    alternateLocale: ['ar_EG'],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${BRAND.name}, Buy a home in Egypt`,
    description: 'Compare compounds, payment plans and developers across Egypt.',
  },
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1220' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    /* `lang`/`dir` start at the SSR default and are corrected before paint by
       `LocaleScript`, then kept in sync by `LocaleSync`, hence the suppression. */
    <html
      lang="en"
      dir="ltr"
      suppressHydrationWarning
      className={`${inter.variable} ${cairo.variable} ${bricolage.variable} ${plexMono.variable}`}
    >
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        <LocaleScript />

        <Providers>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-100 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
          >
            Skip to content
          </a>

          <div className="flex min-h-dvh flex-col">
            <SiteHeader />

            <main id="main-content" className="flex-1 pb-16 lg:pb-0">
              {children}
            </main>

            <SiteFooter />
          </div>

          <MobileBottomNav />

          {/* Stage 3 mounts the RAG chat widget here (fixed bottom-right, z-60). */}
          <ChatWidgetMount />
        </Providers>

        <Toaster richColors position="top-center" closeButton expand={false} />
      </body>
    </html>
  );
}
