import { getLocale, getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/current';
import { getConfig } from '@/lib/config/platform-config';
import { addDaysUtc, diffDaysUtc } from '@/domain/dates';
import { countryName } from '@/lib/country-name';
import { formatDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, toneForStatus } from '@/components/ui/badge';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/kpi';
import { LicenseForm } from '@/components/forms/license-form';

export const dynamic = 'force-dynamic';

export default async function LicensesPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const user = (await getCurrentUser())!;
  if (!user.org) return null;

  const warnDays = await getConfig('license_warning_days');
  const today = new Date();

  const [licenses, countries] = await Promise.all([
    prisma.license.findMany({ where: { orgId: user.org.id }, include: { country: true }, orderBy: { expiryDate: 'asc' } }),
    prisma.country.findMany({ orderBy: { id: 'asc' } }),
  ]);

  const expiringSoon = licenses.filter(
    (l) => l.expiryDate.getTime() <= addDaysUtc(today, warnDays).getTime() && l.status !== 'REJECTED',
  );
  const countryOptions = countries.map((c) => ({ id: c.id, name: `${countryName(c, locale)} (${c.id})` }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('licenses.title')}</h1>

      {expiringSoon.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t('licenses.warnBanner', { count: expiringSoon.length, days: warnDays })}
        </div>
      ) : null}

      <Card>
        <CardContent className="p-0">
          {licenses.length === 0 ? (
            <div className="p-6">
              <EmptyState title={t('licenses.empty')} />
            </div>
          ) : (
            <Table>
              <THead>
                <Tr>
                  <Th>{t('licenses.typeLabel')}</Th>
                  <Th>{t('licenses.number')}</Th>
                  <Th>{t('licenses.authority')}</Th>
                  <Th>{t('common.country')}</Th>
                  <Th>{t('licenses.expiryDate')}</Th>
                  <Th>{t('common.status')}</Th>
                </Tr>
              </THead>
              <TBody>
                {licenses.map((l) => {
                  const days = diffDaysUtc(l.expiryDate, today);
                  return (
                    <Tr key={l.id}>
                      <Td className="font-medium">{t(`licenses.type${l.type}`)}</Td>
                      <Td className="font-mono text-xs">{l.number}</Td>
                      <Td>{l.issuingAuthority}</Td>
                      <Td>{l.countryId}</Td>
                      <Td>
                        <span className="tabular-nums">{formatDate(l.expiryDate, locale)}</span>
                        {days < 0 ? (
                          <span className="ms-2 text-xs font-medium text-red-600">{t('licenses.expired')}</span>
                        ) : days <= warnDays ? (
                          <span className="ms-2 text-xs font-medium text-amber-600">
                            {t('licenses.expiresInDays', { days })}
                          </span>
                        ) : null}
                      </Td>
                      <Td>
                        <Badge tone={toneForStatus(l.status)}>{t(`status.license.${l.status}`)}</Badge>
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('licenses.add')}</CardTitle>
        </CardHeader>
        <CardContent>
          <LicenseForm countries={countryOptions} />
        </CardContent>
      </Card>
    </div>
  );
}
