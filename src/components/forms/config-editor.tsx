'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { FieldError, Input } from '@/components/ui/input';
import type { ApiResult } from '@/lib/client/api';

export interface ConfigRow {
  key: string;
  value: unknown;
  isDefault: boolean;
  defaultValue: unknown;
}

async function patchConfig(key: string, value: unknown): Promise<ApiResult<unknown>> {
  try {
    const res = await fetch('/api/v1/admin/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    });
    return (await res.json()) as ApiResult<unknown>;
  } catch {
    return { ok: false, error: { code: 'NETWORK', message: 'Network error' } };
  }
}

function RowEditor({ row }: { row: ConfigRow }) {
  const t = useTranslations('config');
  const router = useRouter();
  const isBool = typeof row.defaultValue === 'boolean';
  const isArray = Array.isArray(row.defaultValue);
  const [raw, setRaw] = useState(
    isArray ? (row.value as string[]).join(', ') : String(row.value),
  );
  const [checked, setChecked] = useState(Boolean(row.value));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    const value = isBool
      ? checked
      : isArray
        ? raw.split(',').map((s) => s.trim()).filter(Boolean)
        : Number(raw);
    if (!isBool && !isArray && !Number.isFinite(value as number)) {
      setBusy(false);
      setError('NaN');
      return;
    }
    const res = await patchConfig(row.key, value);
    setBusy(false);
    if (res.ok) {
      setSaved(true);
      router.refresh();
      return;
    }
    setError(res.error.message);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 py-3 last:border-0">
      <div className="w-72">
        <code className="text-xs font-medium text-slate-800">{row.key}</code>
        <p className="text-[11px] text-slate-400">
          {t('defaultLabel')}: {Array.isArray(row.defaultValue) ? row.defaultValue.join(', ') : String(row.defaultValue)}
        </p>
      </div>
      {isBool ? (
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
      ) : (
        <Input className="h-8 w-72 text-xs" value={raw} onChange={(e) => setRaw(e.target.value)} />
      )}
      <Button size="sm" variant="secondary" disabled={busy} onClick={save}>
        {t('save')}
      </Button>
      {saved ? <span className="text-xs text-emerald-700">{t('saved')}</span> : null}
      <FieldError>{error}</FieldError>
    </div>
  );
}

export function ConfigEditor({ rows }: { rows: ConfigRow[] }) {
  return (
    <div>
      {rows.map((row) => (
        <RowEditor key={row.key} row={row} />
      ))}
    </div>
  );
}
