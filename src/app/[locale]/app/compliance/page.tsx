import { getLocale, getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, toActor } from '@/lib/auth/current';
import { hasPermission } from '@/lib/authz/permissions';
import { formatDateTime } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, toneForStatus } from '@/components/ui/badge';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/kpi';
import { ReviewDecisionForm } from '@/components/forms/review-decision-form';

export const dynamic = 'force-dynamic';

export default async function ComplianceQueuePage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const user = (await getCurrentUser())!;
  const canDecide = hasPermission(toActor(user), 'review:decide');

  if (!canDecide) {
    return <EmptyState title="403" note="Compliance permissions required." />;
  }

  const reviews = await prisma.complianceReview.findMany({
    where: { status: { in: ['PENDING', 'IN_REVIEW', 'NEEDS_DOCUMENTS'] } },
    include: { org: true, license: true, product: true },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    take: 100,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('compliance.queueTitle')}</h1>

      <Card>
        <CardContent className="p-0">
          {reviews.length === 0 ? (
            <div className="p-6">
              <EmptyState title={t('compliance.emptyQueue')} />
            </div>
          ) : (
            <Table>
              <THead>
                <Tr>
                  <Th>{t('compliance.typeLabel')}</Th>
                  <Th>{t('compliance.org')}</Th>
                  <Th>{t('common.details')}</Th>
                  <Th>{t('compliance.priority')}</Th>
                  <Th>{t('compliance.created')}</Th>
                  <Th>{t('common.status')}</Th>
                  <Th>{t('common.actions')}</Th>
                </Tr>
              </THead>
              <TBody>
                {reviews.map((r) => (
                  <Tr key={r.id}>
                    <Td className="font-medium">{t(`compliance.review${r.type}`)}</Td>
                    <Td>
                      {r.org?.legalName ?? '—'}
                      {r.org?.isDemo ? <Badge tone="violet" className="ms-2">DEMO</Badge> : null}
                    </Td>
                    <Td className="max-w-56">
                      {r.license ? (
                        <span className="text-xs">
                          {r.license.type} · {r.license.number}
                        </span>
                      ) : r.product ? (
                        <span className="text-xs">{r.product.inn}</span>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td className="tabular-nums">{r.priority}</Td>
                    <Td className="text-xs tabular-nums">{formatDateTime(r.createdAt, locale)}</Td>
                    <Td>
                      <Badge tone={toneForStatus(r.status)}>{t(`status.review.${r.status}`)}</Badge>
                    </Td>
                    <Td>
                      <ReviewDecisionForm reviewId={r.id} />
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
