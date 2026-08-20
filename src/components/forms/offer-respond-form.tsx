'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { apiPost } from '@/lib/client/api';
import { Button } from '@/components/ui/button';
import { FieldError, Input } from '@/components/ui/input';

export function OfferRespondForm({
  offerId,
  quantity,
  unitPrice,
}: {
  offerId: string;
  quantity: number;
  unitPrice: string;
}) {
  const t = useTranslations('offers');
  const tc = useTranslations('common');
  const router = useRouter();
  const [showCounter, setShowCounter] = useState(false);
  const [counterQty, setCounterQty] = useState(String(quantity));
  const [counterPrice, setCounterPrice] = useState(unitPrice);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function respond(action: 'ACCEPT' | 'REJECT' | 'COUNTER') {
    setBusy(true);
    setError(null);
    const body =
      action === 'COUNTER'
        ? { action, counter: { quantity: Number(counterQty), unitPrice: counterPrice } }
        : { action };
    const res = await apiPost<{ status: string }>(`/api/v1/offers/${offerId}/respond`, body);
    setBusy(false);
    if (res.ok) {
      if (res.data.status === 'ACCEPTED') setInfo(t('accepted'));
      router.refresh();
      return;
    }
    setError(res.error.message);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="success" disabled={busy} onClick={() => respond('ACCEPT')}>
          {t('accept')}
        </Button>
        <Button size="sm" variant="danger" disabled={busy} onClick={() => respond('REJECT')}>
          {t('reject')}
        </Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => setShowCounter((v) => !v)}>
          {t('counter')}
        </Button>
      </div>
      {showCounter ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="h-8 w-28 text-xs"
            type="number"
            min="1"
            value={counterQty}
            onChange={(e) => setCounterQty(e.target.value)}
            aria-label={t('counterQuantity')}
          />
          <Input
            className="h-8 w-28 text-xs"
            type="text"
            inputMode="decimal"
            value={counterPrice}
            onChange={(e) => setCounterPrice(e.target.value)}
            aria-label={t('counterPrice')}
          />
          <Button size="sm" disabled={busy} onClick={() => respond('COUNTER')}>
            {busy ? tc('loading') : t('send')}
          </Button>
        </div>
      ) : null}
      <FieldError>{error}</FieldError>
      {info ? <p className="text-sm text-emerald-700">{info}</p> : null}
    </div>
  );
}
