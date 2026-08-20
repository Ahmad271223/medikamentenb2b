import { getLocale, getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/current';
import { countryName } from '@/lib/country-name';
import { formatDate, formatMoney, formatNumber } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, toneForStatus } from '@/components/ui/badge';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/kpi';
import { ListingForm, type BatchOption } from '@/components/forms/listing-form';

export const dynamic = 'force-dynamic';

const OPEN_STATUSES = ['DRAFT', 'PENDING_COMPLIANCE', 'ACTIVE', 'PAUSED'] as const;

export default async function ListingsPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const user = (await getCurrentUser())!;
  if (!user.org) return null;

  const [listings, batches, destinationCountries] = await Promise.all([
    prisma.listing.findMany({
      where: { sellerOrgId: user.org.id, deletedAt: null },
      include: { product: true, batch: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.batch.findMany({
      where: {
        sellerOrgId: user.org.id,
        deletedAt: null,
        recallStatus: 'NONE',
        quarantineStatus: { not: 'QUARANTINED' },
        expiryDate: { gt: new Date() },
        listings: { none: { status: { in: [...OPEN_STATUSES] }, deletedAt: null } },
      },
      include: { product: true, position: true },
      orderBy: { expiryDate: 'asc' },
    }),
    prisma.country.findMany({ where: { isDestinationEnabled: true }, orderBy: { id: 'asc' } }),
  ]);

  // Verdict summary per listing, grouped in one query.
  const verdictRows = await prisma.listingEligibility.groupBy({
    by: ['listingId', 'verdict'],
    where: { listingId: { in: listings.map((l) => l.id) } },
    _count: true,
  });
  const summary = new Map<string, Record<string, number>>();
  for (const row of verdictRows) {
    const entry = summary.get(row.listingId) ?? {};
    entry[row.verdict] = row._count;
    summary.set(row.listingId, entry);
  }

  const batchOptions: BatchOption[] = batches.map((b) => {
    const available = (b.position?.onHand ?? b.quantity) - (b.position?.reserved ?? 0);
    return {
      id: b.id,
      label: `${b.product.inn} · ${b.lotNumber} · ${formatDate(b.expiryDate, locale)} · ${available} ${b.unit}`,
      available,
    };
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('listings.title')}</h1>

      <Card>
        <CardContent className="p-0">
          {listings.length === 0 ? (
            <div className="p-6">
              <EmptyState title={t('listings.empty')} />
            </div>
          ) : (
            <Table>
              <THead>
                <Tr>
                  <Th>{t('inventory.product')}</Th>
                  <Th>{t('inventory.lot')}</Th>
                  <Th>{t('listings.quantity')}</Th>
                  <Th>{t('listings.price')}</Th>
                  <Th>{t('common.type')}</Th>
                  <Th>{t('common.status')}</Th>
                  <Th>{t('common.details')}</Th>
                </Tr>
              </THead>
              <TBody>
                {listings.map((l) => {
                  const s = summary.get(l.id) ?? {};
                  return (
                    <Tr key={l.id}>
                      <Td className="font-medium">
                        {l.product.inn}
                        {l.isDemo ? <Badge tone="violet" className="ms-2">DEMO</Badge> : null}
                      </Td>
                      <Td className="font-mono text-xs">{l.batch.lotNumber}</Td>
                      <Td className="tabular-nums">{formatNumber(l.quantityAvailable, locale)}</Td>
                      <Td className="tabular-nums">{formatMoney(l.unitPrice.toString(), l.currency, locale)}</Td>
                      <Td>
                        <Badge tone={l.listingType === 'SHORT_DATED' ? 'warning' : 'success'}>
                          {l.listingType === 'SHORT_DATED' ? t('landing.shortDatedTitle') : t('landing.surplusTitle')}
                        </Badge>
                      </Td>
                      <Td>
                        <Badge tone={toneForStatus(l.status)}>{t(`status.listing.${l.status}`)}</Badge>
                      </Td>
                      <Td className="text-xs text-slate-500">
                        {t('listings.eligibilitySummary', {
                          eligible: s['ELIGIBLE'] ?? 0,
                          conditional: s['CONDITIONALLY_ELIGIBLE'] ?? 0,
                          review: s['HUMAN_REVIEW_REQUIRED'] ?? 0,
                          insufficient: s['INSUFFICIENT_DATA'] ?? 0,
                        })}
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {batchOptions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('listings.create')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ListingForm
              batches={batchOptions}
              destinationCountries={destinationCountries.map((c) => ({
                id: c.id,
                name: `${countryName(c, locale)} (${c.id})`,
              }))}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
