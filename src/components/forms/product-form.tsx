'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { apiPost } from '@/lib/client/api';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label, Select } from '@/components/ui/input';

export function ProductForm() {
  const t = useTranslations('products');
  const tc = useTranslations('common');
  const router = useRouter();
  const [form, setForm] = useState({
    inn: '',
    brandName: '',
    atcCode: '',
    strengthValue: '',
    strengthUnit: 'mg',
    dosageForm: '',
    packSize: '',
    prescriptionStatus: 'RX',
    controlledStatus: 'NONE',
    coldChain: false,
    originalShelfLifeMonths: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiPost('/api/v1/products', {
      inn: form.inn,
      brandName: form.brandName || undefined,
      atcCode: form.atcCode || undefined,
      strengthValue: form.strengthValue ? Number(form.strengthValue) : undefined,
      strengthUnit: form.strengthUnit || undefined,
      dosageForm: form.dosageForm,
      packSize: form.packSize ? Number(form.packSize) : undefined,
      prescriptionStatus: form.prescriptionStatus,
      controlledStatus: form.controlledStatus,
      coldChain: form.coldChain,
      originalShelfLifeMonths: form.originalShelfLifeMonths ? Number(form.originalShelfLifeMonths) : undefined,
    });
    setBusy(false);
    if (res.ok) {
      setForm((f) => ({ ...f, inn: '', brandName: '', atcCode: '', strengthValue: '', dosageForm: '', packSize: '' }));
      router.refresh();
      return;
    }
    setError(res.error.message);
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
      <div>
        <Label>{t('inn')}</Label>
        <Input required value={form.inn} onChange={set('inn')} placeholder="Amoxicillin" />
      </div>
      <div>
        <Label>{t('brand')}</Label>
        <Input value={form.brandName} onChange={set('brandName')} />
      </div>
      <div>
        <Label>{t('atc')}</Label>
        <Input value={form.atcCode} onChange={set('atcCode')} placeholder="J01CA04" />
      </div>
      <div>
        <Label>{t('strength')}</Label>
        <div className="flex gap-2">
          <Input type="number" step="any" min="0" value={form.strengthValue} onChange={set('strengthValue')} />
          <Input className="w-24" value={form.strengthUnit} onChange={set('strengthUnit')} />
        </div>
      </div>
      <div>
        <Label>{t('form')}</Label>
        <Input required value={form.dosageForm} onChange={set('dosageForm')} placeholder="tablet" />
      </div>
      <div>
        <Label>{t('packSize')}</Label>
        <Input type="number" min="1" value={form.packSize} onChange={set('packSize')} />
      </div>
      <div>
        <Label>{t('rx')}</Label>
        <Select value={form.prescriptionStatus} onChange={set('prescriptionStatus')}>
          <option value="RX">Rx</option>
          <option value="OTC">OTC</option>
          <option value="UNKNOWN">{tc('unknown')}</option>
        </Select>
      </div>
      <div>
        <Label>{t('controlled')}</Label>
        <Select value={form.controlledStatus} onChange={set('controlledStatus')}>
          <option value="NONE">—</option>
          <option value="NARCOTIC">Narcotic</option>
          <option value="PSYCHOTROPIC">Psychotropic</option>
          <option value="OTHER_CONTROLLED">Controlled (other)</option>
          <option value="UNKNOWN">{tc('unknown')}</option>
        </Select>
      </div>
      <div>
        <Label>{t('shelfLifeMonths')}</Label>
        <Input type="number" min="1" max="120" value={form.originalShelfLifeMonths} onChange={set('originalShelfLifeMonths')} />
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-3">
        <input
          type="checkbox"
          checked={form.coldChain}
          onChange={(e) => setForm((f) => ({ ...f, coldChain: e.target.checked }))}
          className="h-4 w-4 rounded border-slate-300"
        />
        {t('coldChain')}
      </label>
      <div className="sm:col-span-3">
        <p className="mb-2 text-xs text-slate-500">{t('proposeNote')}</p>
        <FieldError>{error}</FieldError>
        <Button type="submit" disabled={busy}>
          {busy ? tc('loading') : t('add')}
        </Button>
      </div>
    </form>
  );
}
