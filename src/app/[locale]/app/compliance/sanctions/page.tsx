import { getLocale, getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, toActor } from '@/lib/auth/current';
import { hasPermission } from '@/lib/authz/permissions';
import { formatDateTime } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, toneForStatus } from '@/components/ui/badge';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/kpi';
import { SanctionsForm } from '@/components/forms/sanctions-form';

export const dynamic = 'force-dynamic';

export default async function SanctionsPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const user = (await getCurrentUser())!;
  if (!hasPermission(toActor(user), 'review:decide')) return <EmptyState title="403" />;

  const orgs = await prisma.organization.findMany({
    where: { deletedAt: null },
    orderBy: { legalName: 'asc' },
    take: 200,
  });
  const latestChecks = await prisma.sanctionsCheck.findMany({
    where: { subjectType: 'ORGANIZATION' },
    orderBy: { checkedAt: 'desc' },
    distinct: ['subjectId'],
  });
  const latestByOrg = new Map(latestChecks.map((c) => [c.subjectId, c]));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('sanctions.title')}</h1>
      <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
        {t('sanctions.screeningNote')}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <Tr>
                <Th>{t('compliance.org')}</Th>
                <Th>{t('common.country')}</Th>
                <Th>{t('sanctions.result')}</Th>
                <Th>{t('sanctions.latest')}</Th>
                <Th>{t('sanctions.provider')}</Th>
              </Tr>
            </THead>
            <TBody>
              {orgs.map((o) => {
                const latest = latestByOrg.get(o.id);
                return (
                  <Tr key={o.id}>
                    <Td className="font-medium">
                      {o.legalName}
                      {o.isDemo ? <Badge tone="violet" className="ms-2">DEMO</Badge> : null}
                    </Td>
                    <Td>{o.countryId}</Td>
                    <Td>
                      <Badge tone={toneForStatus(o.sanctionsStatus)}>{o.sanctionsStatus}</Badge>
                    </Td>
                    <Td className="text-xs tabular-nums">
                      {latest ? formatDateTime(latest.checkedAt, locale) : '—'}
                    </Td>
                    <Td className="text-xs">{latest?.provider ?? '—'}</Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('sanctions.record')}</CardTitle>
        </CardHeader>
        <CardContent>
          <SanctionsForm orgs={orgs.map((o) => ({ id: o.id, label: `${o.legalName} (${o.countryId})` }))} />
        </CardContent>
      </Card>
    </div>
  );
}
