import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ApiError, assertSameOrigin, handle, ok, requirePermission } from '@/lib/api';
import { writeAudit } from '@/lib/audit/audit';
import { invalidateConfigCache, PLATFORM_DEFAULTS, type PlatformDefaults } from '@/lib/config/platform-config';

const PatchSchema = z.object({
  key: z.string().min(1).max(64),
  value: z.unknown(),
});

export const GET = handle(async () => {
  await requirePermission('config:manage');
  const rows = await prisma.platformConfig.findMany();
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  const merged = Object.entries(PLATFORM_DEFAULTS).map(([key, defaultValue]) => ({
    key,
    value: stored.has(key) ? stored.get(key) : defaultValue,
    isDefault: !stored.has(key),
    defaultValue,
  }));
  return ok(merged);
});

/**
 * Fees, buffers, thresholds and exclusion lists are configuration (spec §47) —
 * validated against the documented defaults' types, audit-logged, never code.
 */
export const PATCH = handle(async (req) => {
  assertSameOrigin(req);
  const user = await requirePermission('config:manage');
  const input = PatchSchema.parse(await req.json());

  if (!(input.key in PLATFORM_DEFAULTS)) throw new ApiError('VALIDATION_ERROR', 400, 'UNKNOWN_CONFIG_KEY');
  const key = input.key as keyof PlatformDefaults;
  const defaultValue = PLATFORM_DEFAULTS[key];

  // Type-shape guard against the documented default.
  const valid =
    (typeof defaultValue === 'number' && typeof input.value === 'number' && Number.isFinite(input.value) && (input.value as number) >= 0) ||
    (typeof defaultValue === 'boolean' && typeof input.value === 'boolean') ||
    (Array.isArray(defaultValue) &&
      Array.isArray(input.value) &&
      (input.value as unknown[]).every((v) => typeof v === 'string'));
  if (!valid) throw new ApiError('VALIDATION_ERROR', 400, 'CONFIG_VALUE_TYPE_MISMATCH');

  const existing = await prisma.platformConfig.findUnique({ where: { key } });
  await prisma.$transaction(async (tx) => {
    await tx.platformConfig.upsert({
      where: { key },
      update: { value: input.value as never, updatedById: user.id },
      create: { key, value: input.value as never, updatedById: user.id },
    });
    await writeAudit(
      {
        actorUserId: user.id,
        action: 'CONFIG_UPDATED',
        entityType: 'PlatformConfig',
        entityId: key,
        oldValue: { value: existing?.value ?? defaultValue },
        newValue: { value: input.value },
      },
      tx,
    );
  });
  invalidateConfigCache();
  return ok({ key, value: input.value });
});
