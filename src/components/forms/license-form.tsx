'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { apiPost } from '@/lib/client/api';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label, Select } from '@/components/ui/input';
import type { CountryOption } from './register-form';

const LICENSE_TYPES = ['WDA', 'GDP', 'GMP', 'MANUFACTURING', 'IMPORT', 'WHOLESALE', 'HOSPITAL', 'PHARMACY', 'OTHER'] as const;

export function LicenseForm({ countries }: { countries: CountryOption[] }) {
  const t = useTranslations('licenses');
  const tc = useTranslations('common');
  const router = useRouter();
  const [form, setForm] = useState({
    type: 'WDA',
    number: '',
    issuingAuthority: '',
    countryId: countries[0]?.id ?? 'DE',
    issueDate: '',
    expiryDate: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiPost('/api/v1/licenses', {
      ...form,
      issueDate: form.issueDate || undefined,
    });
    setBusy(false);
    if (res.ok) {
      setForm((f) => ({ ...f, number: '', issuingAuthority: '', issueDate: '', expiryDate: '' }));
      router.refresh();
      return;
    }
    setError(res.error.message);
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <div>
        <Label>{t('typeLabel')}</Label>
        <Select value={form.type} onChange={set('type')}>
          {LICENSE_TYPES.map((lt) => (
            <option key={lt} value={lt}>
              {t(`type${lt}`)}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>{t('number')}</Label>
        <Input required value={form.number} onChange={set('number')} />
      </div>
      <div>
        <Label>{t('authority')}</Label>
        <Input required value={form.issuingAuthority} onChange={set('issuingAuthority')} />
      </div>
      <div>
        <Label>{tc('country')}</Label>
        <Select value={form.countryId} onChange={set('countryId')}>
          {countries.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>{t('issueDate')}</Label>
        <Input type="date" value={form.issueDate} onChange={set('issueDate')} />
      </div>
      <div>
        <Label>{t('expiryDate')}</Label>
        <Input type="date" required value={form.expiryDate} onChange={set('expiryDate')} />
      </div>
      <div className="sm:col-span-2">
        <FieldError>{error}</FieldError>
        <Button type="submit" disabled={busy}>
          {busy ? tc('loading') : t('add')}
        </Button>
      </div>
    </form>
  );
}
