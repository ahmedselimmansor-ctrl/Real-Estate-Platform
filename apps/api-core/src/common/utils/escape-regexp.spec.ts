import { escapeRegExp } from './escape-regexp';

/**
 * This guards a query parameter that becomes a `RegExp`. Escaping it is the
 * difference between the caller supplying a search term and the caller
 * supplying a pattern.
 */
describe('escapeRegExp', () => {
  it('leaves an ordinary search term untouched', () => {
    expect(escapeRegExp('TC-1042')).toBe('TC-1042');
    expect(escapeRegExp('palm hills')).toBe('palm hills');
  });

  it('neutralises a wildcard, so a search cannot become "match everything"', () => {
    const pattern = new RegExp(escapeRegExp('.*'));

    expect(pattern.test('anything at all')).toBe(false);
    expect(pattern.test('literally .* here')).toBe(true);
  });

  it('escapes every metacharacter', () => {
    for (const character of [
      '.',
      '*',
      '+',
      '?',
      '^',
      '$',
      '{',
      '}',
      '(',
      ')',
      '|',
      '[',
      ']',
      '\\',
    ]) {
      expect(escapeRegExp(character)).toBe(`\\${character}`);
    }
  });

  it('makes an unbalanced bracket safe to compile', () => {
    // Unescaped this throws, which surfaces as a 500 rather than no results.
    expect(() => new RegExp(escapeRegExp('New Cairo ('))).not.toThrow();
  });

  it('defuses a catastrophically backtracking pattern', () => {
    // `(a+)+$` against a long non-matching string is a denial of service when
    // the caller controls the pattern. Escaped, it is just a string to find.
    const pattern = new RegExp(escapeRegExp('(a+)+$'));

    expect(pattern.test('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!')).toBe(false);
    expect(pattern.test('contains (a+)+$ literally')).toBe(true);
  });

  it('keeps Arabic intact — the catalogue is searched in both languages', () => {
    expect(escapeRegExp('القاهرة الجديدة')).toBe('القاهرة الجديدة');
  });

  it('handles an empty string', () => {
    expect(escapeRegExp('')).toBe('');
  });
});
