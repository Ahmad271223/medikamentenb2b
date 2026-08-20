'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { apiPost } from '@/lib/client/api';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label } from '@/components/ui/input';

export interface RecallBatchOption {
  id: string;
  label: string;
}

export function RecallForm({ batches }: { batches: RecallBatchOption[] }) {
  const t = useTranslations('recalls');
  const tc = useTranslations('common');
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [scope, setScope] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const res = await apiPost<{ recalledBatches: number; blockedListings: number; frozenTransactions: number }>(
      '/api/v1/recalls',
      { batchIds: selected, scope, sourceName: sourceName || undefined },
    );
    setBusy(false);
    if (res.ok) {
      setInfo(
        t('created', {
          batches: res.data.recalledBatches,
          listings: res.data.blockedListings,
          tx: res.data.frozenTransactions,
        }),
      );
      setSelected([]);
      setScope('');
      router.refresh();
      return;
    }
    setError(res.error.message);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <Label>{t('batches')}</Label>
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-3">
          {batches.map((b) => (
            <label key={b.id} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={selected.includes(b.id)}
                onChange={(e) =>
                  setSelected((prev) => (e.target.checked ? [...prev, b.id] : prev.filter((id) => id !== b.id)))
                }
                className="h-4 w-4 rounded border-slate-300"
              />
              <span className="font-mono text-xs">{b.label}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>{t('scope')}</Label>
          <Input required minLength={3} value={scope} onChange={(e) => setScope(e.target.value)} />
        </div>
        <div>
          <Label>{t('source')}</Label>
          <Input value={sourceName} onChange={(e) => setSourceName(e.target.value)} />
        </div>
      </div>
      <FieldError>{error}</FieldError>
      {info ? <p className="text-sm text-emerald-700">{info}</p> : null}
      <Button type="submit" variant="danger" disabled={busy || selected.length === 0}>
        {busy ? tc('loading') : t('create')}
      </Button>
    </form>
  );
}
