import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ForgotPasswordForm } from '@/components/forms/password-reset-forms';

export default async function ForgotPasswordPage() {
  const t = await getTranslations('auth');
  return (
    <div className="mx-auto w-full max-w-md px-4 py-20">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('forgotTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ForgotPasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
