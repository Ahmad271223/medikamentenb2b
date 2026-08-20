'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { apiPost } from '@/lib/client/api';
import { Button } from '@/components/ui/button';
import { FieldError, Label, Select } from '@/components/ui/input';

const DOC_TYPES = [
  'WDA', 'GDP_CERTIFICATE', 'GMP_CERTIFICATE', 'MARKETING_AUTHORIZATION', 'IMPORT_LICENSE',
  'PRODUCT_REGISTRATION', 'BATCH_RELEASE_CERTIFICATE', 'CERTIFICATE_OF_ANALYSIS', 'PROOF_OF_OWNERSHIP',
  'COMMERCIAL_INVOICE', 'PACKING_LIST', 'CERTIFICATE_OF_ORIGIN', 'AIR_WAYBILL', 'TEMPERATURE_RECORD',
  'INSURANCE', 'CUSTOMS_DOCUMENT', 'IMPORT_PERMIT', 'PROOF_OF_DELIVERY', 'OTHER',
];

export function DocumentUploadForm({ maxMb, transactionId }: { maxMb: number; transactionId?: string }) {
  const t = useTranslations('documents');
  const tc = useTranslations('common');
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState('WDA');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set('file', file);
    fd.set('type', type);
    if (transactionId) fd.set('transactionId', transactionId);
    const res = await apiPost('/api/v1/documents', fd);
    setBusy(false);
    if (res.ok) {
      if (fileRef.current) fileRef.current.value = '';
      router.refresh();
      return;
    }
    setError(res.error.message);
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
      <div>
        <Label>{t('docType')}</Label>
        <Select value={type} onChange={(e) => setType(e.target.value)}>
          {DOC_TYPES.map((d) => (
            <option key={d} value={d}>
              {d.replaceAll('_', ' ')}
            </option>
          ))}
        </Select>
      </div>
      <div className="sm:col-span-2">
        <Label>{t('file')}</Label>
        <input
          ref={fileRef}
          type="file"
          required
          accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx,.docx"
          className="block w-full text-sm text-slate-600 file:me-3 file:rounded-md file:border-0 file:bg-brand-700 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-800"
        />
        <p className="mt-1 text-xs text-slate-500">{t('uploadHint', { mb: maxMb })}</p>
      </div>
      <div className="sm:col-span-3">
        <FieldError>{error}</FieldError>
        <Button type="submit" disabled={busy}>
          {busy ? tc('loading') : t('upload')}
        </Button>
      </div>
    </form>
  );
}
