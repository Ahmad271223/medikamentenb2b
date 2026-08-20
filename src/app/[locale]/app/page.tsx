import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/current';
import { getConfig } from '@/lib/config/platform-config';
import { expiryBucket, meetsMinimumMonths, type ExpiryBucket } from '@/domain/shelf-life/shelf-life';
import { addDaysUtc } from '@/domain/dates';
import { KpiCard } from '@/components/ui/kpi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, toneForStatus } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

const BUCKET_ORDER: ExpiryBucket[] = ['EXPIRED', 'D0_90', 'D91_180', 'D181_270', 'D271_365', 'Y1_2', 'Y2_PLUS'];

export default async function DashboardPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const user = (await getCurrentUser())!;
  const today = new Date();

  if (!user.org) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('dashboard.title')}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {t('dashboard.welcome', { name: `${user.firstName} ${user.lastName}` })}
        </p>
      </div>
    );
  }

  // Pure buyers get a demand-side dashboard (spec §34); sellers/hybrids keep
  // the inventory view below.
  if (user.org.kind === 'BUYER') {
    const [activeRfqs, matches, openNegotiations, incomingShipments, settledPurchases] = await Promise.all([
      prisma.buyerDemand.count({ where: { buyerOrgId: user.org.id, status: 'ACTIVE' } }),
      prisma.match.count({ where: { buyerOrgId: user.org.id } }),
      prisma.negotiation.count({ where: { buyerOrgId: user.org.id, status: 'OPEN' } }),
      prisma.shipment.count({
        where: { transaction: { buyerOrgId: user.org.id }, status: { in: ['BOOKED', 'IN_TRANSIT', 'CUSTOMS'] } },
      }),
      prisma.transaction.findMany({
        where: { buyerOrgId: user.org.id, state: 'SETTLED' },
        select: { buyerLandedCost: true, currency: true },
      }),
    ]);
    const spend = settledPurchases.reduce((sum, tx) => sum + Number(tx.buyerLandedCost ?? 0), 0);

    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('dashboard.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {t('dashboard.welcome', { name: `${user.firstName} ${user.lastName}` })}
          </p>
        </div>
        {user.org.status !== 'VERIFIED' ? (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="flex items-center gap-3">
                <Badge tone={toneForStatus(user.org.status)}>{t(`status.org.${user.org.status}`)}</Badge>
                <p className="text-sm text-amber-900">{t('dashboard.kybPendingHint')}</p>
              </div>
              <Link href="/app/onboarding" className="text-sm font-medium text-amber-900 underline">
                {t('dashboard.goOnboarding')}
              </Link>
            </CardContent>
          </Card>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard label={t('buyerDash.activeRfqs')} value={activeRfqs} />
          <KpiCard label={t('buyerDash.matches')} value={matches} />
          <KpiCard label={t('buyerDash.openNegotiations')} value={openNegotiations} tone={openNegotiations > 0 ? 'warning' : 'default'} />
          <KpiCard label={t('buyerDash.incomingShipments')} value={incomingShipments} />
          <KpiCard
            label={t('buyerDash.spend')}
            value={new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(spend)}
          />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.quickTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/app/marketplace" className="text-brand-700 hover:underline">
                  → {t('nav.marketplace')}
                </Link>
              </li>
              <li>
                <Link href="/app/demands" className="text-brand-700 hover:underline">
                  → {t('demands.add')}
                </Link>
              </li>
              <li>
                <Link href="/app/offers" className="text-brand-700 hover:underline">
                  → {t('nav.offers')}
                </Link>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    );
  }

  const warnDays = await getConfig('license_warning_days');
  const shortDatedMonths = await getConfig('short_dated_threshold_months');

  const [batches, licensesExpiring, openReviews] = await Promise.all([
    prisma.batch.findMany({
      where: { sellerOrgId: user.org.id, deletedAt: null },
      select: { expiryDate: true, quantity: true },
    }),
    prisma.license.count({
      where: { orgId: user.org.id, expiryDate: { lte: addDaysUtc(today, warnDays) }, status: { not: 'REJECTED' } },
    }),
    prisma.complianceReview.count({
      where: { orgId: user.org.id, status: { in: ['PENDING', 'IN_REVIEW', 'NEEDS_DOCUMENTS'] } },
    }),
  ]);

  const bucketCounts = new Map<ExpiryBucket, number>();
  let expiring90 = 0;
  let shortDated = 0;
  for (const b of batches) {
    const bucket = expiryBucket(b.expiryDate, today);
    bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + 1);
    if (bucket === 'D0_90' || bucket === 'EXPIRED') expiring90 += 1;
    if (!meetsMinimumMonths(b.expiryDate, today, shortDatedMonths)) shortDated += 1;
  }
  const maxBucket = Math.max(1, ...bucketCounts.values());

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('dashboard.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {t('dashboard.welcome', { name: `${user.firstName} ${user.lastName}` })}
        </p>
      </div>

      {user.org.status !== 'VERIFIED' ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-3">
              <Badge tone={toneForStatus(user.org.status)}>{t(`status.org.${user.org.status}`)}</Badge>
              <p className="text-sm text-amber-900">{t('dashboard.kybPendingHint')}</p>
            </div>
            <Link href="/app/onboarding" className="text-sm font-medium text-amber-900 underline">
              {t('dashboard.goOnboarding')}
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={t('dashboard.kpiActiveBatches')} value={batches.length} />
        <KpiCard
          label={t('dashboard.kpiShortDated')}
          value={shortDated}
          tone={shortDated > 0 ? 'warning' : 'default'}
        />
        <KpiCard label={t('dashboard.kpiExpiring90')} value={expiring90} tone={expiring90 > 0 ? 'danger' : 'default'} />
        <KpiCard
          label={t('dashboard.kpiLicensesExpiring')}
          value={licensesExpiring}
          tone={licensesExpiring > 0 ? 'warning' : 'default'}
          hint={`≤ ${warnDays}d`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('dashboard.expiryTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {BUCKET_ORDER.map((bucket) => {
                const count = bucketCounts.get(bucket) ?? 0;
                return (
                  <div key={bucket} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 text-xs text-slate-500">{t(`buckets.${bucket}`)}</span>
                    <div className="h-5 flex-1 rounded bg-slate-100">
                      <div
                        className={
                          bucket === 'EXPIRED' || bucket === 'D0_90'
                            ? 'h-5 rounded bg-red-400'
                            : bucket === 'D91_180' || bucket === 'D181_270'
                              ? 'h-5 rounded bg-amber-400'
                              : 'h-5 rounded bg-brand-500'
                        }
                        style={{ width: `${(count / maxBucket) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 text-end text-sm font-medium tabular-nums text-slate-700">
                      {new Intl.NumberFormat(locale).format(count)}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.quickTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/app/inventory" className="text-brand-700 hover:underline">
                  → {t('dashboard.quickAddBatch')}
                </Link>
              </li>
              <li>
                <Link href="/app/licenses" className="text-brand-700 hover:underline">
                  → {t('dashboard.quickUploadLicense')}
                </Link>
              </li>
              <li>
                <Link href="/app/products" className="text-brand-700 hover:underline">
                  → {t('dashboard.quickCreateProduct')}
                </Link>
              </li>
            </ul>
            {openReviews > 0 ? (
              <p className="mt-4 text-xs text-slate-500">
                {t('dashboard.kpiOpenReviews')}: {openReviews}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
