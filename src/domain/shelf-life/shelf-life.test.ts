import { describe, expect, it } from 'vitest';
import { calculateShelfLife, expiryBucket, meetsMinimumMonths, projectArrivalDate } from './shelf-life';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('calculateShelfLife', () => {
  it('computes days, months and percent from manufacturing date', () => {
    const life = calculateShelfLife({
      expiryDate: d('2028-03-01'),
      manufacturingDate: d('2025-03-01'),
      atDate: d('2026-08-20'),
    });
    expect(life.daysRemaining).toBe(559);
    expect(life.monthsRemaining).toBe(18);
    expect(life.originalShelfLifeDays).toBe(1096); // 3 years incl. leap day
    expect(life.percentRemaining).toBeCloseTo(51.0, 1);
  });

  it('falls back to declared original shelf life in months', () => {
    const life = calculateShelfLife({
      expiryDate: d('2027-06-01'),
      originalShelfLifeMonths: 24,
      atDate: d('2026-06-01'),
    });
    expect(life.originalShelfLifeDays).toBeGreaterThan(700);
    expect(life.percentRemaining).toBeCloseTo(50, 0);
  });

  it('never guesses: unknown original shelf life → percent null', () => {
    const life = calculateShelfLife({ expiryDate: d('2027-06-01'), atDate: d('2026-06-01') });
    expect(life.originalShelfLifeDays).toBeNull();
    expect(life.percentRemaining).toBeNull();
  });

  it('reports negative days for expired batches', () => {
    const life = calculateShelfLife({ expiryDate: d('2026-01-01'), atDate: d('2026-08-20') });
    expect(life.daysRemaining).toBeLessThan(0);
  });

  it('treats inconsistent original shelf life as unknown', () => {
    const life = calculateShelfLife({
      expiryDate: d('2026-01-01'),
      manufacturingDate: d('2027-01-01'), // impossible: made after expiry
      atDate: d('2025-06-01'),
    });
    expect(life.originalShelfLifeDays).toBeNull();
    expect(life.percentRemaining).toBeNull();
  });
});

describe('projectArrivalDate', () => {
  it('adds shipping + customs + operational buffers (spec §10 example: 15 days)', () => {
    const arrival = projectArrivalDate({
      from: d('2026-08-20'),
      shippingDays: 6,
      customsBufferDays: 4,
      operationalBufferDays: 5,
    });
    expect(arrival.toISOString().slice(0, 10)).toBe('2026-09-04');
  });
});

describe('meetsMinimumMonths (calendar-exact)', () => {
  it('passes exactly on the boundary date', () => {
    expect(meetsMinimumMonths(d('2027-02-20'), d('2026-08-20'), 6)).toBe(true);
  });
  it('fails one day short of the boundary', () => {
    expect(meetsMinimumMonths(d('2027-02-19'), d('2026-08-20'), 6)).toBe(false);
  });
});

describe('expiryBucket', () => {
  const today = d('2026-08-20');
  it.each([
    ['2026-08-01', 'EXPIRED'],
    ['2026-09-01', 'D0_90'],
    ['2026-12-20', 'D91_180'],
    ['2027-03-20', 'D181_270'],
    ['2027-08-01', 'D271_365'],
    ['2028-05-01', 'Y1_2'],
    ['2029-08-20', 'Y2_PLUS'],
  ] as const)('%s → %s', (expiry, bucket) => {
    expect(expiryBucket(d(expiry), today)).toBe(bucket);
  });
});
