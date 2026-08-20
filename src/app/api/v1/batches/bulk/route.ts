import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ApiError, assertSameOrigin, handle, ok, requirePermission } from '@/lib/api';
import { writeAudit } from '@/lib/audit/audit';
import { parseCsv, validateRows } from '@/lib/bulk/csv';
import { diffDaysUtc } from '@/domain/dates';

const BulkSchema = z.object({
  csv: z.string().min(1).max(2_000_000),
  dryRun: z.boolean().default(true),
  warehouseId: z.string().uuid(),
});

/**
 * Bulk batch import (spec §37): validate → preview (dryRun) → import.
 * Fixed documented headers in M2: product_inn, lot_number, expiry_date,
 * quantity [, manufacturing_date, unit, temperature_mode].
 */
export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const user = await requirePermission('batch:manage');
  if (!user.org) throw new ApiError('NOT_FOUND', 404, 'NO_ORGANIZATION');
  const input = BulkSchema.parse(await req.json());

  const warehouse = await prisma.warehouse.findFirst({
    where: { id: input.warehouseId, orgId: user.org.id, deletedAt: null },
  });
  if (!warehouse) throw new ApiError('VALIDATION_ERROR', 400, 'UNKNOWN_WAREHOUSE');

  const parsed = parseCsv(input.csv);
  if (parsed.missingHeaders.length > 0) {
    return ok({ dryRun: true, missingHeaders: parsed.missingHeaders, totalRows: parsed.rows.length, valid: [], errors: [] });
  }

  const [products, existingBatches] = await Promise.all([
    prisma.product.findMany({
      where: { deletedAt: null, OR: [{ status: 'VERIFIED' }, { proposedByOrgId: user.org.id }] },
      select: { id: true, inn: true },
    }),
    prisma.batch.findMany({
      where: { sellerOrgId: user.org.id, deletedAt: null },
      select: { productId: true, lotNumber: true },
    }),
  ]);

  const report = validateRows(parsed.rows, {
    knownProducts: new Map(products.map((p) => [p.inn.toLowerCase(), p.id])),
    existingLots: new Set(existingBatches.map((b) => `${b.productId}|${b.lotNumber}`)),
    today: new Date(),
  });

  if (input.dryRun) {
    return ok({
      dryRun: true,
      missingHeaders: [],
      totalRows: parsed.rows.length,
      valid: report.valid,
      errors: report.errors,
    });
  }

  if (report.errors.length > 0) {
    // Import only proceeds on a clean file — partial imports hide data problems.
    throw new ApiError('VALIDATION_ERROR', 400, 'CSV_HAS_ERRORS', { errors: report.errors });
  }
  if (report.valid.length === 0) throw new ApiError('VALIDATION_ERROR', 400, 'CSV_EMPTY');

  const created = await prisma.$transaction(async (tx) => {
    let count = 0;
    for (const row of report.valid) {
      const expiryDate = new Date(`${row.expiryDate}T00:00:00.000Z`);
      const manufacturingDate = row.manufacturingDate ? new Date(`${row.manufacturingDate}T00:00:00.000Z`) : null;
      await tx.batch.create({
        data: {
          productId: row.productId,
          sellerOrgId: user.org!.id,
          warehouseId: warehouse.id,
          lotNumber: row.lotNumber,
          manufacturingDate,
          expiryDate,
          originalShelfLifeDays: manufacturingDate ? diffDaysUtc(expiryDate, manufacturingDate) : null,
          quantity: row.quantity,
          unit: row.unit,
          temperatureMode: row.temperatureMode as 'AMBIENT' | 'COLD_2_8' | 'FROZEN' | 'CONTROLLED_ROOM',
          position: { create: { onHand: row.quantity } },
        },
      });
      count += 1;
    }
    await writeAudit(
      {
        actorUserId: user.id,
        orgId: user.org!.id,
        action: 'BATCH_BULK_IMPORTED',
        entityType: 'Batch',
        newValue: { rows: count, warehouseId: warehouse.id },
      },
      tx,
    );
    return count;
  });

  return ok({ dryRun: false, imported: created });
});
