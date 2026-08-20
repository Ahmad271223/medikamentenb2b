import { getLocale, getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, toActor } from '@/lib/auth/current';
import { hasPermission } from '@/lib/authz/permissions';
import { countryName } from '@/lib/country-name';
import { formatDateTime } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, toneForStatus } from '@/components/ui/badge';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/kpi';
import { RuleDraftForm } from '@/components/forms/rule-draft-form';
import { PublishRuleButton } from '@/components/forms/compliance-actions';

export const dynamic = 'force-dynamic';

export default async function RulesManagePage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const user = (await getCurrentUser())!;
  const actor = toActor(user);
  if (!hasPermission(actor, 'rule:draft')) return <EmptyState title="403" />;
  const canPublish = hasPermission(actor, 'rule:verify-publish');

  const [countries, pending] = await Promise.all([
    prisma.country.findMany({ orderBy: { id: 'asc' } }),
    prisma.regulatoryRuleVersion.findMany({
      where: { status: 'PENDING_VERIFICATION' },
      include: { rule: { include: { country: true } }, createdBy: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('rulesManage.title')}</h1>
      <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
        {t('rulesManage.publishNote')}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('rulesManage.pendingTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {pending.length === 0 ? (
            <div className="p-6">
              <EmptyState title={t('rulesManage.emptyPending')} />
            </div>
          ) : (
            <Table>
              <THead>
                <Tr>
                  <Th>{t('compliance.ruleCountry')}</Th>
                  <Th>{t('compliance.ruleType')}</Th>
                  <Th>{t('compliance.ruleVersion')}</Th>
                  <Th>{t('common.details')}</Th>
                  <Th>{t('compliance.ruleSource')}</Th>
                  <Th>{t('common.date')}</Th>
                  {canPublish ? <Th>{t('common.actions')}</Th> : null}
                </Tr>
              </THead>
              <TBody>
                {pending.map((v) => (
                  <Tr key={v.id}>
                    <Td className="font-medium">{countryName(v.rule.country, locale)}</Td>
                    <Td className="text-xs">{v.rule.ruleType.replaceAll('_', ' ')}</Td>
                    <Td className="tabular-nums">v{v.version}</Td>
                    <Td className="max-w-64">
                      <code className="block truncate text-[11px] text-slate-600">{JSON.stringify(v.payload)}</code>
                    </Td>
                    <Td className="max-w-40 truncate text-xs">{v.sourceName ?? 'SOURCE REQUIRED'}</Td>
                    <Td className="text-xs tabular-nums">{formatDateTime(v.createdAt, locale)}</Td>
                    {canPublish ? (
                      <Td>
                        <PublishRuleButton versionId={v.id} />
                      </Td>
                    ) : null}
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('rulesManage.draftTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <RuleDraftForm
            countries={countries.map((c) => ({ id: c.id, name: `${countryName(c, locale)} (${c.id})` }))}
          />
        </CardContent>
      </Card>

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
        <Badge tone={toneForStatus('PENDING_VERIFICATION')} className="me-2">
          {t('status.rule.PENDING_VERIFICATION')}
        </Badge>
        {t('compliance.rulesNote')}
      </div>
    </div>
  );
}
