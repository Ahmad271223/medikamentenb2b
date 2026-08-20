import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { prisma } from '@/lib/db';
import { countryName } from '@/lib/country-name';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RegisterForm } from '@/components/forms/register-form';

export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  const t = await getTranslations('auth');
  const locale = await getLocale();

  const countries = await prisma.country.findMany({ orderBy: { id: 'asc' } });
  const options = countries
    .map((c) => ({ id: c.id, name: `${countryName(c, locale)} (${c.id})` }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('registerTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <RegisterForm countries={options} />
          <p className="mt-4 text-sm text-slate-500">
            {t('haveAccount')}{' '}
            <Link href="/login" className="font-medium text-brand-700 hover:underline">
              {t('loginTitle')}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
