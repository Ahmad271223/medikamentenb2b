'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { apiPost } from '@/lib/client/api';
import { Button } from '@/components/ui/button';
import { FieldError, Label, Select } from '@/components/ui/input';

interface Option {
  id: string;
  label: string;
}

export function ListingInviteForm({ listings, buyerOrgs }: { listings: Option[]; buyerOrgs: Option[] }) {
  const t = useTranslations('enterprise');
  const tc = useTranslations('common');
  const router = useRouter();
  const [listingId, setListingId] = useState(listings[0]?.id ?? '');
  const [buyerOrgId, setBuyerOrgId] = useState(buyerOrgs[0]?.id ?? '');
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (listings.length === 0 || buyerOrgs.length === 0) return null;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-56">
        <Label>{t('inviteListing')}</Label>
        <Select value={listingId} onChange={(e) => setListingId(e.target.value)}>
          {listings.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="min-w-56">
        <Label>{t('inviteBuyer')}</Label>
        <Select value={buyerOrgId} onChange={(e) => setBuyerOrgId(e.target.value)}>
          {buyerOrgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          setInfo(null);
          const res = await apiPost<{ alreadyInvited: boolean }>(`/api/v1/listings/${listingId}/invite`, { buyerOrgId });
          setBusy(false);
          if (res.ok) {
            setInfo(res.data.alreadyInvited ? t('alreadyInvited') : t('invited'));
            router.refresh();
            return;
          }
          setError(res.error.message);
        }}
      >
        {busy ? tc('loading') : t('invite')}
      </Button>
      {info ? <p className="text-sm text-emerald-700">{info}</p> : null}
      <FieldError>{error}</FieldError>
    </div>
  );
}
