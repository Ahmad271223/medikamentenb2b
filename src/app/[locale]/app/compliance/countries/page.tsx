import { getLocale, getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, toActor } from '@/lib/auth/current';
import { hasPermission } from '@/lib/authz/permissions';
import { countryName } from '@/lib/country-name';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, toneForStatus } from '@/components/ui/badge';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/kpi';
import { ReadinessButton, TradeStatusButtons } from '@/components/forms/compliance-actions';

export const dynamic = 'force-dynamic';

interface ReadinessComponents {
  assessed?: Array<{ key: string; score: number; note: string }>;
  notAssessed?: string[];
}

export default async function CountriesPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const user = (await getCurrentUser())!;
  const actor = toActor(user);
  if (!hasPermission(actor, 'rule:draft') && !hasPermission(actor, 'review:decide')) {
    return <EmptyState title="403" />;
  }
  const canEnable = hasPermission(actor, 'country:trade-enable');

  const [countries, verifiedRules, latestScores] = await Promise.all([
    prisma.country.findMany({ orderBy: [{ tradeStatus: 'desc' }, { id: 'asc' }] }),
    prisma.regulatoryRule.groupBy({
      by: ['countryId'],
      where: { currentVersion: { status: 'VERIFIED' } },
      _count: true,
    }),
    prisma.countryReadinessScore.findMany({ orderBy: { computedAt: 'desc' }, distinct: ['countryId'] }),
  ]);
  const verifiedByCountry = new Map(verifiedRules.map((r) => [r.countryId, r._count]));
  const scoreByCountry = new Map(latestScores.map((s) => [s.countryId, s]));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('countries.title')}</h1>
      <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
        {t('countries.gateNote')}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <Tr>
                <Th>{t('common.country')}</Th>
                <Th>{t('common.status')}</Th>
                <Th>{t('countries.verifiedRules')}</Th>
                <Th>{t('countries.readiness')}</Th>
                {canEnable ? <Th>{t('common.actions')}</Th> : null}
              </Tr>
            </THead>
            <TBody>
              {countries.map((c) => {
                const score = scoreByCountry.get(c.id);
                const components = (score?.components ?? {}) as ReadinessComponents;
                return (
                  <Tr key={c.id}>
                    <Td className="font-medium">
                      {countryName(c, locale)} <span className="text-xs text-slate-400">({c.id})</span>
                      {c.isDemo ? <Badge tone="violet" className="ms-2">DEMO</Badge> : null}
                    </Td>
                    <Td>
                      <Badge tone={toneForStatus(c.tradeStatus)}>{t(`status.tradeStatus.${c.tradeStatus}`)}</Badge>
                    </Td>
                    <Td className="tabular-nums">{verifiedByCountry.get(c.id) ?? 0}</Td>
                    <Td className="max-w-72">
                      {score ? (
                        <div>
                          <span className="font-semibold tabular-nums">{score.total}/100</span>
                          <span className="ms-1 text-[11px] text-slate-400">v{score.version}</span>
                          <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                            {(components.assessed ?? []).map((a) => `${a.key} ${a.score}`).join(' · ')}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {t('countries.notAssessed', { items: (components.notAssessed ?? []).join(', ') })}
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                      <ReadinessButton countryId={c.id} />
                    </Td>
                    {canEnable ? (
                      <Td>
                        <TradeStatusButtons countryId={c.id} current={c.tradeStatus} />
                      </Td>
                    ) : null}
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
