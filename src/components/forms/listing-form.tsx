'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { apiPost } from '@/lib/client/api';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label, Select } from '@/components/ui/input';

export interface BatchOption {
  id: string;
  label: string;
  available: number;
}

export interface CountryChoice {
  id: string;
  name: string;
}

export function ListingForm({
  batches,
  destinationCountries,
}: {
  batches: BatchOption[];
  destinationCountries: CountryChoice[];
}) {
  const t = useTranslations('listings');
  const tc = useTranslations('common');
  const router = useRouter();
  const [form, setForm] = useState({
    batchId: batches[0]?.id ?? '',
    quantity: '',
    minOrderQuantity: '1',
    unitPrice: '',
    visibility: 'PUBLIC_VERIFIED',
    anonymousSeller: false,
    negotiable: true,
  });
  const [restrictedCountries, setRestrictedCountries] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = batches.find((b) => b.id === form.batchId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const res = await apiPost<{ status: string }>('/api/v1/listings', {
      batchId: form.batchId,
      quantity: Number(form.quantity),
      minOrderQuantity: Number(form.minOrderQuantity),
      unitPrice: form.unitPrice,
      currency: 'EUR',
      negotiable: form.negotiable,
      visibility: form.visibility,
      restrictedToCountryIds: form.visibility === 'COUNTRY_RESTRICTED' ? restrictedCountries : [],
      anonymousSeller: form.anonymousSeller,
    });
    setBusy(false);
    if (res.ok) {
      setInfo(t('created', { status: res.data.status }));
      setForm((f) => ({ ...f, quantity: '', unitPrice: '' }));
      router.refresh();
      return;
    }
    setError(res.error.message);
  }

  if (batches.length === 0) return null;

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
      <div className="sm:col-span-2">
        <Label>{t('batch')}</Label>
        <Select value={form.batchId} onChange={(e) => setForm((f) => ({ ...f, batchId: e.target.value }))}>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>{t('quantity')}</Label>
        <Input
          type="number"
          min="1"
          max={selected?.available}
          required
          value={form.quantity}
          onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
          placeholder={selected ? String(selected.available) : ''}
        />
      </div>
      <div>
        <Label>{t('minOrder')}</Label>
        <Input
          type="number"
          min="1"
          required
          value={form.minOrderQuantity}
          onChange={(e) => setForm((f) => ({ ...f, minOrderQuantity: e.target.value }))}
        />
      </div>
      <div>
        <Label>{t('price')} (EUR)</Label>
        <Input
          type="text"
          inputMode="decimal"
          pattern="\d{1,12}([.]\d{1,4})?"
          required
          value={form.unitPrice}
          onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))}
          placeholder="4.20"
        />
      </div>
      <div>
        <Label>{t('visibility')}</Label>
        <Select value={form.visibility} onChange={(e) => setForm((f) => ({ ...f, visibility: e.target.value }))}>
          {(['PUBLIC_VERIFIED', 'COUNTRY_RESTRICTED', 'INVITE_ONLY', 'PRIVATE'] as const).map((v) => (
            <option key={v} value={v}>
              {t(`vis${v}`)}
            </option>
          ))}
        </Select>
      </div>
      {form.visibility === 'COUNTRY_RESTRICTED' ? (
        <fieldset className="sm:col-span-3">
          <legend className="mb-1.5 block text-sm font-medium text-slate-700">{t('restrictedCountries')}</legend>
          <div className="flex max-h-40 flex-wrap gap-x-4 gap-y-1.5 overflow-y-auto rounded-md border border-slate-200 p-3">
            {destinationCountries.map((c) => (
              <label key={c.id} className="flex items-center gap-1.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={restrictedCountries.includes(c.id)}
                  onChange={(e) =>
                    setRestrictedCountries((prev) =>
                      e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id),
                    )
                  }
                  className="h-4 w-4 rounded border-slate-300"
                />
                {c.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-3">
        <input
          type="checkbox"
          checked={form.anonymousSeller}
          onChange={(e) => setForm((f) => ({ ...f, anonymousSeller: e.target.checked }))}
          className="h-4 w-4 rounded border-slate-300"
        />
        {t('anonymous')}
      </label>
      <div className="sm:col-span-3">
        <FieldError>{error}</FieldError>
        {info ? <p className="mb-2 text-sm text-emerald-700">{info}</p> : null}
        <Button type="submit" disabled={busy}>
          {busy ? tc('loading') : t('create')}
        </Button>
      </div>
    </form>
  );
}
