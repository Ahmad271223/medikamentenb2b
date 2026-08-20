import { getLocale, getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, toActor } from '@/lib/auth/current';
import { hasPermission } from '@/lib/authz/permissions';
import { formatDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/kpi';
import { RecallForm } from '@/components/forms/recall-form';
import { ResolveRecallButton } from '@/components/forms/compliance-actions';

export const dynamic = 'force-dynamic';

export default async function RecallsPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const user = (await getCurrentUser())!;
  if (!hasPermission(toActor(user), 'review:decide')) return <EmptyState title="403" />;

  const [recalls, batches] = await Promise.all([
    prisma.recall.findMany({
      include: {
        product: { select: { inn: true } },
        affectedBatches: { include: { batch: { select: { lotNumber: true } } } },
      },
      orderBy: { issuedAt: 'desc' },
      take: 50,
    }),
    prisma.batch.findMany({
      where: { deletedAt: null, recallStatus: 'NONE' },
      include: { product: { select: { inn: true } }, sellerOrg: { select: { legalName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('recalls.title')}</h1>
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
        {t('recalls.note')}
      </div>

      <Card>
        <CardContent className="p-0">
          {recalls.length === 0 ? (
            <div className="p-6">
              <EmptyState title={t('recalls.empty')} />
            </div>
          ) : (
            <Table>
              <THead>
                <Tr>
                  <Th>{t('inventory.product')}</Th>
                  <Th>{t('recalls.scope')}</Th>
                  <Th>{t('recalls.batches')}</Th>
                  <Th>{t('recalls.source')}</Th>
                  <Th>{t('common.date')}</Th>
                  <Th>{t('common.status')}</Th>
                  <Th>{t('common.actions')}</Th>
                </Tr>
              </THead>
              <TBody>
                {recalls.map((r) => (
                  <Tr key={r.id}>
                    <Td className="font-medium">{r.product?.inn ?? '—'}</Td>
                    <Td className="max-w-56 text-xs">{r.scope}</Td>
                    <Td className="font-mono text-xs">
                      {r.affectedBatches.map((ab) => ab.batch.lotNumber).join(', ')}
                    </Td>
                    <Td className="text-xs">{r.sourceName ?? '—'}</Td>
                    <Td className="text-xs tabular-nums">{formatDate(r.issuedAt, locale)}</Td>
                    <Td>
                      <Badge tone={r.status === 'ACTIVE' ? 'danger' : 'neutral'}>{r.status}</Badge>
                    </Td>
                    <Td>{r.status === 'ACTIVE' ? <ResolveRecallButton recallId={r.id} /> : null}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('recalls.create')}</CardTitle>
        </CardHeader>
        <CardContent>
          <RecallForm
            batches={batches.map((b) => ({
              id: b.id,
              label: `${b.product.inn} · ${b.lotNumber} · ${b.sellerOrg.legalName}`,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
