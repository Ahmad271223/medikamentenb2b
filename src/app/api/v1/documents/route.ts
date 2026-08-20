import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ApiError, assertSameOrigin, handle, ok, requirePermission } from '@/lib/api';
import { writeAudit } from '@/lib/audit/audit';
import { ALLOWED_MIME_TYPES, DOCUMENT_TYPES } from '@/lib/storage/storage';
import { getStorage } from '@/lib/storage/local';
import { env } from '@/lib/env';

const MetaSchema = z.object({
  type: z.enum(DOCUMENT_TYPES),
  licenseId: z.string().uuid().optional(),
  batchId: z.string().uuid().optional(),
  transactionId: z.string().uuid().optional(),
});

export const GET = handle(async () => {
  const user = await requirePermission('document:read');
  const documents = await prisma.document.findMany({
    where: {
      deletedAt: null,
      ...(user.platformRole ? {} : { ownerOrgId: user.org?.id ?? '__none__' }),
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true, type: true, fileName: true, mimeType: true, sizeBytes: true,
      sha256: true, status: true, createdAt: true, licenseId: true, batchId: true,
    },
  });
  return ok(documents);
});

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const user = await requirePermission('document:upload');
  if (!user.org) throw new ApiError('NOT_FOUND', 404, 'NO_ORGANIZATION');

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new ApiError('VALIDATION_ERROR', 400, 'FILE_REQUIRED');

  const meta = MetaSchema.parse({
    type: form.get('type'),
    licenseId: form.get('licenseId') || undefined,
    batchId: form.get('batchId') || undefined,
    transactionId: form.get('transactionId') || undefined,
  });

  const maxBytes = env().MAX_UPLOAD_MB * 1024 * 1024;
  if (file.size > maxBytes) throw new ApiError('VALIDATION_ERROR', 400, 'FILE_TOO_LARGE');
  if (!ALLOWED_MIME_TYPES.has(file.type)) throw new ApiError('VALIDATION_ERROR', 400, 'FILE_TYPE_NOT_ALLOWED');

  // Linked entities must belong to the caller's organization.
  if (meta.licenseId) {
    const license = await prisma.license.findFirst({ where: { id: meta.licenseId, orgId: user.org.id } });
    if (!license) throw new ApiError('VALIDATION_ERROR', 400, 'UNKNOWN_LICENSE');
  }
  if (meta.batchId) {
    const batch = await prisma.batch.findFirst({ where: { id: meta.batchId, sellerOrgId: user.org.id } });
    if (!batch) throw new ApiError('VALIDATION_ERROR', 400, 'UNKNOWN_BATCH');
  }
  if (meta.transactionId) {
    // Both parties of a transaction may attach documents to it.
    const transaction = await prisma.transaction.findFirst({
      where: { id: meta.transactionId, OR: [{ sellerOrgId: user.org.id }, { buyerOrgId: user.org.id }] },
    });
    if (!transaction) throw new ApiError('VALIDATION_ERROR', 400, 'UNKNOWN_TRANSACTION');
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storageKey = `${user.org.id}/${randomUUID()}`;
  const stored = await getStorage().put(storageKey, buffer);

  const document = await prisma.document.create({
    data: {
      ownerOrgId: user.org.id,
      type: meta.type,
      fileName: file.name.slice(0, 300),
      mimeType: file.type,
      sizeBytes: stored.sizeBytes,
      storageKey: stored.storageKey,
      sha256: stored.sha256,
      licenseId: meta.licenseId,
      batchId: meta.batchId,
      transactionId: meta.transactionId,
      uploadedById: user.id,
    },
  });
  await writeAudit({
    actorUserId: user.id,
    orgId: user.org.id,
    action: 'DOCUMENT_UPLOADED',
    entityType: 'Document',
    entityId: document.id,
    newValue: { type: meta.type, fileName: document.fileName, sha256: stored.sha256 },
  });

  return ok(document, { status: 201 });
});
