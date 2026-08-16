import { buildUniqueSlug, slugify } from './slug.util';

describe('slugify', () => {
  it('normalises marketing names into URL slugs', () => {
    expect(slugify('Palm Hills — New Cairo!')).toBe('palm-hills-new-cairo');
    expect(slugify('  6th of October  ')).toBe('6th-of-october');
    expect(slugify("Ora Developers's ZED")).toBe('ora-developerss-zed');
  });

  it('falls back when nothing ASCII survives', () => {
    expect(slugify('القاهرة الجديدة', 'area')).toBe('area');
  });
});

describe('buildUniqueSlug', () => {
  it('returns the base slug when it is free', async () => {
    const slug = await buildUniqueSlug('SODIC East', async () => false);
    expect(slug).toBe('sodic-east');
  });

  it('appends an incrementing suffix while the slug is taken', async () => {
    const taken = new Set(['sodic-east', 'sodic-east-2']);
    const slug = await buildUniqueSlug('SODIC East', async (candidate) => taken.has(candidate));
    expect(slug).toBe('sodic-east-3');
  });
});
