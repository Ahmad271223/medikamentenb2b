'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { apiPost } from '@/lib/client/api';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label, Select } from '@/components/ui/input';

export interface OrgOption {
  id: string;
  label: string;
}

export function SanctionsForm({ orgs }: { orgs: OrgOption[] }) {
  const t = useTranslations('sanctions');
  const tc = useTranslations('common');
  const tComp = useTranslations('compliance');
  const router = useRouter();
  const [form, setForm] = useState({ orgId: orgs[0]?.id ?? '', result: 'CLEAR', note: '', expiresAt: '' });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const res = await apiPost<{ reevaluatedListings: number }>('/api/v1/sanctions-checks', {
      orgId: form.orgId,
      result: form.result,
      note: form.note || undefined,
      expiresAt: form.expiresAt || undefined,
    });
    setBusy(false);
    if (res.ok) {
      setInfo(t('recorded', { count: res.data.reevaluatedListings }));
      router.refresh();
      return;
    }
    setError(res.error.message);
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-4">
      <div className="sm:col-span-2">
        <Label>{tComp('org')}</Label>
        <Select value={form.orgId} onChange={(e) => setForm((f) => ({ ...f, orgId: e.target.value }))}>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>{t('result')}</Label>
        <Select value={form.result} onChange={(e) => setForm((f) => ({ ...f, result: e.target.value }))}>
          <option value="CLEAR">CLEAR</option>
          <option value="REVIEW">REVIEW</option>
          <option value="BLOCKED">BLOCKED</option>
        </Select>
      </div>
      <div>
        <Label>{t('expires')}</Label>
        <Input type="date" value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} />
      </div>
      <div className="sm:col-span-3">
        <Label>{t('note')}</Label>
        <Input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
      </div>
      <div className="flex items-end">
        <Button type="submit" disabled={busy || !form.orgId}>
          {busy ? tc('loading') : t('record')}
        </Button>
      </div>
      <div className="sm:col-span-4">
        <FieldError>{error}</FieldError>
        {info ? <p className="text-sm text-emerald-700">{info}</p> : null}
      </div>
    </form>
  );
}
