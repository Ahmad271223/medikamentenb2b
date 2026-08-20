import { getLocale, getTranslations } from 'next-intl/server';
import { getCurrentUser, toActor } from '@/lib/auth/current';
import { hasPermission } from '@/lib/authz/permissions';
import { platformAnalytics } from '@/server/analytics-service';
import { formatMoney, formatNumber } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KpiCard, EmptyState } from '@/components/ui/kpi';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const user = (await getCurrentUser())!;
  if (!hasPermission(toActor(user), 'audit:read-platform')) return <EmptyState title="403" />;

  const a = await platformAnalytics();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('analytics.title')}</h1>
      <p className="text-sm text-slate-500">{t('analytics.estimateNote')}</p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={t('analytics.gmv')} value={formatMoney(a.gmv, 'EUR', locale)} />
        <KpiCard label={t('analytics.revenue')} value={formatMoney(a.platformRevenue, 'EUR', locale)} />
        <KpiCard label={t('analytics.settled')} value={formatNumber(a.settledCount, locale)} />
        <KpiCard label={t('analytics.packs')} value={formatNumber(a.packsRedistributed, locale)} hint={`${t('analytics.shortDatedPacks')}: ${formatNumber(a.shortDatedPacksRedistributed, locale)}`} />
        <KpiCard label={t('analytics.avgTx')} value={a.avgHoursToTransaction ?? '—'} />
        <KpiCard label={t('analytics.avgMatch')} value={a.avgHoursListingToMatch ?? '—'} />
        <KpiCard label={t('analytics.conversion')} value={a.matchConversionPercent !== null ? `${a.matchConversionPercent}%` : '—'} hint={`${a.transactionCount}/${a.matchCount}`} />
        <KpiCard label={t('admin.verifiedOrgs')} value={formatNumber(a.verifiedOrgs, locale)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('analytics.savingsTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {a.savings.totalBuyerSavings !== null ? (
            <p className="text-2xl font-semibold tabular-nums text-emerald-700">
              {formatMoney(a.savings.totalBuyerSavings, 'EUR', locale)}
            </p>
          ) : (
            <p className="text-slate-400">{t('analytics.insufficient')}</p>
          )}
          <p className="mt-1 text-xs text-slate-500">
            {t('analytics.savingsWith', { count: a.savings.dealsWithReference })} ·{' '}
            {t('analytics.savingsWithout', { count: a.savings.dealsWithoutReference })}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('analytics.countryGmv')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <Tr>
                  <Th>{t('common.country')}</Th>
                  <Th>GMV</Th>
                  <Th>#</Th>
                </Tr>
              </THead>
              <TBody>
                {a.countryGmv.map((c) => (
                  <Tr key={c.countryId}>
                    <Td className="font-medium">{c.countryId}</Td>
                    <Td className="tabular-nums">{formatMoney(c.gmv, 'EUR', locale)}</Td>
                    <Td className="tabular-nums">{c.count}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('analytics.productGmv')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <Tr>
                  <Th>{t('inventory.product')}</Th>
                  <Th>GMV</Th>
                  <Th>#</Th>
                </Tr>
              </THead>
              <TBody>
                {a.productGmv.map((p) => (
                  <Tr key={p.inn}>
                    <Td className="font-medium">{p.inn}</Td>
                    <Td className="tabular-nums">{formatMoney(p.gmv, 'EUR', locale)}</Td>
                    <Td className="tabular-nums">{p.count}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
