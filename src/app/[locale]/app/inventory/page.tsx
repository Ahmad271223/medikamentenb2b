import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/current';
import { calculateShelfLife } from '@/domain/shelf-life/shelf-life';
import { formatDate, formatNumber } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, toneForStatus } from '@/components/ui/badge';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/kpi';
import { BatchForm } from '@/components/forms/batch-form';

export const dynamic = 'force-dynamic';

export default async function InventoryPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const user = (await getCurrentUser())!;
  if (!user.org) return null;
  const today = new Date();

  const [batches, products, warehouses] = await Promise.all([
    prisma.batch.findMany({
      where: { sellerOrgId: user.org.id, deletedAt: null },
      include: { product: true, warehouse: true },
      orderBy: { expiryDate: 'asc' },
      take: 500,
    }),
    prisma.product.findMany({
      where: { deletedAt: null, OR: [{ status: 'VERIFIED' }, { proposedByOrgId: user.org.id }] },
      orderBy: { inn: 'asc' },
    }),
    prisma.warehouse.findMany({ where: { orgId: user.org.id, deletedAt: null } }),
  ]);

  const productOptions = products.map((p) => ({
    id: p.id,
    label: `${p.inn}${p.strengthValue ? ` ${p.strengthValue.toString()}${p.strengthUnit ?? ''}` : ''} · ${p.dosageForm}`,
  }));
  const warehouseOptions = warehouses.map((w) => ({ id: w.id, name: w.name }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('inventory.title')}</h1>
        <Link href="/app/inventory/bulk" className="text-sm font-medium text-brand-700 hover:underline">
          {t('bulk.title')} →
        </Link>
      </div>

      <Card>
        <CardContent className="p-0">
          {batches.length === 0 ? (
            <div className="p-6">
              <EmptyState title={t('inventory.empty')} />
            </div>
          ) : (
            <Table>
              <THead>
                <Tr>
                  <Th>{t('inventory.product')}</Th>
                  <Th>{t('inventory.lot')}</Th>
                  <Th>{t('inventory.expiry')}</Th>
                  <Th>{t('inventory.remaining')}</Th>
                  <Th>{t('inventory.qty')}</Th>
                  <Th>{t('inventory.warehouse')}</Th>
                  <Th>{t('inventory.quality')}</Th>
                </Tr>
              </THead>
              <TBody>
                {batches.map((b) => {
                  const life = calculateShelfLife({
                    expiryDate: b.expiryDate,
                    manufacturingDate: b.manufacturingDate,
                    originalShelfLifeMonths: b.product.originalShelfLifeMonths,
                    atDate: today,
                  });
                  const tone =
                    life.daysRemaining < 0 ? 'danger' : life.daysRemaining <= 180 ? 'warning' : 'success';
                  return (
                    <Tr key={b.id}>
                      <Td className="font-medium">
                        {b.product.inn}
                        {b.isDemo ? <Badge tone="violet" className="ms-2">DEMO</Badge> : null}
                      </Td>
                      <Td className="font-mono text-xs">{b.lotNumber}</Td>
                      <Td className="tabular-nums">{formatDate(b.expiryDate, locale)}</Td>
                      <Td>
                        <Badge tone={tone}>
                          {t('inventory.monthsShort', { count: life.monthsRemaining })}
                          {life.percentRemaining !== null ? ` · ${life.percentRemaining.toFixed(0)}%` : ''}
                        </Badge>
                      </Td>
                      <Td className="tabular-nums">
                        {formatNumber(b.quantity, locale)} {b.unit}
                      </Td>
                      <Td>{b.warehouse.name}</Td>
                      <Td>
                        <Badge tone={toneForStatus(b.qualityStatus)}>{t(`status.quality.${b.qualityStatus}`)}</Badge>
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('inventory.add')}</CardTitle>
        </CardHeader>
        <CardContent>
          <BatchForm products={productOptions} warehouses={warehouseOptions} />
        </CardContent>
      </Card>
    </div>
  );
}
