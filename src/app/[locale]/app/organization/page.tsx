import { getLocale, getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/current';
import { countryName } from '@/lib/country-name';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, toneForStatus } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

export default async function OrganizationPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const user = (await getCurrentUser())!;
  if (!user.org) return null;

  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: user.org.id },
    include: { country: true },
  });

  const rows: Array<[string, React.ReactNode]> = [
    [t('org.legalName'), org.legalName],
    [t('org.tradingName'), org.tradingName ?? '—'],
    [t('org.kind'), t(`org.kind${org.kind}`)],
    [t('common.country'), `${countryName(org.country, locale)} (${org.countryId})`],
    [t('org.regNumber'), org.registrationNumber ?? '—'],
    [t('org.vatNumber'), org.vatNumber ?? '—'],
    [t('org.website'), org.website ?? '—'],
    [t('org.contactEmail'), org.contactEmail ?? '—'],
    [t('org.contactPhone'), org.contactPhone ?? '—'],
  ];

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('org.title')}</h1>
        <Badge tone={toneForStatus(org.status)}>{t(`status.org.${org.status}`)}</Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{org.legalName}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y divide-slate-100">
            {rows.map(([label, value]) => (
              <div key={label} className="grid grid-cols-2 gap-4 py-2.5 text-sm">
                <dt className="text-slate-500">{label}</dt>
                <dd className="text-slate-800">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
