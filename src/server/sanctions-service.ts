import type { SanctionsResult } from '@prisma/client';
import { prisma } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { writeAudit } from '@/lib/audit/audit';
import { reevaluateActiveListings } from './eligibility-service';

export interface RecordSanctionsInput {
  orgId: string;
  result: Extract<SanctionsResult, 'CLEAR' | 'REVIEW' | 'BLOCKED'>;
  note?: string;
  expiresAt?: string;
}

/**
 * Manual sanctions screening record (spec §26). REVIEW and BLOCKED immediately
 * degrade every eligibility verdict via re-evaluation; the full audit trail is
 * preserved (who screened, when, outcome, reference).
 */
export async function recordSanctionsCheck(userId: string, input: RecordSanctionsInput) {
  const org = await prisma.organization.findUnique({ where: { id: input.orgId } });
  if (!org) throw new ApiError('NOT_FOUND', 404, 'ORG_NOT_FOUND');

  await prisma.$transaction(async (tx) => {
    await tx.sanctionsCheck.create({
      data: {
        subjectType: 'ORGANIZATION',
        subjectId: org.id,
        provider: 'MANUAL',
        result: input.result,
        payload: input.note ? { note: input.note } : undefined,
        checkedById: userId,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      },
    });
    await tx.organization.update({ where: { id: org.id }, data: { sanctionsStatus: input.result } });
    await writeAudit(
      {
        actorType: 'COMPLIANCE',
        actorUserId: userId,
        orgId: org.id,
        action: 'SANCTIONS_CHECK_RECORDED',
        entityType: 'Organization',
        entityId: org.id,
        oldValue: { sanctionsStatus: org.sanctionsStatus },
        newValue: { sanctionsStatus: input.result },
        reason: input.note ?? null,
      },
      tx,
    );
  });

  const reevaluated =
    org.kind === 'SELLER' || org.kind === 'HYBRID' ? await reevaluateActiveListings() : 0;

  return { orgId: org.id, result: input.result, reevaluatedListings: reevaluated };
}
