import type { ConfidenceLevel, Prisma, RuleType } from '@prisma/client';
import { prisma } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { writeAudit } from '@/lib/audit/audit';
import { reevaluateActiveListings } from './eligibility-service';

// Regulatory rules are versioned, never overwritten (spec §4/§11): drafting
// creates a new immutable version; publishing is a separate human act by a
// Compliance Officer / Admin that supersedes the previous current version and
// re-evaluates every open listing.

export interface DraftRuleVersionInput {
  countryId: string;
  ruleType: RuleType;
  productScope?: string | null;
  payload: unknown;
  authorityName?: string;
  sourceName?: string;
  sourceUrl?: string;
  publishedAt?: string;
  effectiveAt?: string;
  confidence?: ConfidenceLevel;
  notes?: string;
}

export async function draftRuleVersion(userId: string, input: DraftRuleVersionInput) {
  const country = await prisma.country.findUnique({ where: { id: input.countryId } });
  if (!country) throw new ApiError('VALIDATION_ERROR', 400, 'UNKNOWN_COUNTRY');

  const scope = input.productScope?.trim() || null;

  const version = await prisma.$transaction(async (tx) => {
    // @@unique treats NULL productScope as distinct — resolve manually.
    let rule = await tx.regulatoryRule.findFirst({
      where: { countryId: input.countryId, ruleType: input.ruleType, productScope: scope },
    });
    rule ??= await tx.regulatoryRule.create({
      data: { countryId: input.countryId, ruleType: input.ruleType, productScope: scope },
    });

    const latest = await tx.regulatoryRuleVersion.findFirst({
      where: { ruleId: rule.id },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    const version = await tx.regulatoryRuleVersion.create({
      data: {
        ruleId: rule.id,
        version: (latest?.version ?? 0) + 1,
        payload: input.payload as Prisma.InputJsonValue,
        status: 'PENDING_VERIFICATION',
        authorityName: input.authorityName ?? null,
        sourceName: input.sourceName ?? null,
        sourceUrl: input.sourceUrl ?? null,
        publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
        effectiveAt: input.effectiveAt ? new Date(input.effectiveAt) : null,
        confidence: input.confidence ?? 'UNVERIFIED',
        notes: input.notes ?? null,
        supersedesVersionId: rule.currentVersionId,
        createdById: userId,
      },
    });
    await writeAudit(
      {
        actorUserId: userId,
        action: 'RULE_VERSION_DRAFTED',
        entityType: 'RegulatoryRuleVersion',
        entityId: version.id,
        newValue: {
          countryId: input.countryId,
          ruleType: input.ruleType,
          version: version.version,
          sourceName: input.sourceName ?? null,
        },
      },
      tx,
    );
    return version;
  });

  return { ruleVersionId: version.id, version: version.version };
}

export async function publishRuleVersion(userId: string, versionId: string) {
  const version = await prisma.regulatoryRuleVersion.findUnique({
    where: { id: versionId },
    include: { rule: { include: { currentVersion: true } } },
  });
  if (!version) throw new ApiError('NOT_FOUND', 404, 'RULE_VERSION_NOT_FOUND');
  if (version.status !== 'PENDING_VERIFICATION' && version.status !== 'DRAFT') {
    throw new ApiError('CONFLICT', 409, 'RULE_VERSION_NOT_PUBLISHABLE');
  }

  const previous = version.rule.currentVersion;

  await prisma.$transaction(async (tx) => {
    await tx.regulatoryRuleVersion.update({
      where: { id: version.id },
      data: { status: 'VERIFIED', lastVerifiedAt: new Date(), verifiedById: userId },
    });
    if (previous && previous.id !== version.id) {
      // The old text is never deleted or edited — it is marked superseded and
      // remains fully reconstructable via the version chain.
      await tx.regulatoryRuleVersion.update({
        where: { id: previous.id },
        data: { status: 'OUTDATED' },
      });
    }
    await tx.regulatoryRule.update({
      where: { id: version.ruleId },
      data: { currentVersionId: version.id },
    });
    await writeAudit(
      {
        actorType: 'COMPLIANCE',
        actorUserId: userId,
        action: 'RULE_VERSION_PUBLISHED',
        entityType: 'RegulatoryRuleVersion',
        entityId: version.id,
        oldValue: previous ? { currentVersionId: previous.id, previousStatus: previous.status } : undefined,
        newValue: {
          countryId: version.rule.countryId,
          ruleType: version.rule.ruleType,
          version: version.version,
          supersedes: version.supersedesVersionId,
        },
      },
      tx,
    );
  });

  // Every open listing's verdicts are stale now — recompute snapshots.
  const reevaluated = await reevaluateActiveListings();
  return { published: version.id, reevaluatedListings: reevaluated };
}
