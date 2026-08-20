'use client';

// Analyst entry forms for sourced intelligence data (pricing references and
// shortage signals). Sources are mandatory — no fabricated market data.

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { apiPost } from '@/lib/client/api';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label, Select } from '@/components/ui/input';
import type { ProductOption } from './batch-form';
import type { CountryOption } from './register-form';

export function PricingReferenceForm({ products, countries }: { products: ProductOption[]; countries: CountryOption[] }) {
  const t = useTranslations('pricing');
  const tc = useTranslations('common');
  const router = useRouter();
  const [form, setForm] = useState({
    productId: products[0]?.id ?? '',
    countryId: '',
    priceType: 'WHOLESALE_REF',
    price: '',
    asOf: '',
    sourceName: '',
    sourceUrl: '',
    confidence: 'MEDIUM',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiPost('/api/v1/pricing-references', {
      productId: form.productId,
      countryId: form.countryId || undefined,
      priceType: form.priceType,
      price: form.price,
      asOf: form.asOf,
      sourceName: form.sourceName,
      sourceUrl: form.sourceUrl || undefined,
      confidence: form.confidence,
    });
    setBusy(false);
    if (res.ok) {
      setForm((f) => ({ ...f, price: '', sourceName: '', sourceUrl: '' }));
      router.refresh();
      return;
    }
    setError(res.error.message);
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-4">
      <div className="sm:col-span-2">
        <Label>{tc('name')}</Label>
        <Select value={form.productId} onChange={set('productId')}>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>{tc('country')}</Label>
        <Select value={form.countryId} onChange={set('countryId')}>
          <option value="">—</option>
          {countries.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>{t('priceType')}</Label>
        <Select value={form.priceType} onChange={set('priceType')}>
          <option value="WHOLESALE_REF">WHOLESALE_REF</option>
          <option value="PROCUREMENT">PROCUREMENT</option>
          <option value="TENDER">TENDER</option>
        </Select>
      </div>
      <div>
        <Label>{t('price')} (EUR)</Label>
        <Input required inputMode="decimal" pattern="\d{1,12}([.]\d{1,4})?" value={form.price} onChange={set('price')} />
      </div>
      <div>
        <Label>{t('asOf')}</Label>
        <Input type="date" required value={form.asOf} onChange={set('asOf')} />
      </div>
      <div>
        <Label>{t('source')}</Label>
        <Input required minLength={3} value={form.sourceName} onChange={set('sourceName')} />
      </div>
      <div>
        <Label>{t('sourceUrl')}</Label>
        <Input type="url" value={form.sourceUrl} onChange={set('sourceUrl')} />
      </div>
      <div className="sm:col-span-4">
        <FieldError>{error}</FieldError>
        <Button type="submit" disabled={busy}>
          {busy ? tc('loading') : t('add')}
        </Button>
      </div>
    </form>
  );
}

export function ShortageSignalForm({ products, countries }: { products: ProductOption[]; countries: CountryOption[] }) {
  const t = useTranslations('shortages');
  const tc = useTranslations('common');
  const tp = useTranslations('pricing');
  const router = useRouter();
  const [form, setForm] = useState({
    countryId: countries[0]?.id ?? 'DE',
    productId: products[0]?.id ?? '',
    severity: 'UNKNOWN',
    source: '',
    sourceUrl: '',
    reportedAt: '',
    confidence: 'UNVERIFIED',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiPost('/api/v1/shortage-signals', {
      countryId: form.countryId,
      productId: form.productId || undefined,
      severity: form.severity,
      source: form.source,
      sourceUrl: form.sourceUrl || undefined,
      reportedAt: form.reportedAt,
      confidence: form.confidence,
    });
    setBusy(false);
    if (res.ok) {
      setForm((f) => ({ ...f, source: '', sourceUrl: '' }));
      router.refresh();
      return;
    }
    setError(res.error.message);
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-4">
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
      <div className="sm:col-span-2">
        <Label>{tc('name')}</Label>
        <Select value={form.productId} onChange={set('productId')}>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>{t('severity')}</Label>
        <Select value={form.severity} onChange={set('severity')}>
          {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'UNKNOWN'].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>{t('reportedAt')}</Label>
        <Input type="date" required value={form.reportedAt} onChange={set('reportedAt')} />
      </div>
      <div className="sm:col-span-2">
        <Label>{tp('source')}</Label>
        <Input required minLength={3} value={form.source} onChange={set('source')} />
      </div>
      <div>
        <Label>{tp('sourceUrl')}</Label>
        <Input type="url" value={form.sourceUrl} onChange={set('sourceUrl')} />
      </div>
      <div className="sm:col-span-4">
        <FieldError>{error}</FieldError>
        <Button type="submit" disabled={busy}>
          {busy ? tc('loading') : t('add')}
        </Button>
      </div>
    </form>
  );
}
