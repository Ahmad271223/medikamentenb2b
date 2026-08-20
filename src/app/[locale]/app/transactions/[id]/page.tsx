import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getCurrentUser, toActor } from '@/lib/auth/current';
import { hasPermission } from '@/lib/authz/permissions';
import { countryName } from '@/lib/country-name';
import { env } from '@/lib/env';
import { formatDate, formatDateTime, formatMoney, formatNumber } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, toneForStatus } from '@/components/ui/badge';
import { TxActions, DocVerifyButtons } from '@/components/forms/tx-actions';
import { DocumentUploadForm } from '@/components/forms/document-upload-form';

export const dynamic = 'force-dynamic';

interface EligibilitySnapshot {
  requiredDocuments?: string[];
  requiredPermits?: string[];
  verdict?: string;
}

export default async function TransactionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations();
  const locale = await getLocale();
  const user = (await getCurrentUser())!;
  const { id } = await params;

  const tx = await prisma.transaction.findUnique({
    where: { id },
    include: {
      listing: { include: { product: true } },
      batch: true,
      sellerOrg: true,
      buyerOrg: true,
      destinationCountry: true,
      stateEvents: { orderBy: { createdAt: 'asc' } },
      shipments: { include: { events: { orderBy: { occurredAt: 'asc' } }, temperatureLogs: { orderBy: { recordedAt: 'desc' }, take: 5 } } },
      payments: true,
      invoices: true,
      payouts: true,
      documents: { where: { deletedAt: null } },
    },
  });
  if (!tx) notFound();

  const actor = toActor(user);
  const isSeller = user.org?.id === tx.sellerOrgId;
  const isBuyer = user.org?.id === tx.buyerOrgId;
  const isOfficer = hasPermission(actor, 'transaction:compliance-approve');
  const isPlatform = hasPermission(actor, 'review:decide');
  if (!isSeller && !isBuyer && !isPlatform) notFound();

  const snapshot = (tx.eligibilitySnapshot ?? {}) as EligibilitySnapshot;
  const requiredDocs = snapshot.requiredDocuments ?? [];
  const batchDocs = await prisma.document.findMany({
    where: { batchId: tx.batchId, deletedAt: null },
  });
  const allDocs = [...tx.documents, ...batchDocs.filter((d) => !tx.documents.some((x) => x.id === d.id))];
  const verifiedTypes = new Set(allDocs.filter((d) => d.status === 'VERIFIED').map((d) => d.type));

  const shipment = tx.shipments[0] ?? null;
  const canVerifyDocs = hasPermission(actor, 'document:verify');

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {tx.listing?.product.inn ?? '—'} · {formatNumber(tx.quantity, locale)} ×{' '}
          {formatMoney(tx.unitPrice.toString(), tx.currency, locale)}
          {tx.isDemo ? <Badge tone="violet" className="ms-2 align-middle">DEMO</Badge> : null}
        </h1>
        <Badge tone={toneForStatus(tx.state)}>{t(`status.tx.${tx.state}`)}</Badge>
      </div>

      <Card>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-slate-500">{t('transactions.counterparty')}</dt>
              <dd className="font-medium">{isSeller ? tx.buyerOrg.legalName : tx.sellerOrg.legalName}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{t('transactions.destination')}</dt>
              <dd className="font-medium">{countryName(tx.destinationCountry, locale)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{t('transactions.subtotal')}</dt>
              <dd className="font-medium tabular-nums">{formatMoney(tx.subtotal?.toString(), tx.currency, locale)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{isSeller ? t('transactions.payout') : t('transactions.landed')}</dt>
              <dd className="font-medium tabular-nums">
                {formatMoney((isSeller ? tx.sellerPayout : tx.buyerLandedCost)?.toString(), tx.currency, locale)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('common.actions')}</CardTitle>
        </CardHeader>
        <CardContent>
          <TxActions
            txId={tx.id}
            state={tx.state}
            isBuyer={isBuyer}
            isSeller={isSeller}
            isOfficer={isOfficer}
            shipment={shipment ? { id: shipment.id, status: shipment.status } : null}
          />
          {tx.state === 'SETTLED' ? (
            <p className="text-sm text-emerald-700">{t('status.tx.SETTLED')} ✓</p>
          ) : null}
        </CardContent>
      </Card>

      {requiredDocs.length > 0 || allDocs.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('txd.requiredDocs')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {requiredDocs.length > 0 ? (
              <ul className="space-y-1.5">
                {requiredDocs.map((code) => (
                  <li key={code} className="flex items-center gap-2 text-sm">
                    <Badge tone={verifiedTypes.has(code) ? 'success' : 'warning'}>
                      {verifiedTypes.has(code) ? t('txd.haveDoc') : t('txd.missingDoc')}
                    </Badge>
                    <span>{code.replaceAll('_', ' ')}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {allDocs.length > 0 ? (
              <ul className="divide-y divide-slate-100 text-sm">
                {allDocs.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <span className="font-medium">{d.type.replaceAll('_', ' ')}</span>
                      <span className="ms-2 text-xs text-slate-400">{d.fileName}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge tone={toneForStatus(d.status)}>{d.status}</Badge>
                      {canVerifyDocs && d.status === 'UPLOADED' ? <DocVerifyButtons documentId={d.id} /> : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {isSeller || isBuyer ? (
              <div className="border-t border-slate-100 pt-3">
                <p className="mb-2 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                  {t('txd.uploadForTx')}
                </p>
                <DocumentUploadForm maxMb={env().MAX_UPLOAD_MB} transactionId={tx.id} />
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {shipment ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t('txd.shipmentTitle')}</CardTitle>
            <Badge tone={toneForStatus(shipment.status)}>{shipment.status}</Badge>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
              <div>
                <dt className="text-slate-500">{t('txd.carrier')}</dt>
                <dd className="font-medium">{shipment.carrier ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t('txd.eta')}</dt>
                <dd className="font-medium tabular-nums">{formatDate(shipment.estimatedArrival, locale)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t('txd.tracking')}</dt>
                <dd className="font-mono text-xs">{shipment.trackingNumber ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t('inventory.remaining')}</dt>
                <dd className="font-medium">{shipment.temperatureMode.replaceAll('_', ' ')}</dd>
              </div>
            </dl>
            {shipment.events.length > 0 ? (
              <ol className="space-y-1">
                {shipment.events.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 text-xs">
                    <span className="tabular-nums text-slate-400">{formatDateTime(e.occurredAt, locale)}</span>
                    <Badge>{e.type.replaceAll('_', ' ')}</Badge>
                    {e.location ? <span className="text-slate-500">{e.location}</span> : null}
                  </li>
                ))}
              </ol>
            ) : null}
            {shipment.temperatureLogs.length > 0 ? (
              <p className="text-xs text-slate-500">
                {t('txd.tempC')}:{' '}
                {shipment.temperatureLogs.map((l) => `${l.temperatureC.toString()}°`).join(' · ')}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {tx.payments.length > 0 || tx.invoices.length > 0 || tx.payouts.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('txd.paymentsTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {tx.payments.map((p) => (
              <p key={p.id} className="flex items-center gap-2">
                <Badge tone={toneForStatus(p.state)}>{p.state}</Badge>
                <span className="tabular-nums">{formatMoney(p.amount.toString(), p.currency, locale)}</span>
                <span className="text-xs text-slate-400">
                  {p.provider} · {p.providerRef}
                </span>
              </p>
            ))}
            {tx.payouts.map((p) => (
              <p key={p.id} className="flex items-center gap-2">
                <Badge tone={toneForStatus(p.state === 'EXECUTED' ? 'SETTLED' : p.state)}>{t('txd.payoutTitle')}: {p.state}</Badge>
                <span className="tabular-nums">{formatMoney(p.amount.toString(), p.currency, locale)}</span>
              </p>
            ))}
            {tx.invoices.length > 0 ? (
              <p className="text-xs text-slate-500">
                {t('txd.invoices')}: {tx.invoices.map((i) => `${i.number} (${i.type})`).join(' · ')}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('transactions.timeline')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-1.5">
            {tx.stateEvents.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="tabular-nums text-slate-400">{formatDateTime(e.createdAt, locale)}</span>
                <Badge tone={toneForStatus(e.toState)}>{t(`status.tx.${e.toState}`)}</Badge>
                <span className="text-slate-500">{e.actorType}</span>
                {e.reason ? <span className="text-slate-600">— {e.reason}</span> : null}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
