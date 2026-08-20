'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { apiPost } from '@/lib/client/api';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label, Select } from '@/components/ui/input';
import type { CountryOption } from './register-form';

const RULE_TYPES = ['SHELF_LIFE', 'IMPORT_LICENSE', 'PRODUCT_REGISTRATION', 'LABELING', 'SERIALIZATION', 'CONTROLLED', 'CUSTOMS', 'OTHER'];
const SHELF_KINDS = ['ABSOLUTE_MONTHS', 'PERCENTAGE_OF_ORIGINAL', 'COMBINED_RULE', 'CASE_BY_CASE', 'EXEMPTION_AVAILABLE_NOTE', 'NO_VERIFIED_RULE'];

export function RuleDraftForm({ countries }: { countries: CountryOption[] }) {
  const t = useTranslations('rulesManage');
  const tc = useTranslations('common');
  const tComp = useTranslations('compliance');
  const router = useRouter();
  const [form, setForm] = useState({
    countryId: countries[0]?.id ?? 'DE',
    ruleType: 'SHELF_LIFE',
    kind: 'ABSOLUTE_MONTHS',
    minMonths: '6',
    minPercent: '60',
    combinator: 'WHICHEVER_GREATER',
    exemptionNote: '',
    permitRequired: true,
    requiredDocs: '',
    jsonPayload: '{}',
    authorityName: '',
    sourceName: '',
    sourceUrl: '',
    confidence: 'MEDIUM',
    notes: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  function buildPayload(): unknown {
    if (form.ruleType === 'SHELF_LIFE') {
      switch (form.kind) {
        case 'ABSOLUTE_MONTHS':
          return { kind: 'ABSOLUTE_MONTHS', minMonths: Number(form.minMonths) };
        case 'PERCENTAGE_OF_ORIGINAL':
          return { kind: 'PERCENTAGE_OF_ORIGINAL', minPercent: Number(form.minPercent) };
        case 'COMBINED_RULE':
          return {
            kind: 'COMBINED_RULE',
            minMonths: Number(form.minMonths),
            minPercent: Number(form.minPercent),
            combinator: form.combinator,
          };
        case 'CASE_BY_CASE':
          return { kind: 'CASE_BY_CASE', note: form.notes || undefined };
        case 'EXEMPTION_AVAILABLE_NOTE':
          return {
            kind: 'EXEMPTION_AVAILABLE',
            base: { kind: 'ABSOLUTE_MONTHS', minMonths: Number(form.minMonths) },
            exemptionNote: form.exemptionNote || 'exemption available',
          };
        default:
          return { kind: 'NO_VERIFIED_RULE' };
      }
    }
    if (form.ruleType === 'IMPORT_LICENSE') {
      return {
        permitRequired: form.permitRequired,
        requiredDocumentCodes: form.requiredDocs
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      };
    }
    try {
      return JSON.parse(form.jsonPayload);
    } catch {
      return null;
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = buildPayload();
    if (payload === null) {
      setError('Invalid JSON payload');
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    const res = await apiPost<{ version: number }>('/api/v1/rules', {
      countryId: form.countryId,
      ruleType: form.ruleType,
      payload,
      authorityName: form.authorityName || undefined,
      sourceName: form.sourceName || undefined,
      sourceUrl: form.sourceUrl || undefined,
      confidence: form.confidence,
      notes: form.notes || undefined,
    });
    setBusy(false);
    if (res.ok) {
      setInfo(t('drafted', { version: res.data.version }));
      router.refresh();
      return;
    }
    setError(res.error.message);
  }

  const showMonths =
    form.ruleType === 'SHELF_LIFE' && ['ABSOLUTE_MONTHS', 'COMBINED_RULE', 'EXEMPTION_AVAILABLE_NOTE'].includes(form.kind);
  const showPercent = form.ruleType === 'SHELF_LIFE' && ['PERCENTAGE_OF_ORIGINAL', 'COMBINED_RULE'].includes(form.kind);

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
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
      <div>
        <Label>{tc('type')}</Label>
        <Select value={form.ruleType} onChange={set('ruleType')}>
          {RULE_TYPES.map((rt) => (
            <option key={rt} value={rt}>
              {rt.replaceAll('_', ' ')}
            </option>
          ))}
        </Select>
      </div>

      {form.ruleType === 'SHELF_LIFE' ? (
        <>
          <div>
            <Label>{t('kind')}</Label>
            <Select value={form.kind} onChange={set('kind')}>
              {SHELF_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k.replaceAll('_', ' ')}
                </option>
              ))}
            </Select>
          </div>
          {showMonths ? (
            <div>
              <Label>{t('minMonths')}</Label>
              <Input type="number" min="1" max="120" value={form.minMonths} onChange={set('minMonths')} />
            </div>
          ) : null}
          {showPercent ? (
            <div>
              <Label>{t('minPercent')}</Label>
              <Input type="number" min="1" max="100" value={form.minPercent} onChange={set('minPercent')} />
            </div>
          ) : null}
          {form.kind === 'COMBINED_RULE' ? (
            <div>
              <Label>{t('combinator')}</Label>
              <Select value={form.combinator} onChange={set('combinator')}>
                <option value="AND">AND</option>
                <option value="OR">OR</option>
                <option value="WHICHEVER_GREATER">WHICHEVER GREATER</option>
              </Select>
            </div>
          ) : null}
          {form.kind === 'EXEMPTION_AVAILABLE_NOTE' ? (
            <div className="sm:col-span-2">
              <Label>{t('notes')}</Label>
              <Input value={form.exemptionNote} onChange={set('exemptionNote')} />
            </div>
          ) : null}
        </>
      ) : form.ruleType === 'IMPORT_LICENSE' ? (
        <>
          <label className="flex items-center gap-2 self-end pb-2.5 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.permitRequired}
              onChange={(e) => setForm((f) => ({ ...f, permitRequired: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300"
            />
            {t('permitRequired')}
          </label>
          <div className="sm:col-span-2">
            <Label>{t('requiredDocs')}</Label>
            <Input value={form.requiredDocs} onChange={set('requiredDocs')} placeholder="CERTIFICATE_OF_ANALYSIS, CERTIFICATE_OF_ORIGIN" />
          </div>
        </>
      ) : (
        <div className="sm:col-span-3">
          <Label>{t('jsonPayload')}</Label>
          <Input value={form.jsonPayload} onChange={set('jsonPayload')} className="font-mono text-xs" />
        </div>
      )}

      <div>
        <Label>{t('authority')}</Label>
        <Input value={form.authorityName} onChange={set('authorityName')} />
      </div>
      <div>
        <Label>{t('source')}</Label>
        <Input value={form.sourceName} onChange={set('sourceName')} />
      </div>
      <div>
        <Label>{t('sourceUrl')}</Label>
        <Input type="url" value={form.sourceUrl} onChange={set('sourceUrl')} placeholder="https://…" />
      </div>
      <div>
        <Label>{tComp('ruleConfidence')}</Label>
        <Select value={form.confidence} onChange={set('confidence')}>
          {['HIGH', 'MEDIUM', 'LOW', 'UNVERIFIED'].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>
      <div className="sm:col-span-2">
        <Label>{t('notes')}</Label>
        <Input value={form.notes} onChange={set('notes')} />
      </div>

      <div className="sm:col-span-3">
        <FieldError>{error}</FieldError>
        {info ? <p className="mb-2 text-sm text-emerald-700">{info}</p> : null}
        <Button type="submit" disabled={busy}>
          {busy ? tc('loading') : t('draft')}
        </Button>
      </div>
    </form>
  );
}
