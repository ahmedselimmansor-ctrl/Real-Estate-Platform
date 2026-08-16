import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { api } from '@/lib/api';
import { absoluteUrl } from '@/lib/utils';
import type { Property } from '@/types/property';
import { PropertyDetail } from './property-detail';

interface PageProps {
  params: Promise<{ slug: string }>;
}

/** Fetched on the server so the page is indexable and the LCP image is real. */
async function fetchProperty(slug: string): Promise<Property | null> {
  try {
    return await api.get<Property>(`/properties/${encodeURIComponent(slug)}`, {
      // Listings change rarely; revalidate rather than refetch on every hit.
      next: { revalidate: 300, tags: [`property:${slug}`] },
    });
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const property = await fetchProperty(slug);

  if (!property) {
    return { title: 'Property not found' };
  }

  const title = property.title.en;
  const description = property.description.en.slice(0, 300);
  const image = property.media.images.find((entry) => entry.isPrimary)?.url;

  return {
    title,
    description,
    alternates: { canonical: `/property/${property.slug}` },
    openGraph: {
      title,
      description,
      type: 'website',
      url: absoluteUrl(`/property/${property.slug}`),
      images: image ? [{ url: image, width: 1600, height: 900, alt: property.title.en }] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: image ? [image] : [],
    },
  };
}

export default async function PropertyPage({ params }: PageProps) {
  const { slug } = await params;
  const property = await fetchProperty(slug);

  if (!property) {
    notFound();
  }

  return (
    <>
      <script
        type="application/ld+json"
        // Structured data for the listing — Google reads this for rich results.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildJsonLd(property)) }}
      />
      <PropertyDetail property={property} />
    </>
  );
}

function buildJsonLd(property: Property) {
  const image = property.media.images.map((entry) => entry.url).slice(0, 6);

  return {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: property.title.en,
    description: property.description.en,
    url: absoluteUrl(`/property/${property.slug}`),
    image,
    datePosted: property.publishedAt,
    identifier: property.referenceNo,
    offers: {
      '@type': 'Offer',
      price: property.price.amount,
      priceCurrency: property.price.currency,
      availability:
        property.status === 'available'
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
    },
    address: {
      '@type': 'PostalAddress',
      streetAddress: property.location.address || undefined,
      addressLocality: property.location.areaName,
      addressRegion: property.location.governorate,
      addressCountry: 'EG',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: property.location.geo.coordinates[1],
      longitude: property.location.geo.coordinates[0],
    },
    numberOfRooms: property.specs.bedrooms,
    numberOfBathroomsTotal: property.specs.bathrooms,
    floorSize: {
      '@type': 'QuantitativeValue',
      value: property.specs.areaSqm,
      unitCode: 'MTK',
    },
  };
}
