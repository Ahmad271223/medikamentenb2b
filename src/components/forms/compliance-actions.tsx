'use client';

// Small client actions for the M3 compliance surfaces: publish a rule version,
// switch a country's trade status, recompute readiness, resolve a recall.

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { apiPost } from '@/lib/client/api';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/input';

export function PublishRuleButton({ versionId }: { versionId: string }) {
  const t = useTranslations('rulesManage');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div>
      <Button
        size="sm"
        variant="success"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await apiPost<{ reevaluatedListings: number }>(`/api/v1/rules/versions/${versionId}/publish`);
          setBusy(false);
          if (res.ok) {
            setInfo(t('published', { count: res.data.reevaluatedListings }));
            router.refresh();
            return;
          }
          setError(res.error.message);
        }}
      >
        {t('publish')}
      </Button>
      <FieldError>{error}</FieldError>
      {info ? <p className="mt-1 text-xs text-emerald-700">{info}</p> : null}
    </div>
  );
}

export function TradeStatusButtons({ countryId, current }: { countryId: string; current: string }) {
  const t = useTranslations('countries');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const options: Array<[string, string]> = [
    ['TRADE_ENABLED', t('setEnable')],
    ['RESEARCH_IN_PROGRESS', t('setResearch')],
    ['SUSPENDED', t('setSuspend')],
    ['NOT_TRADE_ENABLED', t('setDisable')],
  ];

  async function change(tradeStatus: string) {
    setBusy(true);
    setError(null);
    const res = await apiPost(`/api/v1/countries/${countryId}/trade-status`, { tradeStatus });
    setBusy(false);
    if (res.ok) {
      router.refresh();
      return;
    }
    setError(res.error.message);
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        {options
          .filter(([value]) => value !== current)
          .map(([value, label]) => (
            <Button key={value} size="sm" variant="secondary" disabled={busy} onClick={() => change(value)}>
              {label}
            </Button>
          ))}
      </div>
      <FieldError>{error}</FieldError>
    </div>
  );
}

export function ReadinessButton({ countryId }: { countryId: string }) {
  const t = useTranslations('countries');
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await apiPost(`/api/v1/countries/${countryId}/readiness`);
        setBusy(false);
        router.refresh();
      }}
    >
      {t('recompute')}
    </Button>
  );
}

export function ResolveRecallButton({ recallId }: { recallId: string }) {
  const t = useTranslations('recalls');
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await apiPost(`/api/v1/recalls/${recallId}/resolve`);
        setBusy(false);
        router.refresh();
      }}
    >
      {t('resolve')}
    </Button>
  );
}
