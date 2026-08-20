import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginForm } from '@/components/forms/login-form';

export default async function LoginPage() {
  const t = await getTranslations('auth');

  return (
    <div className="mx-auto w-full max-w-md px-4 py-20">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('loginTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <LoginForm />
          <p className="mt-4 text-sm text-slate-500">
            {t('noAccount')}{' '}
            <Link href="/register" className="font-medium text-brand-700 hover:underline">
              {t('registerTitle')}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
