import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ApiError, fail, requirePermission } from '@/lib/api';
import { writeAudit } from '@/lib/audit/audit';
import { getStorage } from '@/lib/storage/local';
import { ZodError } from 'zod';

// Documents are never publicly reachable: every download passes an explicit,
// org-scoped permission check and is audit-logged.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const document = await prisma.document.findFirst({ where: { id, deletedAt: null } });
    if (!document) throw new ApiError('NOT_FOUND', 404, 'DOCUMENT_NOT_FOUND');

    const user = await requirePermission('document:read', { orgId: document.ownerOrgId });

    const data = await getStorage().get(document.storageKey);
    await writeAudit({
      actorUserId: user.id,
      orgId: document.ownerOrgId,
      action: 'DOCUMENT_DOWNLOADED',
      entityType: 'Document',
      entityId: document.id,
    });

    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': document.mimeType,
        'Content-Length': String(document.sizeBytes),
        'Content-Disposition': `attachment; filename="${encodeURIComponent(document.fileName)}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    if (err instanceof ApiError) return fail(err);
    if (err instanceof ZodError) return fail(new ApiError('VALIDATION_ERROR', 400, 'Invalid input'));
    console.error('[api] document download error', err);
    return fail(new ApiError('INTERNAL', 500, 'Internal error'));
  }
}
