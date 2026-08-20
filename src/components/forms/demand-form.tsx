'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { apiPost } from '@/lib/client/api';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label, Select } from '@/components/ui/input';
import type { ProductOption } from './batch-form';

export function DemandForm({ products }: { products: ProductOption[] }) {
  const t = useTranslations('demands');
  const tc = useTranslations('common');
  const router = useRouter();
  const [useFreeText, setUseFreeText] = useState(products.length === 0);
  const [form, setForm] = useState({
    productId: products[0]?.id ?? '',
    productFreeText: '',
    quantity: '',
    requiredBy: '',
    maxUnitPrice: '',
    minRemainingShelfLifeMonths: '',
    monthlyConsumptionUnits: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const res = await apiPost<{ matchesCreated: number }>('/api/v1/demands', {
      productId: useFreeText ? undefined : form.productId,
      productFreeText: useFreeText ? form.productFreeText : undefined,
      quantity: Number(form.quantity),
      requiredBy: form.requiredBy || undefined,
      maxUnitPrice: form.maxUnitPrice || undefined,
      minRemainingShelfLifeMonths: form.minRemainingShelfLifeMonths
        ? Number(form.minRemainingShelfLifeMonths)
        : undefined,
      monthlyConsumptionUnits: form.monthlyConsumptionUnits ? Number(form.monthlyConsumptionUnits) : undefined,
    });
    setBusy(false);
    if (res.ok) {
      setInfo(t('createdWithMatches', { count: res.data.matchesCreated }));
      setForm((f) => ({ ...f, quantity: '', maxUnitPrice: '' }));
      router.refresh();
      return;
    }
    setError(res.error.message);
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
      <div className="sm:col-span-2">
        {useFreeText ? (
          <>
            <Label>{t('freeText')}</Label>
            <Input required value={form.productFreeText} onChange={set('productFreeText')} />
            <p className="mt-1 text-xs text-slate-500">{t('freeTextNote')}</p>
          </>
        ) : (
          <>
            <Label>{t('product')}</Label>
            <Select value={form.productId} onChange={set('productId')}>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </>
        )}
        {products.length > 0 ? (
          <button
            type="button"
            className="mt-1 text-xs text-brand-700 hover:underline"
            onClick={() => setUseFreeText((v) => !v)}
          >
            {t('freeTextToggle')}
          </button>
        ) : null}
      </div>
      <div>
        <Label>{t('quantity')}</Label>
        <Input type="number" min="1" required value={form.quantity} onChange={set('quantity')} />
      </div>
      <div>
        <Label>{t('requiredBy')}</Label>
        <Input type="date" value={form.requiredBy} onChange={set('requiredBy')} />
      </div>
      <div>
        <Label>{t('maxPrice')}</Label>
        <Input type="text" inputMode="decimal" pattern="\d{1,12}([.]\d{1,4})?" value={form.maxUnitPrice} onChange={set('maxUnitPrice')} />
      </div>
      <div>
        <Label>{t('minShelf')}</Label>
        <Input type="number" min="1" max="60" value={form.minRemainingShelfLifeMonths} onChange={set('minRemainingShelfLifeMonths')} />
      </div>
      <div>
        <Label>{t('monthly')}</Label>
        <Input type="number" min="1" value={form.monthlyConsumptionUnits} onChange={set('monthlyConsumptionUnits')} />
      </div>
      <div className="sm:col-span-3">
        <FieldError>{error}</FieldError>
        {info ? <p className="mb-2 text-sm text-emerald-700">{info}</p> : null}
        <Button type="submit" disabled={busy}>
          {busy ? tc('loading') : t('add')}
        </Button>
      </div>
    </form>
  );
}
