import { getLocale, getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/current';
import { formatDateTime } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/kpi';
import { PlatformRoleSelect, PlatformUserForm } from '@/components/forms/platform-user-form';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const user = (await getCurrentUser())!;
  if (user.platformRole !== 'PLATFORM_ADMIN') return <EmptyState title="403" />;

  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    include: { memberships: { include: { org: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('admin.usersTitle')}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.createStaffTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <PlatformUserForm />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <Tr>
                <Th>{t('common.name')}</Th>
                <Th>{t('common.email')}</Th>
                <Th>{t('nav.organization')}</Th>
                <Th>{t('admin.platformRole')}</Th>
                <Th>Login</Th>
              </Tr>
            </THead>
            <TBody>
              {users.map((u) => (
                <Tr key={u.id}>
                  <Td className="font-medium">
                    {u.firstName} {u.lastName}
                    {u.status !== 'ACTIVE' ? (
                      <Badge tone="danger" className="ms-2">
                        {u.status}
                      </Badge>
                    ) : null}
                  </Td>
                  <Td>{u.email}</Td>
                  <Td>{u.memberships[0]?.org.legalName ?? '—'}</Td>
                  <Td>
                    {u.memberships.length > 0 ? (
                      <span className="text-xs text-slate-400">{t('admin.orgMemberNoRole')}</span>
                    ) : (
                      <PlatformRoleSelect userId={u.id} current={u.platformRole} />
                    )}
                  </Td>
                  <Td className="text-xs tabular-nums">{formatDateTime(u.lastLoginAt, locale)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
