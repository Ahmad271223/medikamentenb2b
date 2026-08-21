'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { apiPost } from '@/lib/client/api';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label } from '@/components/ui/input';

export function LoginForm() {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [mfaNeeded, setMfaNeeded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiPost('/api/v1/auth/login', {
      email,
      password,
      ...(totp ? { totp } : {}),
    });
    setBusy(false);
    if (res.ok) {
      router.push('/app');
      router.refresh();
      return;
    }
    if (res.error.message === 'MFA_REQUIRED') {
      setMfaNeeded(true);
      setError(t('errorMfaRequired'));
      return;
    }
    if (res.error.message === 'MFA_INVALID') {
      setMfaNeeded(true);
      setError(t('errorMfaInvalid'));
      return;
    }
    setError(
      res.error.code === 'RATE_LIMITED'
        ? t('errorRateLimited')
        : res.error.code === 'UNAUTHENTICATED'
          ? t('errorInvalidCredentials')
          : t('errorGeneric'),
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label htmlFor="email">{tc('email')}</Label>
        <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="password">{tc('password')}</Label>
        <Input id="password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {mfaNeeded ? (
        <div>
          <Label htmlFor="totp">{t('mfaCode')}</Label>
          <Input
            id="totp"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            autoComplete="one-time-code"
            value={totp}
            onChange={(e) => setTotp(e.target.value)}
          />
        </div>
      ) : null}
      <FieldError>{error}</FieldError>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? tc('loading') : tc('signIn')}
      </Button>
    </form>
  );
}
