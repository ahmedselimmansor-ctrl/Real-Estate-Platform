'use client';

import Link from 'next/link';
import { Mail, MapPin, Phone } from 'lucide-react';

import { Separator } from '@/components/ui/separator';
import { useI18n } from '@/hooks/use-i18n';
import {
  BRAND,
  FOOTER_SECTIONS,
  POPULAR_AREAS,
  SOCIAL_LINKS,
  TOP_DEVELOPERS,
} from '@/lib/constants';
import { formatPhone } from '@/lib/format';
import { routes } from '@/lib/routes';
import { NewsletterForm } from './newsletter-form';
import { SiteLogo } from './site-logo';

/** Global footer: brand blurb, link columns, area/developer directories, legal. */
export function SiteFooter() {
  const { locale, pick } = useI18n();
  const year = new Date().getFullYear();

  return (
    <footer className="mt-20 border-t border-border bg-surface">
      <div className="container-page py-14">
        <div className="grid gap-10 lg:grid-cols-12">
          {/* Brand + contact */}
          <div className="lg:col-span-4">
            <SiteLogo />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
              {locale === 'ar' ? BRAND.tagline.ar : BRAND.tagline.en}
              {', '}
              {pick(
                'browse every compound in Egypt, compare payment plans and talk to a real advisor.',
                'تصفح كل الكمبوندات في مصر، قارن خطط السداد وتحدث مع مستشار حقيقي.',
              )}
            </p>

            <ul className="mt-6 flex flex-col gap-3 text-sm">
              <li>
                <a
                  href={`tel:${BRAND.phone.replace(/\s/g, '')}`}
                  className="inline-flex items-center gap-2.5 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Phone className="size-4 text-primary" aria-hidden="true" />
                  <span dir="ltr" data-numeric>
                    {formatPhone(BRAND.phone)}
                  </span>
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${BRAND.email}`}
                  className="inline-flex items-center gap-2.5 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Mail className="size-4 text-primary" aria-hidden="true" />
                  {BRAND.email}
                </a>
              </li>
              <li className="inline-flex items-start gap-2.5 text-muted-foreground">
                <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <span>{locale === 'ar' ? BRAND.address.ar : BRAND.address.en}</span>
              </li>
            </ul>

            <div className="mt-6 flex items-center gap-2">
              {SOCIAL_LINKS.map((social) => {
                const Icon = social.icon;
                return (
                  <a
                    key={social.label}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={social.label}
                    className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    <Icon className="size-4" aria-hidden="true" />
                  </a>
                );
              })}
            </div>
          </div>

          {/* Link columns */}
          <div className="grid gap-8 sm:grid-cols-2 lg:col-span-5 lg:grid-cols-4">
            {FOOTER_SECTIONS.map((section) => (
              <nav key={section.titleEn} aria-label={section.titleEn}>
                <h3 className="mb-3 text-xs font-semibold tracking-wide text-foreground uppercase">
                  {locale === 'ar' ? section.titleAr : section.titleEn}
                </h3>
                <ul className="flex flex-col gap-2.5">
                  {section.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {locale === 'ar' ? link.labelAr : link.labelEn}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>

          {/* Newsletter */}
          <div className="lg:col-span-3">
            <h3 className="mb-1.5 text-sm font-semibold text-foreground">
              {pick('New launches, first', 'أحدث المشروعات أولاً')}
            </h3>
            <p className="mb-4 text-sm text-muted-foreground">
              {pick(
                'Price drops and launch dates from Egypt’s top developers.',
                'تخفيضات الأسعار ومواعيد إطلاق المشروعات من أكبر المطورين.',
              )}
            </p>
            <NewsletterForm />
          </div>
        </div>

        <Separator className="my-10" />

        {/* Directories */}
        <div className="grid gap-8 md:grid-cols-2">
          <section>
            <h3 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {pick('Properties by area', 'عقارات حسب المنطقة')}
            </h3>
            <ul className="flex flex-wrap gap-x-4 gap-y-2">
              {POPULAR_AREAS.map((area) => (
                <li key={area.slug}>
                  <Link
                    href={routes.area(area.slug)}
                    className="text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    {locale === 'ar' ? area.labelAr : area.labelEn}
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {pick('Top developers', 'أبرز المطورين')}
            </h3>
            <ul className="flex flex-wrap gap-x-4 gap-y-2">
              {TOP_DEVELOPERS.map((developer) => (
                <li key={developer.slug}>
                  <Link
                    href={routes.developer(developer.slug)}
                    className="text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    {locale === 'ar' ? developer.labelAr : developer.labelEn}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="container-page flex flex-col items-center justify-between gap-3 py-6 text-xs text-muted-foreground sm:flex-row">
          <p>
            © {year} {BRAND.name}
          </p>
          <div className="flex items-center gap-4">
            <Link href={routes.terms} className="transition-colors hover:text-foreground">
              {pick('Terms', 'الشروط')}
            </Link>
            <Link href={routes.privacy} className="transition-colors hover:text-foreground">
              {pick('Privacy', 'الخصوصية')}
            </Link>
            <Link href={routes.contact} className="transition-colors hover:text-foreground">
              {pick('Contact', 'تواصل معنا')}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
