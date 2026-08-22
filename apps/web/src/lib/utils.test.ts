import { describe, expect, it } from 'vitest';

import {
  clamp,
  cn,
  initials,
  joinUrl,
  pruneEmpty,
  slugify,
  stableStringify,
  toggleInArray,
  truncate,
  unique,
  uuid,
} from './utils';

describe('cn', () => {
  it('merges conflicting Tailwind utilities, last one winning', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('drops falsy entries so conditional classes are safe', () => {
    expect(cn('a', false && 'b', undefined, null, 'c')).toBe('a c');
  });
});

describe('uuid', () => {
  it('produces a v4-shaped id', () => {
    expect(uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('does not repeat itself', () => {
    const ids = new Set(Array.from({ length: 500 }, uuid));
    expect(ids.size).toBe(500);
  });
});

describe('joinUrl', () => {
  it('joins without doubling the slash', () => {
    expect(joinUrl('https://x.test/', '/a')).toBe('https://x.test/a');
    expect(joinUrl('https://x.test', 'a')).toBe('https://x.test/a');
  });

  it('returns an absolute path untouched', () => {
    expect(joinUrl('https://x.test', 'https://cdn.test/i.png')).toBe('https://cdn.test/i.png');
  });

  it('returns the base when the path is empty', () => {
    expect(joinUrl('https://x.test', '')).toBe('https://x.test');
  });
});

describe('pruneEmpty', () => {
  it('removes undefined, null, empty strings and empty arrays', () => {
    expect(pruneEmpty({ a: 1, b: undefined, c: null, d: '', e: [], f: [1] })).toEqual({ a: 1, f: [1] });
  });

  it('keeps zero and false, which are real values', () => {
    expect(pruneEmpty({ a: 0, b: false })).toEqual({ a: 0, b: false });
  });
});

describe('clamp', () => {
  it('bounds a value on both sides and passes through what already fits', () => {
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(5, 0, 10)).toBe(5);
  });
});

describe('stableStringify', () => {
  it('is insensitive to key order, which is the whole point for cache keys', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
  });

  it('preserves array order, which is meaningful', () => {
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
  });

  it('sorts nested objects too', () => {
    expect(stableStringify({ x: { b: 1, a: 2 } })).toBe(stableStringify({ x: { a: 2, b: 1 } }));
  });

  it('omits undefined members so an absent key and an undefined one agree', () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe(stableStringify({ a: 1 }));
  });

  it('handles primitives and null', () => {
    expect(stableStringify(null)).toBe('null');
    expect(stableStringify(42)).toBe('42');
    expect(stableStringify('s')).toBe('"s"');
  });
});

describe('unique and toggleInArray', () => {
  it('dedupes while keeping first-seen order', () => {
    expect(unique([3, 1, 3, 2, 1])).toEqual([3, 1, 2]);
  });

  it('adds a missing entry and removes a present one', () => {
    expect(toggleInArray(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleInArray(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('does not mutate the input', () => {
    const input = ['a'];
    toggleInArray(input, 'b');
    expect(input).toEqual(['a']);
  });
});

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('New Cairo')).toBe('new-cairo');
  });

  it('collapses punctuation and trims stray hyphens', () => {
    expect(slugify('  Palm Hills — New Cairo!  ')).toBe('palm-hills-new-cairo');
  });

  it('drops quotes rather than turning them into separators', () => {
    expect(slugify("O'Brien Villa")).toBe('obrien-villa');
  });

  it('keeps Arabic letters instead of stripping the whole string', () => {
    expect(slugify('القاهرة الجديدة')).toBe('القاهرة-الجديدة');
  });

  it('keeps digits', () => {
    expect(slugify('6th of October')).toBe('6th-of-october');
  });
});

describe('initials', () => {
  it('takes the first letter of the first two words', () => {
    expect(initials('Ahmed Selim Mansor')).toBe('AS');
  });

  it('honours a different maximum', () => {
    expect(initials('Ahmed Selim Mansor', 3)).toBe('ASM');
  });

  it('copes with extra whitespace and a single name', () => {
    expect(initials('  Ahmed   ')).toBe('A');
  });
});

describe('truncate', () => {
  it('leaves a short string alone', () => {
    expect(truncate('short', 10)).toBe('short');
  });

  it('adds an ellipsis and does not exceed the budget', () => {
    const out = truncate('a very long sentence indeed', 10);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(10);
  });

  it('does not leave a dangling space before the ellipsis', () => {
    expect(truncate('abcd efgh', 6)).toBe('abcd…');
  });
});
