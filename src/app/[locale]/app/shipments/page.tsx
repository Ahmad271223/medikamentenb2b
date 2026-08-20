import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/current';
import { formatDate } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, toneForStatus } from '@/components/ui/badge';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/kpi';

export const dynamic = 'force-dynamic';

export default async function ShipmentsPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const user = (await getCurrentUser())!;
  if (!user.org && !user.platformRole) return null;

  const shipments = await prisma.shipment.findMany({
    where: user.platformRole
      ? {}
      : { transaction: { OR: [{ sellerOrgId: user.org!.id }, { buyerOrgId: user.org!.id }] } },
    include: {
      transaction: { include: { listing: { include: { product: true } } } },
      originWarehouse: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('shipments.title')}</h1>
      <Card>
        <CardContent className="p-0">
          {shipments.length === 0 ? (
            <div className="p-6">
              <EmptyState title={t('shipments.empty')} />
            </div>
          ) : (
            <Table>
              <THead>
                <Tr>
                  <Th>{t('inventory.product')}</Th>
                  <Th>{t('txd.carrier')}</Th>
                  <Th>{t('marketplace.origin')}</Th>
                  <Th>{t('transactions.destination')}</Th>
                  <Th>{t('txd.eta')}</Th>
                  <Th>{t('common.status')}</Th>
                  <Th />
                </Tr>
              </THead>
              <TBody>
                {shipments.map((s) => (
                  <Tr key={s.id}>
                    <Td className="font-medium">{s.transaction.listing?.product.inn ?? '—'}</Td>
                    <Td>{s.carrier ?? '—'}</Td>
                    <Td className="text-xs">{s.originWarehouse?.name ?? '—'}</Td>
                    <Td>{s.destinationCountryId ?? '—'}</Td>
                    <Td className="tabular-nums">{formatDate(s.estimatedArrival, locale)}</Td>
                    <Td>
                      <Badge tone={toneForStatus(s.status)}>{s.status}</Badge>
                    </Td>
                    <Td>
                      <Link
                        href={`/app/transactions/${s.transactionId}`}
                        className="text-sm font-medium text-brand-700 hover:underline"
                      >
                        {t('shipments.toTx')} →
                      </Link>
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
