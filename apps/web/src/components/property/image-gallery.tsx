'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Expand, X } from 'lucide-react';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { PropertyImage } from '@/types/property';

interface ImageGalleryProps {
  images: PropertyImage[];
  alt: string;
  className?: string;
}

/**
 * Hero + thumbnail strip with a full-screen lightbox. Keyboard: ←/→ to move,
 * Escape to close (handled by the dialog).
 */
export function ImageGallery({ images, alt, className }: ImageGalleryProps) {
  const ordered = [...images].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return (a.order ?? 0) - (b.order ?? 0);
  });

  const [index, setIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const count = ordered.length;
  const current = ordered[index];

  const go = useCallback(
    (delta: number) => setIndex((value) => (count === 0 ? 0 : (value + delta + count) % count)),
    [count],
  );

  useEffect(() => {
    if (!lightboxOpen) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') go(1);
      if (event.key === 'ArrowLeft') go(-1);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxOpen, go]);

  if (count === 0) {
    return (
      <div
        className={cn(
          'grid aspect-[16/10] place-items-center rounded-xl bg-muted text-sm text-muted-foreground',
          className,
        )}
      >
        No photos available
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="group relative aspect-[16/10] overflow-hidden rounded-xl bg-muted">
        <Image
          src={current.url}
          alt={`${alt}, photo ${index + 1} of ${count}`}
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 60vw"
          className="object-cover"
        />

        {count > 1 && (
          <>
            <GalleryButton side="start" onClick={() => go(-1)} label="Previous photo">
              <ChevronLeft className="size-5" />
            </GalleryButton>
            <GalleryButton side="end" onClick={() => go(1)} label="Next photo">
              <ChevronRight className="size-5" />
            </GalleryButton>
          </>
        )}

        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          className="absolute bottom-3 end-3 inline-flex items-center gap-1.5 rounded-lg bg-background/90 px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur transition-colors hover:bg-background"
        >
          <Expand className="size-3.5" />
          View all {count}
        </button>
      </div>

      {count > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {ordered.map((image, position) => (
            <button
              key={`${image.url}-${position}`}
              type="button"
              onClick={() => setIndex(position)}
              aria-label={`Show photo ${position + 1}`}
              aria-current={position === index}
              className={cn(
                'relative aspect-[4/3] w-24 shrink-0 overflow-hidden rounded-lg transition-all',
                position === index
                  ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                  : 'opacity-70 hover:opacity-100',
              )}
            >
              <Image
                src={image.url}
                alt=""
                fill
                sizes="96px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}

      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent
          showCloseButton={false}
          className="max-w-[96vw] border-0 bg-transparent p-0 shadow-none sm:max-w-5xl"
        >
          <DialogTitle className="sr-only">{alt}, photo gallery</DialogTitle>

          <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-black">
            <Image
              src={current.url}
              alt={`${alt}, photo ${index + 1} of ${count}`}
              fill
              sizes="96vw"
              className="object-contain"
            />

            {count > 1 && (
              <>
                <GalleryButton side="start" onClick={() => go(-1)} label="Previous photo">
                  <ChevronLeft className="size-6" />
                </GalleryButton>
                <GalleryButton side="end" onClick={() => go(1)} label="Next photo">
                  <ChevronRight className="size-6" />
                </GalleryButton>
              </>
            )}

            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              aria-label="Close gallery"
              className="absolute end-3 top-3 grid size-9 place-items-center rounded-full bg-background/90 shadow-sm backdrop-blur hover:bg-background"
            >
              <X className="size-4" />
            </button>

            <p className="absolute bottom-3 start-1/2 -translate-x-1/2 rounded-full bg-background/90 px-3 py-1 text-xs tabular-nums backdrop-blur">
              {index + 1} / {count}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GalleryButton({
  side,
  onClick,
  label,
  children,
}: {
  side: 'start' | 'end';
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'absolute top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full',
        'bg-background/90 shadow-sm backdrop-blur transition-all hover:bg-background',
        'opacity-0 focus-visible:opacity-100 group-hover:opacity-100 md:opacity-100',
        side === 'start' ? 'start-3' : 'end-3',
      )}
    >
      {children}
    </button>
  );
}
