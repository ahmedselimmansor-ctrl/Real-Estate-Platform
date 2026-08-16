import { durationToSeconds, secondsFromNow, secondsUntilExpiry } from './duration.util';

describe('durationToSeconds', () => {
  it.each([
    ['15m', 900],
    ['30d', 2_592_000],
    ['1h', 3_600],
    ['7d', 604_800],
    ['1w', 604_800],
    ['45s', 45],
    ['3600', 3_600],
    ['  15m  ', 900],
    ['1.5h', 5_400],
  ])('parses %s as %i seconds', (input, expected) => {
    expect(durationToSeconds(input)).toBe(expected);
  });

  it('passes a positive number through as seconds', () => {
    expect(durationToSeconds(120)).toBe(120);
  });

  it.each(['', 'soon', '15x', '-5m', '0', '0s', 'NaN'])(
    'rejects %p so a misconfigured TTL fails at boot',
    (input) => {
      expect(() => durationToSeconds(input)).toThrow(/Invalid duration/);
    },
  );

  it('rejects non-positive numbers', () => {
    expect(() => durationToSeconds(0)).toThrow(/Invalid duration/);
    expect(() => durationToSeconds(-1)).toThrow(/Invalid duration/);
  });
});

describe('secondsFromNow', () => {
  it('offsets from the supplied instant', () => {
    const base = new Date('2026-01-01T00:00:00.000Z');
    expect(secondsFromNow(900, base).toISOString()).toBe('2026-01-01T00:15:00.000Z');
  });
});

describe('secondsUntilExpiry', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const nowUnix = Math.floor(now.getTime() / 1000);

  it('returns the remaining lifetime', () => {
    expect(secondsUntilExpiry(nowUnix + 300, now)).toBe(300);
  });

  it('floors at zero for tokens that already expired', () => {
    expect(secondsUntilExpiry(nowUnix - 300, now)).toBe(0);
  });
});
