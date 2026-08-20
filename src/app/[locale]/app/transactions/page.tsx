import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/current';
import { countryName } from '@/lib/country-name';
import { formatDateTime, formatMoney } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, toneForStatus } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/kpi';

export const dynamic = 'force-dynamic';

export default async function TransactionsPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const user = (await getCurrentUser())!;
  if (!user.org && !user.platformRole) return null;

  const transactions = await prisma.transaction.findMany({
    where: user.platformRole ? {} : { OR: [{ sellerOrgId: user.org!.id }, { buyerOrgId: user.org!.id }] },
    include: {
      listing: { include: { product: true } },
      sellerOrg: { select: { id: true, legalName: true } },
      buyerOrg: { select: { id: true, legalName: true } },
      destinationCountry: true,
      stateEvents: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('transactions.title')}</h1>
      <p className="text-sm text-slate-500">{t('transactions.complianceNote')}</p>

      {transactions.length === 0 ? (
        <EmptyState title={t('transactions.empty')} />
      ) : (
        <div className="space-y-4">
          {transactions.map((tx) => {
            const isSeller = user.org && tx.sellerOrg.id === user.org.id;
            const counterparty = isSeller ? tx.buyerOrg.legalName : tx.sellerOrg.legalName;
            return (
              <Card key={tx.id}>
                <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
                  <CardTitle>
                    {tx.listing?.product.inn ?? '—'} · {counterparty}
                    {tx.isDemo ? <Badge tone="violet" className="ms-2">DEMO</Badge> : null}
                  </CardTitle>
                  <span className="flex items-center gap-3">
                    <Badge tone={toneForStatus(tx.state)}>{t(`status.tx.${tx.state}`)}</Badge>
                    <Link href={`/app/transactions/${tx.id}`} className="text-sm font-medium text-brand-700 hover:underline">
                      {t('txd.open')} →
                    </Link>
                  </span>
                </CardHeader>
                <CardContent className="space-y-4">
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-slate-500">{t('transactions.destination')}</dt>
                      <dd className="font-medium">{countryName(tx.destinationCountry, locale)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">{t('transactions.subtotal')}</dt>
                      <dd className="font-medium tabular-nums">
                        {formatMoney(tx.subtotal?.toString(), tx.currency, locale)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">{t('transactions.commission')}</dt>
                      <dd className="font-medium tabular-nums">
                        {formatMoney(tx.commissionAmount?.toString(), tx.currency, locale)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">
                        {isSeller ? t('transactions.payout') : t('transactions.landed')}
                      </dt>
                      <dd className="font-medium tabular-nums">
                        {formatMoney(
                          (isSeller ? tx.sellerPayout : tx.buyerLandedCost)?.toString(),
                          tx.currency,
                          locale,
                        )}
                      </dd>
                    </div>
                  </dl>
                  <div>
                    <p className="mb-2 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                      {t('transactions.timeline')}
                    </p>
                    <ol className="space-y-1.5">
                      {tx.stateEvents.map((e) => (
                        <li key={e.id} className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="tabular-nums text-slate-400">{formatDateTime(e.createdAt, locale)}</span>
                          <Badge tone={toneForStatus(e.toState)}>{t(`status.tx.${e.toState}`)}</Badge>
                          <span className="text-slate-500">{e.actorType}</span>
                          {e.reason ? <span className="text-slate-600">— {e.reason}</span> : null}
                        </li>
                      ))}
                    </ol>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
