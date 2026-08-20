import { prisma } from '@/lib/db';

// Platform configuration — every commercially or regulatorily relevant number
// is configuration, never a hardcoded constant (spec §47, §10, §27).
// Values live in the PlatformConfig table; these are the documented defaults
// used when a key has not been configured yet.

export interface PlatformDefaults {
  /** % commission charged to the seller — admin-configurable. */
  seller_commission_percent: number;
  buyer_fee_percent: number;
  /** Arrival projection buffers (days) — country values override these. */
  default_shipping_days: number;
  default_customs_buffer_days: number;
  default_operational_buffer_days: number;
  /** Listings at/below this remaining shelf life (months) classify as SHORT_DATED. */
  short_dated_threshold_months: number;
  /** Product classes excluded from trading in the current phase. */
  excluded_controlled_statuses: string[];
  /** MVP: cold chain requires human review. */
  allow_cold_chain: boolean;
  /** Sanctions screening validity window (days). */
  sanctions_max_age_days: number;
  /** License expiry warning horizon (days). */
  license_warning_days: number;
  /** Auto-activate listings when org, license, batch quality and product are all verified and low-risk. */
  listing_auto_approve_verified: boolean;
  demo_mode: boolean;
}

export const PLATFORM_DEFAULTS: PlatformDefaults = {
  seller_commission_percent: 5,
  buyer_fee_percent: 0,
  default_shipping_days: 6,
  default_customs_buffer_days: 4,
  default_operational_buffer_days: 5,
  short_dated_threshold_months: 12,
  excluded_controlled_statuses: ['NARCOTIC', 'PSYCHOTROPIC', 'OTHER_CONTROLLED'],
  allow_cold_chain: false,
  sanctions_max_age_days: 180,
  license_warning_days: 90,
  listing_auto_approve_verified: true,
  demo_mode: false,
};

const CACHE_TTL_MS = 60_000;
let cache: { values: Record<string, unknown>; loadedAt: number } | null = null;

async function loadAll(): Promise<Record<string, unknown>> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.values;
  const rows = await prisma.platformConfig.findMany();
  const values: Record<string, unknown> = {};
  for (const row of rows) values[row.key] = row.value;
  cache = { values, loadedAt: Date.now() };
  return values;
}

export async function getConfig<K extends keyof PlatformDefaults>(key: K): Promise<PlatformDefaults[K]> {
  const values = await loadAll();
  if (key in values) return values[key] as PlatformDefaults[K];
  return PLATFORM_DEFAULTS[key];
}

export function invalidateConfigCache(): void {
  cache = null;
}
