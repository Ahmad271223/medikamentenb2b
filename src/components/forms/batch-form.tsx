'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { apiPost } from '@/lib/client/api';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label, Select } from '@/components/ui/input';

export interface ProductOption {
  id: string;
  label: string;
}
export interface WarehouseOption {
  id: string;
  name: string;
}

export function BatchForm({ products, warehouses }: { products: ProductOption[]; warehouses: WarehouseOption[] }) {
  const t = useTranslations('inventory');
  const tc = useTranslations('common');
  const router = useRouter();
  const [form, setForm] = useState({
    productId: products[0]?.id ?? '',
    warehouseId: warehouses[0]?.id ?? '',
    lotNumber: '',
    manufacturingDate: '',
    expiryDate: '',
    quantity: '',
    temperatureMode: 'AMBIENT',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiPost('/api/v1/batches', {
      productId: form.productId,
      warehouseId: form.warehouseId,
      lotNumber: form.lotNumber,
      manufacturingDate: form.manufacturingDate || undefined,
      expiryDate: form.expiryDate,
      quantity: Number(form.quantity),
      temperatureMode: form.temperatureMode,
    });
    setBusy(false);
    if (res.ok) {
      setForm((f) => ({ ...f, lotNumber: '', manufacturingDate: '', expiryDate: '', quantity: '' }));
      router.refresh();
      return;
    }
    setError(res.error.message);
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
      <div>
        <Label>{t('product')}</Label>
        <Select required value={form.productId} onChange={set('productId')}>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>{t('warehouse')}</Label>
        <Select required value={form.warehouseId} onChange={set('warehouseId')}>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>{t('lot')}</Label>
        <Input required value={form.lotNumber} onChange={set('lotNumber')} />
      </div>
      <div>
        <Label>{t('mfgDate')}</Label>
        <Input type="date" value={form.manufacturingDate} onChange={set('manufacturingDate')} />
      </div>
      <div>
        <Label>{t('expiry')}</Label>
        <Input type="date" required value={form.expiryDate} onChange={set('expiryDate')} />
      </div>
      <div>
        <Label>{t('qty')}</Label>
        <Input type="number" min="1" required value={form.quantity} onChange={set('quantity')} />
      </div>
      <div className="sm:col-span-3">
        <FieldError>{error}</FieldError>
        <Button type="submit" disabled={busy || products.length === 0 || warehouses.length === 0}>
          {busy ? tc('loading') : t('add')}
        </Button>
      </div>
    </form>
  );
}
