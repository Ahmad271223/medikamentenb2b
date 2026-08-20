'use client';

// Role- and state-aware action panel for the transaction detail page.
// Every button is cosmetic — the API re-checks permissions, party membership
// and state-machine guards server-side.

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { apiPost } from '@/lib/client/api';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label, Select } from '@/components/ui/input';

interface ShipmentInfo {
  id: string;
  status: string;
}

export function TxActions({
  txId,
  state,
  isBuyer,
  isSeller,
  isOfficer,
  shipment,
}: {
  txId: string;
  state: string;
  isBuyer: boolean;
  isSeller: boolean;
  isOfficer: boolean;
  shipment: ShipmentInfo | null;
}) {
  const t = useTranslations('txd');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [docNote, setDocNote] = useState('');
  const [ship, setShip] = useState({ carrier: '', estimatedArrival: '', pickupDate: '', trackingNumber: '' });
  const [milestone, setMilestone] = useState('CUSTOMS_IN');
  const [tempC, setTempC] = useState('');

  async function call(path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    const res = await apiPost(path, body);
    setBusy(false);
    if (res.ok) {
      router.refresh();
      return;
    }
    setError(res.error.message);
  }

  const canRequestDocs = isOfficer && state === 'COMPLIANCE_REVIEW';
  const canResubmit = (isSeller || isBuyer) && state === 'DOCUMENTS_REQUIRED';
  const canAuthorize = isBuyer && state === 'READY_FOR_PAYMENT';
  const canBook = isSeller && !shipment && (state === 'PAYMENT_AUTHORIZED' || state === 'READY_FOR_PICKUP');
  const canDispatch = isSeller && shipment?.status === 'BOOKED' && state === 'READY_FOR_PICKUP';
  const canMilestone = (isSeller || isOfficer) && shipment && ['IN_TRANSIT', 'CUSTOMS'].includes(state);
  const canConfirm = isBuyer && state === 'DELIVERED';

  const nothing =
    !canRequestDocs && !canResubmit && !canAuthorize && !canBook && !canDispatch && !canMilestone && !canConfirm;
  if (nothing) return null;

  return (
    <div className="space-y-4">
      {canRequestDocs ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-64 flex-1">
            <Label>{t('requestDocsNote')}</Label>
            <Input value={docNote} onChange={(e) => setDocNote(e.target.value)} />
          </div>
          <Button
            variant="secondary"
            disabled={busy || docNote.trim().length < 3}
            onClick={() => call(`/api/v1/transactions/${txId}/request-documents`, { note: docNote })}
          >
            {t('requestDocs')}
          </Button>
          <p className="w-full text-xs text-slate-500">{t('queueHint')}</p>
        </div>
      ) : null}

      {canResubmit ? (
        <Button disabled={busy} onClick={() => call(`/api/v1/transactions/${txId}/resubmit`)}>
          {t('resubmit')}
        </Button>
      ) : null}

      {canAuthorize ? (
        <div className="space-y-1">
          <Button variant="success" disabled={busy} onClick={() => call(`/api/v1/transactions/${txId}/authorize-payment`)}>
            {t('authorizePayment')}
          </Button>
          <p className="text-xs text-slate-500">{t('paymentDemo')}</p>
        </div>
      ) : null}

      {canBook ? (
        <form
          className="grid gap-3 sm:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            void call('/api/v1/shipments', {
              transactionId: txId,
              carrier: ship.carrier,
              estimatedArrival: ship.estimatedArrival,
              pickupDate: ship.pickupDate || undefined,
              trackingNumber: ship.trackingNumber || undefined,
            });
          }}
        >
          <div>
            <Label>{t('carrier')}</Label>
            <Input required value={ship.carrier} onChange={(e) => setShip((s) => ({ ...s, carrier: e.target.value }))} />
          </div>
          <div>
            <Label>{t('pickupDate')}</Label>
            <Input type="date" value={ship.pickupDate} onChange={(e) => setShip((s) => ({ ...s, pickupDate: e.target.value }))} />
          </div>
          <div>
            <Label>{t('eta')}</Label>
            <Input type="date" required value={ship.estimatedArrival} onChange={(e) => setShip((s) => ({ ...s, estimatedArrival: e.target.value }))} />
          </div>
          <div>
            <Label>{t('tracking')}</Label>
            <Input value={ship.trackingNumber} onChange={(e) => setShip((s) => ({ ...s, trackingNumber: e.target.value }))} />
          </div>
          <div className="sm:col-span-4">
            <Button type="submit" disabled={busy}>
              {t('bookShipment')}
            </Button>
          </div>
        </form>
      ) : null}

      {canDispatch && shipment ? (
        <Button disabled={busy} onClick={() => call(`/api/v1/shipments/${shipment.id}/dispatch`)}>
          {t('dispatch')}
        </Button>
      ) : null}

      {canMilestone && shipment ? (
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label>{t('milestone')}</Label>
            <Select value={milestone} onChange={(e) => setMilestone(e.target.value)}>
              {['PICKED_UP', 'CUSTOMS_IN', 'CUSTOMS_CLEARED', 'DELIVERED', 'EXCEPTION'].map((m) => (
                <option key={m} value={m}>
                  {m.replaceAll('_', ' ')}
                </option>
              ))}
            </Select>
          </div>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => call(`/api/v1/shipments/${shipment.id}/events`, { type: milestone })}
          >
            {t('milestone')}
          </Button>
          <div>
            <Label>{t('tempC')}</Label>
            <Input
              className="w-28"
              type="number"
              step="0.1"
              value={tempC}
              onChange={(e) => setTempC(e.target.value)}
            />
          </div>
          <Button
            variant="ghost"
            disabled={busy || tempC === ''}
            onClick={() => call(`/api/v1/shipments/${shipment.id}/temperature`, { temperatureC: Number(tempC) })}
          >
            {t('temperature')}
          </Button>
        </div>
      ) : null}

      {canConfirm ? (
        <Button variant="success" disabled={busy} onClick={() => call(`/api/v1/transactions/${txId}/confirm-receipt`)}>
          {t('confirmReceipt')}
        </Button>
      ) : null}

      <FieldError>{error}</FieldError>
    </div>
  );
}

export function DocVerifyButtons({ documentId }: { documentId: string }) {
  const t = useTranslations('txd');
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function decide(decision: 'VERIFIED' | 'REJECTED') {
    setBusy(true);
    await apiPost(`/api/v1/documents/${documentId}/verify`, { decision });
    setBusy(false);
    router.refresh();
  }

  return (
    <span className="inline-flex gap-1">
      <Button size="sm" variant="success" disabled={busy} onClick={() => decide('VERIFIED')}>
        {t('verifyDoc')}
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => decide('REJECTED')}>
        {t('rejectDoc')}
      </Button>
    </span>
  );
}
