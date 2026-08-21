import { getLocale, getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/current';
import { formatDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { MfaCard, PrivacyCard } from '@/components/forms/account-security';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const user = (await getCurrentUser())!;

  const [account, members] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { mfaEnabled: true } }),
    user.org
      ? prisma.organizationMember.findMany({
          where: { orgId: user.org.id },
          include: { user: true },
          orderBy: { createdAt: 'asc' },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('settings.title')}</h1>

      {user.org ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.members')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <Tr>
                  <Th>{t('common.name')}</Th>
                  <Th>{t('common.email')}</Th>
                  <Th>{t('settings.role')}</Th>
                  <Th>{t('settings.memberSince')}</Th>
                </Tr>
              </THead>
              <TBody>
                {members.map((m) => (
                  <Tr key={m.id}>
                    <Td className="font-medium">
                      {m.user.firstName} {m.user.lastName}
                    </Td>
                    <Td>{m.user.email}</Td>
                    <Td>
                      <Badge tone="brand">{t(`status.orgRole.${m.role}`)}</Badge>
                    </Td>
                    <Td className="tabular-nums">{formatDate(m.createdAt, locale)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('mfa.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <MfaCard enabled={account.mfaEnabled} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('privacyCtrl.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <PrivacyCard isPlatformAccount={user.platformRole !== null} />
        </CardContent>
      </Card>
    </div>
  );
}
