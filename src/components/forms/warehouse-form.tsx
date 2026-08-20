'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { apiPost } from '@/lib/client/api';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label, Select } from '@/components/ui/input';
import type { CountryOption } from './register-form';

export function WarehouseForm({ countries }: { countries: CountryOption[] }) {
  const t = useTranslations('warehouses');
  const tc = useTranslations('common');
  const tOrg = useTranslations('org');
  const router = useRouter();
  const [form, setForm] = useState({ name: '', city: '', countryId: countries[0]?.id ?? 'DE' });
  const [caps, setCaps] = useState({ capAmbient: true, capCold2to8: false, capFrozen: false, capControlledRoom: false, gdpCompliant: false });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiPost('/api/v1/warehouses', { ...form, city: form.city || undefined, ...caps });
    setBusy(false);
    if (res.ok) {
      setForm((f) => ({ ...f, name: '', city: '' }));
      router.refresh();
      return;
    }
    setError(res.error.message);
  }

  const capLabels: Array<[keyof typeof caps, string]> = [
    ['capAmbient', t('ambient')],
    ['capCold2to8', t('cold')],
    ['capFrozen', t('frozen')],
    ['capControlledRoom', t('crt')],
    ['gdpCompliant', t('gdp')],
  ];

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
      <div>
        <Label>{t('name')}</Label>
        <Input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      </div>
      <div>
        <Label>{tc('country')}</Label>
        <Select value={form.countryId} onChange={(e) => setForm((f) => ({ ...f, countryId: e.target.value }))}>
          {countries.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>{tOrg('city')}</Label>
        <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
      </div>
      <fieldset className="sm:col-span-3">
        <legend className="mb-1.5 block text-sm font-medium text-slate-700">{t('capabilities')}</legend>
        <div className="flex flex-wrap gap-4">
          {capLabels.map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={caps[key]}
                onChange={(e) => setCaps((c) => ({ ...c, [key]: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="sm:col-span-3">
        <FieldError>{error}</FieldError>
        <Button type="submit" disabled={busy}>
          {busy ? tc('loading') : t('add')}
        </Button>
      </div>
    </form>
  );
}
