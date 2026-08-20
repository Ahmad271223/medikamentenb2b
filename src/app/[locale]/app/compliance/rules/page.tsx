import { getLocale, getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, toActor } from '@/lib/auth/current';
import { hasPermission } from '@/lib/authz/permissions';
import { countryName } from '@/lib/country-name';
import { formatDate } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, toneForStatus } from '@/components/ui/badge';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/kpi';
import type { ShelfLifeRulePayload } from '@/domain/shelf-life/types';

export const dynamic = 'force-dynamic';

function summarizePayload(ruleType: string, payload: unknown): string {
  if (ruleType === 'SHELF_LIFE' && payload && typeof payload === 'object' && 'kind' in payload) {
    const p = payload as ShelfLifeRulePayload;
    switch (p.kind) {
      case 'ABSOLUTE_MONTHS':
        return `≥ ${p.minMonths} months at arrival`;
      case 'PERCENTAGE_OF_ORIGINAL':
        return `≥ ${p.minPercent}% of original shelf life`;
      case 'COMBINED_RULE':
        return `≥ ${p.minMonths} months ${p.combinator} ≥ ${p.minPercent}%`;
      case 'PRODUCT_SPECIFIC':
        return `product-specific (${p.rules.length} rules + fallback)`;
      case 'CASE_BY_CASE':
        return 'case-by-case regulator approval';
      case 'EXEMPTION_AVAILABLE':
        return 'base rule with documented exemption';
      case 'NO_VERIFIED_RULE':
        return 'no verified rule';
    }
  }
  return JSON.stringify(payload).slice(0, 80);
}

export default async function RulesPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const user = (await getCurrentUser())!;
  const canView = hasPermission(toActor(user), 'rule:draft') || hasPermission(toActor(user), 'review:decide');
  if (!canView) return <EmptyState title="403" note="Compliance permissions required." />;

  const rules = await prisma.regulatoryRule.findMany({
    include: {
      country: true,
      currentVersion: true,
      versions: { orderBy: { version: 'desc' }, take: 10 },
    },
    orderBy: [{ countryId: 'asc' }, { ruleType: 'asc' }],
    take: 300,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('compliance.rulesTitle')}</h1>

      <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
        {t('compliance.rulesNote')}
      </div>

      <Card>
        <CardContent className="p-0">
          {rules.length === 0 ? (
            <div className="p-6">
              <EmptyState title={t('compliance.emptyRules')} />
            </div>
          ) : (
            <Table>
              <THead>
                <Tr>
                  <Th>{t('compliance.ruleCountry')}</Th>
                  <Th>{t('compliance.ruleType')}</Th>
                  <Th>{t('common.details')}</Th>
                  <Th>{t('compliance.ruleVersion')}</Th>
                  <Th>{t('compliance.ruleStatus')}</Th>
                  <Th>{t('compliance.ruleConfidence')}</Th>
                  <Th>{t('compliance.ruleSource')}</Th>
                  <Th>{t('compliance.ruleVerifiedAt')}</Th>
                </Tr>
              </THead>
              <TBody>
                {rules.map((r) => (
                  <Tr key={r.id}>
                    <Td className="font-medium">
                      {countryName(r.country, locale)}
                      {r.country.isDemo ? <Badge tone="violet" className="ms-2">DEMO</Badge> : null}
                    </Td>
                    <Td className="text-xs">{r.ruleType.replaceAll('_', ' ')}</Td>
                    <Td className="max-w-64 text-xs">{r.currentVersion ? summarizePayload(r.ruleType, r.currentVersion.payload) : '—'}</Td>
                    <Td className="tabular-nums">v{r.currentVersion?.version ?? '—'}</Td>
                    <Td>
                      {r.currentVersion ? (
                        <Badge tone={toneForStatus(r.currentVersion.status)}>
                          {t(`status.rule.${r.currentVersion.status}`)}
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td className="text-xs">{r.currentVersion?.confidence ?? '—'}</Td>
                    <Td className="max-w-48">
                      {r.currentVersion?.sourceUrl ? (
                        <a
                          href={r.currentVersion.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-xs text-brand-700 hover:underline"
                        >
                          {r.currentVersion.sourceName ?? r.currentVersion.sourceUrl}
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">{r.currentVersion?.sourceName ?? 'SOURCE REQUIRED'}</span>
                      )}
                    </Td>
                    <Td className="text-xs tabular-nums">
                      {r.currentVersion?.lastVerifiedAt ? formatDate(r.currentVersion.lastVerifiedAt, locale) : '—'}
                      {r.versions.length > 1 ? (
                        <span className="mt-1 block space-y-0.5">
                          {r.versions
                            .filter((v) => v.id !== r.currentVersionId)
                            .slice(0, 5)
                            .map((v) => (
                              <span key={v.id} className="block text-[10px] text-slate-400">
                                v{v.version} · {t(`status.rule.${v.status}`)}
                              </span>
                            ))}
                        </span>
                      ) : null}
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
