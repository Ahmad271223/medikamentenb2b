'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { apiPost } from '@/lib/client/api';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label } from '@/components/ui/input';

export function OfferForm({
  listingId,
  minOrder,
  available,
  currency,
  defaultPrice,
}: {
  listingId: string;
  minOrder: number;
  available: number;
  currency: string;
  defaultPrice: string;
}) {
  const t = useTranslations('marketplace');
  const tc = useTranslations('common');
  const router = useRouter();
  const [quantity, setQuantity] = useState(String(minOrder));
  const [unitPrice, setUnitPrice] = useState(defaultPrice);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const res = await apiPost('/api/v1/offers', {
      listingId,
      quantity: Number(quantity),
      unitPrice,
    });
    setBusy(false);
    if (res.ok) {
      setInfo(t('offerSent'));
      router.refresh();
      return;
    }
    setError(res.error.message);
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
      <div>
        <Label>{t('offerQuantity')}</Label>
        <Input
          type="number"
          min={minOrder}
          max={available}
          required
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
        <p className="mt-1 text-xs text-slate-500">
          {t('minOrder')}: {minOrder} · {t('available')}: {available}
        </p>
      </div>
      <div>
        <Label>{t('offerPrice', { currency })}</Label>
        <Input
          type="text"
          inputMode="decimal"
          pattern="\d{1,12}([.]\d{1,4})?"
          required
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
        />
      </div>
      <div className="flex items-end">
        <Button type="submit" disabled={busy}>
          {busy ? tc('loading') : t('makeOffer')}
        </Button>
      </div>
      <div className="sm:col-span-3">
        <FieldError>{error}</FieldError>
        {info ? <p className="text-sm text-emerald-700">{info}</p> : null}
      </div>
    </form>
  );
}
