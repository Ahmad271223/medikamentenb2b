'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { apiPost } from '@/lib/client/api';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label, Select } from '@/components/ui/input';

export interface CountryOption {
  id: string;
  name: string;
}

export function RegisterForm({ countries }: { countries: CountryOption[] }) {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    orgName: '',
    orgKind: 'SELLER',
    countryId: countries[0]?.id ?? 'DE',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiPost('/api/v1/auth/register', { ...form, locale });
    setBusy(false);
    if (res.ok) {
      router.push('/app/onboarding');
      router.refresh();
      return;
    }
    setError(
      res.error.code === 'CONFLICT'
        ? t('errorEmailTaken')
        : res.error.message === 'PASSWORD_POLICY'
          ? t('errorPasswordPolicy')
          : res.error.code === 'RATE_LIMITED'
            ? t('errorRateLimited')
            : t('errorGeneric'),
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="firstName">{t('firstName')}</Label>
          <Input id="firstName" required value={form.firstName} onChange={set('firstName')} />
        </div>
        <div>
          <Label htmlFor="lastName">{t('lastName')}</Label>
          <Input id="lastName" required value={form.lastName} onChange={set('lastName')} />
        </div>
      </div>
      <div>
        <Label htmlFor="orgName">{t('orgName')}</Label>
        <Input id="orgName" required value={form.orgName} onChange={set('orgName')} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="orgKind">{t('orgKind')}</Label>
          <Select id="orgKind" value={form.orgKind} onChange={set('orgKind')}>
            <option value="SELLER">{t('seller')}</option>
            <option value="BUYER">{t('buyer')}</option>
            <option value="HYBRID">{t('hybrid')}</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="countryId">{t('countryLabel')}</Label>
          <Select id="countryId" value={form.countryId} onChange={set('countryId')}>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div>
        <Label htmlFor="email">{tc('email')}</Label>
        <Input id="email" type="email" required autoComplete="email" value={form.email} onChange={set('email')} />
      </div>
      <div>
        <Label htmlFor="password">{tc('password')}</Label>
        <Input
          id="password"
          type="password"
          required
          autoComplete="new-password"
          value={form.password}
          onChange={set('password')}
        />
        <p className="mt-1 text-xs text-slate-500">{t('passwordHint')}</p>
      </div>
      <FieldError>{error}</FieldError>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? tc('loading') : tc('register')}
      </Button>
    </form>
  );
}
