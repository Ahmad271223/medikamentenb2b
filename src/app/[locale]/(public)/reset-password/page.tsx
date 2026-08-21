import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResetPasswordForm } from '@/components/forms/password-reset-forms';

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations('auth');
  const params = await searchParams;
  const token = typeof params.token === 'string' ? params.token : '';

  return (
    <div className="mx-auto w-full max-w-md px-4 py-20">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('resetTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {token ? <ResetPasswordForm token={token} /> : <p className="text-sm text-red-600">{t('errorResetInvalid')}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
