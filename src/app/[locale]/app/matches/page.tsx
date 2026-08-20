import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/current';
import { countryName } from '@/lib/country-name';
import { formatMoney, formatNumber } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/kpi';

export const dynamic = 'force-dynamic';

export default async function MatchesPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const user = (await getCurrentUser())!;
  if (!user.org) return null;

  const matches = await prisma.match.findMany({
    where: { OR: [{ sellerOrgId: user.org.id }, { buyerOrgId: user.org.id }] },
    include: {
      listing: { include: { product: true } },
      demand: { include: { destinationCountry: true } },
    },
    orderBy: { score: 'desc' },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('matches.title')}</h1>

      <Card>
        <CardContent className="p-0">
          {matches.length === 0 ? (
            <div className="p-6">
              <EmptyState title={t('matches.empty')} />
            </div>
          ) : (
            <Table>
              <THead>
                <Tr>
                  <Th>{t('matches.score')}</Th>
                  <Th>{t('inventory.product')}</Th>
                  <Th>{t('matches.demandQty')}</Th>
                  <Th>{t('common.price')}</Th>
                  <Th>{t('common.country')}</Th>
                  <Th>{t('matches.role')}</Th>
                  <Th />
                </Tr>
              </THead>
              <TBody>
                {matches.map((m) => {
                  const isSeller = m.sellerOrgId === user.org!.id;
                  return (
                    <Tr key={m.id}>
                      <Td>
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-800 ring-1 ring-brand-200 tabular-nums">
                          {m.score}
                        </span>
                      </Td>
                      <Td className="font-medium">{m.listing?.product.inn ?? '—'}</Td>
                      <Td className="tabular-nums">{m.demand ? formatNumber(m.demand.quantity, locale) : '—'}</Td>
                      <Td className="tabular-nums">
                        {m.listing ? formatMoney(m.listing.unitPrice.toString(), m.listing.currency, locale) : '—'}
                      </Td>
                      <Td>{m.demand ? countryName(m.demand.destinationCountry, locale) : '—'}</Td>
                      <Td>
                        <Badge tone={isSeller ? 'brand' : 'info'}>
                          {isSeller ? t('matches.asSeller') : t('matches.asBuyer')}
                        </Badge>
                      </Td>
                      <Td>
                        {!isSeller && m.listingId ? (
                          <Link
                            href={`/app/marketplace/${m.listingId}`}
                            className="text-sm font-medium text-brand-700 hover:underline"
                          >
                            {t('matches.toListing')} →
                          </Link>
                        ) : null}
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
