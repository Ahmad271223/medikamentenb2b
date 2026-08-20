import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/current';
import { countryName } from '@/lib/country-name';
import { formatDate, formatMoney, formatNumber } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, toneForStatus } from '@/components/ui/badge';
import { OfferForm } from '@/components/forms/offer-form';

export const dynamic = 'force-dynamic';

interface ReasonEntry {
  code: string;
  severity: string;
}

export default async function MarketplaceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations();
  const locale = await getLocale();
  const user = (await getCurrentUser())!;
  if (!user.org) return null;
  const { id } = await params;

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: user.org.id } });
  const listing = await prisma.listing.findFirst({
    where: { id, deletedAt: null, status: { in: ['ACTIVE', 'SOLD_OUT', 'PAUSED'] } },
    include: {
      product: true,
      batch: true,
      sellerOrg: true,
      eligibilities: { where: { countryId: org.countryId }, include: { country: true } },
    },
  });
  if (!listing) notFound();

  // Visibility is enforced server-side even on direct URLs.
  const visibleToBuyer =
    listing.sellerOrgId === org.id ||
    listing.visibility === 'PUBLIC_VERIFIED' ||
    (listing.visibility === 'COUNTRY_RESTRICTED' && listing.restrictedToCountryIds.includes(org.countryId));
  if (!visibleToBuyer) notFound();

  const eligibility = listing.eligibilities[0] ?? null;
  const purchasable =
    listing.status === 'ACTIVE' &&
    org.status === 'VERIFIED' &&
    listing.sellerOrgId !== org.id &&
    eligibility != null &&
    (eligibility.verdict === 'ELIGIBLE' || eligibility.verdict === 'CONDITIONALLY_ELIGIBLE');

  const reasons = ((eligibility?.reasons as unknown as ReasonEntry[]) ?? []).filter(
    (r) => r.severity !== 'INFO',
  );
  const requiredDocs = (eligibility?.requiredDocuments as string[] | null) ?? [];
  const requiredPermits = (eligibility?.requiredPermits as string[] | null) ?? [];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {listing.product.inn}
          {listing.product.strengthValue ? ` ${listing.product.strengthValue.toString()} ${listing.product.strengthUnit ?? ''}` : ''}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {listing.product.dosageForm}
          {listing.product.atcCode ? ` · ATC ${listing.product.atcCode}` : ''}
          {listing.isDemo ? ' · DEMO' : ''}
        </p>
      </div>

      <Card>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-slate-500">{t('marketplace.origin')}</dt>
              <dd className="font-medium">
                {listing.anonymousSeller ? t('marketplace.anonymousSeller') : listing.sellerOrg.legalName} (
                {listing.sellerOrg.countryId})
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">{t('inventory.expiry')}</dt>
              <dd className="font-medium tabular-nums">{formatDate(listing.batch.expiryDate, locale)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{t('marketplace.arrivalShelf')}</dt>
              <dd className="font-medium tabular-nums">
                {eligibility?.arrivalShelfLifeDays != null
                  ? `${t('inventory.daysShort', { count: eligibility.arrivalShelfLifeDays })}${
                      eligibility.arrivalShelfLifePercent != null
                        ? ` · ${Number(eligibility.arrivalShelfLifePercent).toFixed(0)}%`
                        : ''
                    }`
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">{t('marketplace.available')}</dt>
              <dd className="font-medium tabular-nums">
                {formatNumber(listing.quantityAvailable, locale)} · {t('marketplace.minOrder')}{' '}
                {formatNumber(listing.minOrderQuantity, locale)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">{t('common.price')}</dt>
              <dd className="font-medium tabular-nums">
                {formatMoney(listing.unitPrice.toString(), listing.currency, locale)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">{t('common.status')}</dt>
              <dd>
                <Badge tone={toneForStatus(listing.status)}>{t(`status.listing.${listing.status}`)}</Badge>
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {eligibility ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>
              {t('marketplace.conditionsTitle')} — {countryName(eligibility.country, locale)}
            </CardTitle>
            <Badge tone={toneForStatus(eligibility.verdict)}>{t(`status.verdict.${eligibility.verdict}`)}</Badge>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {requiredPermits.length > 0 ? (
              <p>
                <span className="text-slate-500">{t('marketplace.permitsRequired')}: </span>
                {requiredPermits.map((p) => p.replaceAll('_', ' ')).join(', ')}
              </p>
            ) : null}
            {requiredDocs.length > 0 ? (
              <p>
                <span className="text-slate-500">{t('marketplace.docsRequired')}: </span>
                {requiredDocs.map((d) => d.replaceAll('_', ' ')).join(', ')}
              </p>
            ) : null}
            {reasons.length > 0 ? (
              <ul className="space-y-1">
                {reasons.map((r, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs">
                    <Badge tone={r.severity === 'BLOCK' ? 'danger' : r.severity === 'CONDITION' ? 'warning' : 'neutral'}>
                      {r.severity}
                    </Badge>
                    <code className="text-slate-600">{r.code.replaceAll('_', ' ')}</code>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="text-xs text-slate-400">{t('common.legalDisclaimer')}</p>
          </CardContent>
        </Card>
      ) : null}

      {purchasable ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('marketplace.makeOffer')}</CardTitle>
          </CardHeader>
          <CardContent>
            <OfferForm
              listingId={listing.id}
              minOrder={listing.minOrderQuantity}
              available={listing.quantityAvailable}
              currency={listing.currency}
              defaultPrice={listing.unitPrice.toString()}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
