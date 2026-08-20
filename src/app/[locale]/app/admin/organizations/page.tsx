import { getLocale, getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/current';
import { countryName } from '@/lib/country-name';
import { formatDate } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, toneForStatus } from '@/components/ui/badge';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/kpi';

export const dynamic = 'force-dynamic';

export default async function AdminOrganizationsPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const user = (await getCurrentUser())!;
  if (user.platformRole !== 'PLATFORM_ADMIN') return <EmptyState title="403" />;

  const orgs = await prisma.organization.findMany({
    include: { country: true, _count: { select: { members: true, batches: true, licenses: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('admin.orgsTitle')}</h1>
      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <Tr>
                <Th>{t('common.name')}</Th>
                <Th>{t('org.kind')}</Th>
                <Th>{t('common.country')}</Th>
                <Th>{t('settings.members')}</Th>
                <Th>{t('nav.licenses')}</Th>
                <Th>{t('common.date')}</Th>
                <Th>{t('common.status')}</Th>
              </Tr>
            </THead>
            <TBody>
              {orgs.map((o) => (
                <Tr key={o.id}>
                  <Td className="font-medium">
                    {o.legalName}
                    {o.isDemo ? <Badge tone="violet" className="ms-2">DEMO</Badge> : null}
                  </Td>
                  <Td>{t(`org.kind${o.kind}`)}</Td>
                  <Td>{countryName(o.country, locale)}</Td>
                  <Td className="tabular-nums">{o._count.members}</Td>
                  <Td className="tabular-nums">{o._count.licenses}</Td>
                  <Td className="tabular-nums">{formatDate(o.createdAt, locale)}</Td>
                  <Td>
                    <Badge tone={toneForStatus(o.status)}>{t(`status.org.${o.status}`)}</Badge>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
