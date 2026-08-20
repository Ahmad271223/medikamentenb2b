import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ApiError, assertSameOrigin, handle, ok, requirePermission } from '@/lib/api';
import { writeAudit } from '@/lib/audit/audit';

const LicenseSchema = z.object({
  type: z.enum(['WDA', 'GDP', 'GMP', 'MANUFACTURING', 'IMPORT', 'WHOLESALE', 'HOSPITAL', 'PHARMACY', 'OTHER']),
  number: z.string().min(1).max(120),
  issuingAuthority: z.string().min(1).max(300),
  countryId: z.string().length(2),
  issueDate: z.string().date().optional(),
  expiryDate: z.string().date(),
});

export const GET = handle(async () => {
  const user = await requirePermission('org:read');
  if (!user.org) throw new ApiError('NOT_FOUND', 404, 'NO_ORGANIZATION');
  const licenses = await prisma.license.findMany({
    where: { orgId: user.org.id },
    orderBy: { expiryDate: 'asc' },
  });
  return ok(licenses);
});

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const user = await requirePermission('license:manage');
  if (!user.org) throw new ApiError('NOT_FOUND', 404, 'NO_ORGANIZATION');
  const input = LicenseSchema.parse(await req.json());

  const country = await prisma.country.findUnique({ where: { id: input.countryId } });
  if (!country) throw new ApiError('VALIDATION_ERROR', 400, 'UNKNOWN_COUNTRY');

  const license = await prisma.$transaction(async (tx) => {
    const license = await tx.license.create({
      data: {
        orgId: user.org!.id,
        type: input.type,
        number: input.number,
        issuingAuthority: input.issuingAuthority,
        countryId: input.countryId,
        issueDate: input.issueDate ? new Date(input.issueDate) : null,
        expiryDate: new Date(input.expiryDate),
        status: 'PENDING_REVIEW',
      },
    });
    await tx.complianceReview.create({
      data: { type: 'LICENSE', orgId: user.org!.id, licenseId: license.id, priority: 55 },
    });
    await writeAudit(
      {
        actorUserId: user.id,
        orgId: user.org!.id,
        action: 'LICENSE_UPLOADED',
        entityType: 'License',
        entityId: license.id,
        newValue: { type: input.type, number: input.number, expiryDate: input.expiryDate },
      },
      tx,
    );
    return license;
  });

  return ok(license, { status: 201 });
});
