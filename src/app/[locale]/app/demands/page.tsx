import { getLocale, getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/current';
import { formatDate, formatNumber } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, toneForStatus } from '@/components/ui/badge';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/kpi';
import { DemandForm } from '@/components/forms/demand-form';

export const dynamic = 'force-dynamic';

export default async function DemandsPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const user = (await getCurrentUser())!;
  if (!user.org) return null;

  const [demands, products] = await Promise.all([
    prisma.buyerDemand.findMany({
      where: { buyerOrgId: user.org.id },
      include: { product: true, _count: { select: { matches: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.product.findMany({
      where: { deletedAt: null, status: 'VERIFIED' },
      orderBy: { inn: 'asc' },
      take: 300,
    }),
  ]);

  const productOptions = products.map((p) => ({
    id: p.id,
    label: `${p.inn}${p.strengthValue ? ` ${p.strengthValue.toString()}${p.strengthUnit ?? ''}` : ''} · ${p.dosageForm}`,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('demands.title')}</h1>

      <Card>
        <CardContent className="p-0">
          {demands.length === 0 ? (
            <div className="p-6">
              <EmptyState title={t('demands.empty')} />
            </div>
          ) : (
            <Table>
              <THead>
                <Tr>
                  <Th>{t('inventory.product')}</Th>
                  <Th>{t('demands.quantity')}</Th>
                  <Th>{t('demands.requiredBy')}</Th>
                  <Th>{t('demands.maxPrice')}</Th>
                  <Th>{t('demands.minShelf')}</Th>
                  <Th>{t('demands.matches')}</Th>
                  <Th>{t('common.status')}</Th>
                </Tr>
              </THead>
              <TBody>
                {demands.map((d) => (
                  <Tr key={d.id}>
                    <Td className="font-medium">
                      {d.product?.inn ?? d.productFreeText}
                      {d.isDemo ? <Badge tone="violet" className="ms-2">DEMO</Badge> : null}
                    </Td>
                    <Td className="tabular-nums">{formatNumber(d.quantity, locale)}</Td>
                    <Td className="tabular-nums">{formatDate(d.requiredBy, locale)}</Td>
                    <Td className="tabular-nums">{d.maxUnitPrice ? `${d.maxUnitPrice.toString()} ${d.currency}` : '—'}</Td>
                    <Td className="tabular-nums">{d.minRemainingShelfLifeMonths ?? '—'}</Td>
                    <Td className="tabular-nums">{d._count.matches}</Td>
                    <Td>
                      <Badge tone={toneForStatus(d.status)}>{d.status}</Badge>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('demands.add')}</CardTitle>
        </CardHeader>
        <CardContent>
          <DemandForm products={productOptions} />
        </CardContent>
      </Card>
    </div>
  );
}
