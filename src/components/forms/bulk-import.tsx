'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { apiPost } from '@/lib/client/api';
import { Button } from '@/components/ui/button';
import { FieldError, Label, Select } from '@/components/ui/input';
import type { WarehouseOption } from './batch-form';

interface PreviewResult {
  dryRun: boolean;
  missingHeaders?: string[];
  totalRows?: number;
  valid?: Array<{ line: number; productInn: string; lotNumber: string; expiryDate: string; quantity: number }>;
  errors?: Array<{ line: number; code: string; detail?: string }>;
  imported?: number;
}

export function BulkImport({ warehouses }: { warehouses: WarehouseOption[] }) {
  const t = useTranslations('bulk');
  const tc = useTranslations('common');
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [csvText, setCsvText] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function readFile(): Promise<string | null> {
    const file = fileRef.current?.files?.[0];
    if (!file) return null;
    return file.text();
  }

  async function run(dryRun: boolean) {
    setBusy(true);
    setError(null);
    const csv = csvText ?? (await readFile());
    if (!csv) {
      setBusy(false);
      return;
    }
    setCsvText(csv);
    const res = await apiPost<PreviewResult>('/api/v1/batches/bulk', { csv, dryRun, warehouseId });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setPreview(res.data);
    if (!res.data.dryRun) {
      setCsvText(null);
      if (fileRef.current) fileRef.current.value = '';
      router.refresh();
    }
  }

  const canImport =
    preview?.dryRun === true &&
    (preview.errors?.length ?? 0) === 0 &&
    (preview.missingHeaders?.length ?? 0) === 0 &&
    (preview.valid?.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">{t('hint')}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label>{t('warehouse')}</Label>
          <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label>{t('file')}</Label>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={() => {
              setCsvText(null);
              setPreview(null);
            }}
            className="block w-full text-sm text-slate-600 file:me-3 file:rounded-md file:border-0 file:bg-brand-700 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-800"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={busy || warehouses.length === 0} onClick={() => run(true)}>
          {busy ? tc('loading') : t('preview')}
        </Button>
        <Button disabled={!canImport || busy} onClick={() => run(false)}>
          {t('import')}
        </Button>
      </div>
      <FieldError>{error}</FieldError>

      {preview ? (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
          {preview.imported !== undefined ? (
            <p className="font-medium text-emerald-700">{t('importDone', { count: preview.imported })}</p>
          ) : (
            <>
              {(preview.missingHeaders?.length ?? 0) > 0 ? (
                <p className="font-medium text-red-700">
                  {t('headersMissing', { headers: preview.missingHeaders!.join(', ') })}
                </p>
              ) : (
                <p>
                  {t('totalRows', { count: preview.totalRows ?? 0 })} ·{' '}
                  <span className="font-medium text-emerald-700">{t('validRows', { count: preview.valid?.length ?? 0 })}</span> ·{' '}
                  <span className={(preview.errors?.length ?? 0) > 0 ? 'font-medium text-red-700' : ''}>
                    {t('errorRows', { count: preview.errors?.length ?? 0 })}
                  </span>
                </p>
              )}
              {(preview.errors?.length ?? 0) > 0 ? (
                <div>
                  <p className="mb-1 text-xs text-slate-500">{t('cleanRequired')}</p>
                  <ul className="max-h-48 space-y-0.5 overflow-y-auto font-mono text-xs text-red-700">
                    {preview.errors!.map((e, i) => (
                      <li key={i}>
                        {t('line')} {e.line}: {e.code}
                        {e.detail ? ` (${e.detail})` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
