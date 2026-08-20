import { addDaysUtc, addMonthsUtc, diffDaysUtc, diffMonthsUtc, utcDateOnly } from '../dates';
import type { ShelfLifeAtDate } from './types';

export interface ShelfLifeInput {
  expiryDate: Date;
  manufacturingDate?: Date | null;
  /** Product-master fallback when the batch has no manufacturing date. */
  originalShelfLifeMonths?: number | null;
  atDate: Date;
}

/**
 * Deterministic, UTC-safe shelf-life math. Original shelf life is derived from
 * the manufacturing date when available, from the declared original shelf life
 * in months otherwise, and is null (never guessed) when neither exists —
 * percentage-based rules then evaluate to INSUFFICIENT_DATA.
 */
export function calculateShelfLife(input: ShelfLifeInput): ShelfLifeAtDate {
  const expiryDate = utcDateOnly(input.expiryDate);
  const atDate = utcDateOnly(input.atDate);

  let originalShelfLifeDays: number | null = null;
  if (input.manufacturingDate) {
    originalShelfLifeDays = diffDaysUtc(expiryDate, input.manufacturingDate);
  } else if (input.originalShelfLifeMonths && input.originalShelfLifeMonths > 0) {
    const impliedManufacturing = addMonthsUtc(expiryDate, -input.originalShelfLifeMonths);
    originalShelfLifeDays = diffDaysUtc(expiryDate, impliedManufacturing);
  }
  if (originalShelfLifeDays !== null && originalShelfLifeDays <= 0) {
    originalShelfLifeDays = null; // inconsistent data — treat as unknown, never as fact
  }

  const daysRemaining = diffDaysUtc(expiryDate, atDate);
  const monthsRemaining = diffMonthsUtc(expiryDate, atDate);

  const percentRemaining =
    originalShelfLifeDays === null
      ? null
      : Math.round((daysRemaining / originalShelfLifeDays) * 10000) / 100;

  return { atDate, expiryDate, daysRemaining, monthsRemaining, originalShelfLifeDays, percentRemaining };
}

export interface ArrivalProjectionInput {
  from: Date;
  shippingDays: number;
  customsBufferDays: number;
  operationalBufferDays: number;
}

/**
 * Destination eligibility must always use the projected arrival date, never
 * the order date (spec §10). Buffers are configuration — country-specific
 * values override platform defaults.
 */
export function projectArrivalDate(input: ArrivalProjectionInput): Date {
  const total = input.shippingDays + input.customsBufferDays + input.operationalBufferDays;
  return addDaysUtc(input.from, total);
}

/** Calendar-exact check: does the batch still have at least `minMonths` full months at `at`? */
export function meetsMinimumMonths(expiryDate: Date, at: Date, minMonths: number): boolean {
  return addMonthsUtc(utcDateOnly(at), minMonths).getTime() <= utcDateOnly(expiryDate).getTime();
}

/** Expiry-bucket classification for inventory visualization (spec §35). */
export type ExpiryBucket = 'D0_90' | 'D91_180' | 'D181_270' | 'D271_365' | 'Y1_2' | 'Y2_PLUS' | 'EXPIRED';

export function expiryBucket(expiryDate: Date, today: Date): ExpiryBucket {
  const days = diffDaysUtc(expiryDate, today);
  if (days < 0) return 'EXPIRED';
  if (days <= 90) return 'D0_90';
  if (days <= 180) return 'D91_180';
  if (days <= 270) return 'D181_270';
  if (days <= 365) return 'D271_365';
  if (days <= 730) return 'Y1_2';
  return 'Y2_PLUS';
}
