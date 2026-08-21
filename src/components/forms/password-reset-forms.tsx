'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { apiPost } from '@/lib/client/api';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label } from '@/components/ui/input';

export function ForgotPasswordForm() {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const locale = useLocale();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiPost('/api/v1/auth/forgot-password', { email, locale });
    setBusy(false);
    if (res.ok) {
      setSent(true);
      return;
    }
    setError(res.error.code === 'RATE_LIMITED' ? t('errorRateLimited') : t('errorGeneric'));
  }

  if (sent) return <p className="text-sm text-emerald-700">{t('forgotSent')}</p>;

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-slate-500">{t('forgotText')}</p>
      <div>
        <Label htmlFor="email">{tc('email')}</Label>
        <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <FieldError>{error}</FieldError>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? tc('loading') : t('forgotTitle')}
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiPost('/api/v1/auth/reset-password', { token, password });
    setBusy(false);
    if (res.ok) {
      setDone(true);
      setTimeout(() => router.push('/login'), 1500);
      return;
    }
    setError(
      res.error.message === 'PASSWORD_POLICY'
        ? t('errorPasswordPolicy')
        : res.error.message === 'RESET_TOKEN_INVALID'
          ? t('errorResetInvalid')
          : t('errorGeneric'),
    );
  }

  if (done) return <p className="text-sm text-emerald-700">{t('resetDone')}</p>;

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label htmlFor="password">{t('newPassword')}</Label>
        <Input
          id="password"
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="mt-1 text-xs text-slate-500">{t('passwordHint')}</p>
      </div>
      <FieldError>{error}</FieldError>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? tc('loading') : t('resetTitle')}
      </Button>
    </form>
  );
}
