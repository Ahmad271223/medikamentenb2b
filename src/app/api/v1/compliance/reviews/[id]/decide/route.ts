import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { prisma } from '@/lib/db';
import { ApiError, assertSameOrigin, fail, ok, requirePermission } from '@/lib/api';
import { writeAudit } from '@/lib/audit/audit';
import { hasPermission, type PlatformRole } from '@/lib/authz/permissions';
import { applyTransactionDecision } from '@/server/transaction-service';
import { activateListing } from '@/server/listing-service';

const DecisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  reason: z.string().min(3).max(2000),
});

// Human compliance decision — the only path that verifies organizations and
// licenses. Decided reviews are immutable; corrections create new reviews.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    assertSameOrigin(req);
    const user = await requirePermission('review:decide');
    const { id } = await params;
    const input = DecisionSchema.parse(await req.json());

    const review = await prisma.complianceReview.findUnique({
      where: { id },
      include: { org: true, license: true, product: true },
    });
    if (!review) throw new ApiError('NOT_FOUND', 404, 'REVIEW_NOT_FOUND');
    if (review.status === 'APPROVED' || review.status === 'REJECTED') {
      throw new ApiError('CONFLICT', 409, 'REVIEW_ALREADY_DECIDED');
    }

    // Releasing a transaction is the Compliance Officer's exclusive authority
    // (separation of duties) — 'review:decide' alone is not sufficient here.
    if (
      review.type === 'TRANSACTION' &&
      !hasPermission(
        { userId: user.id, platformRole: user.platformRole as PlatformRole | null },
        'transaction:compliance-approve',
      )
    ) {
      throw new ApiError('FORBIDDEN', 403, 'COMPLIANCE_OFFICER_REQUIRED');
    }

    await prisma.$transaction(async (tx) => {
      await tx.complianceReview.update({
        where: { id: review.id },
        data: {
          status: input.decision,
          decision: input.decision,
          decisionReason: input.reason,
          decidedById: user.id,
          decidedAt: new Date(),
        },
      });

      if (review.type === 'KYB' && review.orgId) {
        const approved = input.decision === 'APPROVED';
        await tx.organization.update({
          where: { id: review.orgId },
          data: {
            status: approved ? 'VERIFIED' : 'REJECTED',
            kybStatus: approved ? 'APPROVED' : 'REJECTED',
          },
        });
        const owners = await tx.organizationMember.findMany({
          where: { orgId: review.orgId, role: { in: ['OWNER', 'ADMIN'] }, status: 'ACTIVE' },
        });
        await tx.notification.createMany({
          data: owners.map((m) => ({
            userId: m.userId,
            orgId: review.orgId,
            type: approved ? 'KYB_APPROVED' : 'KYB_REJECTED',
            title: approved ? 'KYB approved' : 'KYB rejected',
            body: input.reason,
          })),
        });
      }

      if (review.type === 'LICENSE' && review.licenseId) {
        await tx.license.update({
          where: { id: review.licenseId },
          data: {
            status: input.decision === 'APPROVED' ? 'VERIFIED' : 'REJECTED',
            verifiedById: input.decision === 'APPROVED' ? user.id : null,
            verifiedAt: input.decision === 'APPROVED' ? new Date() : null,
          },
        });
      }

      if (review.type === 'PRODUCT' && review.productId) {
        await tx.product.update({
          where: { id: review.productId },
          data: { status: input.decision === 'APPROVED' ? 'VERIFIED' : 'DRAFT' },
        });
      }

      if (review.type === 'LISTING' && review.listingId) {
        if (input.decision === 'APPROVED') {
          // Activation (incl. matching run) happens after the decision commits.
        } else {
          await tx.listing.update({ where: { id: review.listingId }, data: { status: 'BLOCKED' } });
        }
      }

      if (review.type === 'TRANSACTION' && review.transactionId) {
        await applyTransactionDecision(review.transactionId, input.decision, input.reason, user.id, tx);
      }

      await writeAudit(
        {
          actorType: 'COMPLIANCE',
          actorUserId: user.id,
          orgId: review.orgId,
          action: `REVIEW_${input.decision}`,
          entityType: 'ComplianceReview',
          entityId: review.id,
          reason: input.reason,
          newValue: { type: review.type, decision: input.decision },
        },
        tx,
      );
    });

    if (review.type === 'LISTING' && review.listingId && input.decision === 'APPROVED') {
      await activateListing(review.listingId, user.id);
    }

    return ok({ decided: true });
  } catch (err) {
    if (err instanceof ApiError) return fail(err);
    if (err instanceof ZodError) return fail(new ApiError('VALIDATION_ERROR', 400, 'Invalid input', err.issues));
    console.error('[api] review decide error', err);
    return fail(new ApiError('INTERNAL', 500, 'Internal error'));
  }
}
