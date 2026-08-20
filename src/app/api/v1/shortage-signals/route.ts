import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ApiError, assertSameOrigin, handle, ok, requirePermission } from '@/lib/api';
import { writeAudit } from '@/lib/audit/audit';

// Shortage signals (spec §15): lawful, sourced entries only — the MVP records
// what an analyst read at an official/licensed source, with confidence.
const SignalSchema = z.object({
  countryId: z.string().length(2),
  productId: z.string().uuid().optional(),
  productFreeText: z.string().max(300).optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'UNKNOWN']).default('UNKNOWN'),
  source: z.string().min(3).max(300),
  sourceUrl: z.string().url().max(1000).optional(),
  reportedAt: z.string().date(),
  expectedResolution: z.string().date().optional(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW', 'UNVERIFIED']).default('UNVERIFIED'),
}).refine((v) => v.productId || v.productFreeText, { message: 'productId or productFreeText required' });

export const GET = handle(async () => {
  await requirePermission('rule:draft');
  const signals = await prisma.shortageSignal.findMany({
    include: { product: { select: { inn: true } }, country: { select: { nameEn: true } } },
    orderBy: { reportedAt: 'desc' },
    take: 200,
  });
  return ok(signals);
});

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const user = await requirePermission('rule:draft');
  const input = SignalSchema.parse(await req.json());

  const country = await prisma.country.findUnique({ where: { id: input.countryId } });
  if (!country) throw new ApiError('VALIDATION_ERROR', 400, 'UNKNOWN_COUNTRY');

  const signal = await prisma.shortageSignal.create({
    data: {
      countryId: input.countryId,
      productId: input.productId ?? null,
      productFreeText: input.productFreeText ?? null,
      severity: input.severity,
      source: input.source,
      sourceUrl: input.sourceUrl ?? null,
      reportedAt: new Date(input.reportedAt),
      expectedResolution: input.expectedResolution ? new Date(input.expectedResolution) : null,
      confidence: input.confidence,
    },
  });
  await writeAudit({
    actorUserId: user.id,
    action: 'SHORTAGE_SIGNAL_RECORDED',
    entityType: 'ShortageSignal',
    entityId: signal.id,
    newValue: { countryId: input.countryId, severity: input.severity, source: input.source },
  });
  return ok(signal, { status: 201 });
});
