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

/** Registration needs the platform scope flags on top of the plain option. */
export interface RegisterCountryOption extends CountryOption {
  /** may register as seller (supply side) */
  supply: boolean;
  /** may register as buyer (destination side) */
  destination: boolean;
}

/** Countries a given organization kind may register from — mirrors the server check. */
function countriesFor(kind: string, countries: RegisterCountryOption[]) {
  return countries.filter((c) =>
    kind === 'SELLER' ? c.supply : kind === 'BUYER' ? c.destination : c.supply && c.destination,
  );
}

export function RegisterForm({ countries }: { countries: RegisterCountryOption[] }) {
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
    countryId: countriesFor('SELLER', countries)[0]?.id ?? '',
  });
  const available = countriesFor(form.orgKind, countries);
  const hybridPossible = countries.some((c) => c.supply && c.destination);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  function setKind(e: React.ChangeEvent<HTMLSelectElement>) {
    const orgKind = e.target.value;
    setForm((f) => {
      const next = countriesFor(orgKind, countries);
      const keep = next.some((c) => c.id === f.countryId);
      return { ...f, orgKind, countryId: keep ? f.countryId : (next[0]?.id ?? '') };
    });
  }

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
          : res.error.message === 'COUNTRY_NOT_SUPPORTED'
            ? t('errorCountryNotSupported')
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
          <Select id="orgKind" value={form.orgKind} onChange={setKind}>
            <option value="SELLER">{t('seller')}</option>
            <option value="BUYER">{t('buyer')}</option>
            {hybridPossible ? <option value="HYBRID">{t('hybrid')}</option> : null}
          </Select>
        </div>
        <div>
          <Label htmlFor="countryId">{t('countryLabel')}</Label>
          <Select id="countryId" value={form.countryId} onChange={set('countryId')} disabled={available.length === 0}>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-slate-500">
            {available.length === 0 ? t('noCountries') : t('countryScopeHint')}
          </p>
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
      <Button type="submit" className="w-full" disabled={busy || available.length === 0}>
        {busy ? tc('loading') : tc('register')}
      </Button>
    </form>
  );
}
