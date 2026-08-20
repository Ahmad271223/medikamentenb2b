import { getLocale, getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, toActor } from '@/lib/auth/current';
import { hasPermission } from '@/lib/authz/permissions';
import { formatDateTime } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/kpi';

export const dynamic = 'force-dynamic';

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations();
  const locale = await getLocale();
  const user = (await getCurrentUser())!;
  if (!hasPermission(toActor(user), 'audit:read-platform')) return <EmptyState title="403" />;

  const params = await searchParams;
  const entityType = typeof params.entityType === 'string' && params.entityType ? params.entityType : undefined;
  const action = typeof params.action === 'string' && params.action ? params.action : undefined;

  const [entries, entityTypes] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        ...(entityType ? { entityType } : {}),
        ...(action ? { action: { contains: action, mode: 'insensitive' } } : {}),
      },
      include: { actorUser: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.auditLog.findMany({ distinct: ['entityType'], select: { entityType: true }, orderBy: { entityType: 'asc' } }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('admin.auditTitle')}</h1>

      <form method="get" className="flex flex-wrap gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <select name="entityType" defaultValue={entityType ?? ''} className="h-10 rounded-md border border-slate-300 px-3 text-sm">
          <option value="">{t('admin.auditEntity')}: {t('marketplace.filterAll')}</option>
          {entityTypes.map((e) => (
            <option key={e.entityType} value={e.entityType}>
              {e.entityType}
            </option>
          ))}
        </select>
        <input
          name="action"
          defaultValue={action ?? ''}
          placeholder={t('admin.auditAction')}
          className="h-10 rounded-md border border-slate-300 px-3 text-sm"
        />
        <button className="h-10 rounded-md bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800">
          {t('marketplace.apply')}
        </button>
      </form>
      <Card>
        <CardContent className="p-0">
          {entries.length === 0 ? (
            <div className="p-6">
              <EmptyState title={t('admin.auditEmpty')} />
            </div>
          ) : (
            <Table>
              <THead>
                <Tr>
                  <Th>{t('admin.auditWhen')}</Th>
                  <Th>{t('admin.auditActor')}</Th>
                  <Th>{t('admin.auditAction')}</Th>
                  <Th>{t('admin.auditEntity')}</Th>
                  <Th>{t('common.details')}</Th>
                </Tr>
              </THead>
              <TBody>
                {entries.map((e) => (
                  <Tr key={e.id}>
                    <Td className="text-xs whitespace-nowrap tabular-nums">{formatDateTime(e.createdAt, locale)}</Td>
                    <Td className="text-xs">
                      {e.actorUser ? `${e.actorUser.firstName} ${e.actorUser.lastName}` : e.actorType}
                    </Td>
                    <Td>
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{e.action}</code>
                    </Td>
                    <Td className="text-xs">
                      {e.entityType}
                      {e.entityId ? <span className="text-slate-400"> · {e.entityId.slice(0, 8)}…</span> : null}
                    </Td>
                    <Td className="max-w-72">
                      {e.newValue ? (
                        <code className="block truncate text-[10px] text-slate-500">{JSON.stringify(e.newValue)}</code>
                      ) : (
                        '—'
                      )}
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
