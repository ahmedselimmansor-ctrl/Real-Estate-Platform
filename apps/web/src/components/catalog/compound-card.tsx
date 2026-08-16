import Image from 'next/image';
import Link from 'next/link';
import { MapPin } from 'lucide-react';

import { T } from '@/components/i18n/t';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatCompactEGP } from '@/lib/format';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';
import type { Compound } from '@/types/catalog';

/**
 * A compound is a masterplan, so the card leads with the two figures a buyer
 * actually shops on: what units start at, and when the developer hands over.
 */
export function CompoundCard({
  compound,
  className,
  priority = false,
}: {
  compound: Compound;
  className?: string;
  priority?: boolean;
}) {
  const image = compound.images?.[0] ?? null;

  return (
    <Card
      className={cn(
        'group overflow-hidden border-border/60 p-0 transition-all duration-200',
        'hover:-translate-y-0.5 hover:shadow-lg',
        className,
      )}
    >
      <Link href={routes.compound(compound.slug)} className="block focus:outline-none">
        <div className="relative aspect-[16/10] overflow-hidden bg-muted">
          {image ? (
            <Image
              src={image}
              alt={compound.name}
              fill
              priority={priority}
              sizes="(max-width: 768px) 100vw, 33vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : null}

          {compound.isFeatured && (
            <Badge className="absolute start-3 top-3 border-0 bg-featured text-featured-foreground">
              <T en="Featured" ar="مميز" />
            </Badge>
          )}

          {compound.deliveryYear ? (
            <span className="figure absolute end-3 top-3 rounded-full bg-background/92 px-2.5 py-1 text-xs backdrop-blur">
              <T en="Handover" ar="تسليم" /> {compound.deliveryYear}
            </span>
          ) : null}
        </div>

        <div className="space-y-3 p-4">
          <div>
            <p className="eyebrow">
              <T en={compound.developer?.name ?? ''} ar={compound.developer?.nameAr ?? ''} />
            </p>
            <h3 className="display mt-1.5 text-lg text-foreground group-hover:text-primary">
              <T en={compound.name} ar={compound.nameAr} />
            </h3>
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3" aria-hidden />
              <T en={compound.area?.nameEn ?? ''} ar={compound.area?.nameAr ?? ''} />, {compound.area?.city}
            </p>
          </div>

          <dl className="figure grid grid-cols-2 gap-3 border-t border-border/60 pt-3 text-xs">
            <div>
              <dt className="text-muted-foreground">
                <T en="Units from" ar="تبدأ من" />
              </dt>
              <dd className="mt-0.5 text-sm text-foreground">
                {compound.startingPrice ? (
                  formatCompactEGP(compound.startingPrice)
                ) : (
                  <T en="On request" ar="عند الطلب" />
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                <T en="Plan" ar="الخطة" />
              </dt>
              <dd className="mt-0.5 text-sm text-foreground">
                {compound.downPaymentPercent ?? 0}% / {compound.installmentYears ?? 0}y
              </dd>
            </div>
          </dl>
        </div>
      </Link>
    </Card>
  );
}
