import { getLocale, getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/current';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, toneForStatus } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/kpi';
import { OfferRespondForm } from '@/components/forms/offer-respond-form';

export const dynamic = 'force-dynamic';

export default async function OffersPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const user = (await getCurrentUser())!;
  if (!user.org) return null;
  const orgId = user.org.id;

  const negotiations = await prisma.negotiation.findMany({
    where: { OR: [{ sellerOrgId: orgId }, { buyerOrgId: orgId }] },
    include: {
      listing: { include: { product: true } },
      sellerOrg: { select: { id: true, legalName: true } },
      buyerOrg: { select: { id: true, legalName: true } },
      offers: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('offers.title')}</h1>

      {negotiations.length === 0 ? (
        <EmptyState title={t('offers.empty')} />
      ) : (
        <div className="space-y-4">
          {negotiations.map((n) => {
            const isSeller = n.sellerOrgId === orgId;
            const counterpartyName = isSeller ? n.buyerOrg.legalName : n.sellerOrg.legalName;
            const openOffer = n.offers.find((o) => o.status === 'SUBMITTED');
            const myTurn =
              n.status === 'OPEN' &&
              openOffer != null &&
              ((openOffer.direction === 'BUYER_TO_SELLER' && isSeller) ||
                (openOffer.direction === 'SELLER_TO_BUYER' && !isSeller));

            return (
              <Card key={n.id}>
                <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
                  <CardTitle>
                    {n.listing?.product.inn ?? '—'} · {counterpartyName}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {n.status === 'CONCLUDED' ? (
                      <Badge tone="success">{t('offers.concluded')}</Badge>
                    ) : myTurn ? (
                      <Badge tone="warning">{t('offers.yourTurn')}</Badge>
                    ) : (
                      <Badge>{t('offers.waiting')}</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="mb-2 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                      {t('offers.chain')}
                    </p>
                    <ol className="space-y-2">
                      {n.offers.map((o) => (
                        <li key={o.id} className="flex flex-wrap items-center gap-3 text-sm">
                          <Badge tone={toneForStatus(o.status)}>{o.status}</Badge>
                          <span className="text-slate-600">
                            {t('offers.offerBy', {
                              org: o.byOrgId === n.sellerOrg.id ? n.sellerOrg.legalName : n.buyerOrg.legalName,
                            })}
                          </span>
                          <span className="font-medium tabular-nums">
                            {formatNumber(o.quantity, locale)} × {formatMoney(o.unitPrice.toString(), o.currency, locale)}
                          </span>
                          <span className="text-xs text-slate-400 tabular-nums">
                            {formatDateTime(o.createdAt, locale)}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  {myTurn && openOffer ? (
                    <OfferRespondForm
                      offerId={openOffer.id}
                      quantity={openOffer.quantity}
                      unitPrice={openOffer.unitPrice.toString()}
                    />
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
