'use client';

// Settings cards for machine access: organization API keys and webhooks.
// Secrets are displayed exactly once after creation.

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { apiPost } from '@/lib/client/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FieldError, Input, Label, Select } from '@/components/ui/input';

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  role: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export function ApiKeysCard({ keys }: { keys: ApiKeyRow[] }) {
  const t = useTranslations('enterprise');
  const tc = useTranslations('common');
  const router = useRouter();
  const [name, setName] = useState('');
  const [role, setRole] = useState('INVENTORY');
  const [created, setCreated] = useState<{ token: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">{t('apiKeysNote')}</p>
      {keys.length > 0 ? (
        <ul className="divide-y divide-slate-100 text-sm">
          {keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <span className="font-medium">{k.name}</span>
                <code className="ms-2 text-xs text-slate-400">pbk_{k.prefix}_…</code>
              </span>
              <span className="flex items-center gap-2">
                <Badge tone="brand">{k.role}</Badge>
                {k.revokedAt ? (
                  <Badge tone="danger">{t('revoked')}</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      await apiPost(`/api/v1/api-keys/${k.id}/revoke`);
                      setBusy(false);
                      router.refresh();
                    }}
                  >
                    {t('revoke')}
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {created ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs font-medium text-emerald-800">{t('tokenOnce')}</p>
          <code className="mt-1 block break-all rounded bg-white p-2 font-mono text-xs">{created.token}</code>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label>{tc('name')}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ERP Sync" />
        </div>
        <div>
          <Label>{t('keyRole')}</Label>
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="INVENTORY">INVENTORY</option>
            <option value="COMMERCIAL">COMMERCIAL</option>
            <option value="VIEWER">VIEWER</option>
          </Select>
        </div>
        <Button
          disabled={busy || name.trim().length < 2}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const res = await apiPost<{ token: string }>('/api/v1/api-keys', { name: name.trim(), role });
            setBusy(false);
            if (res.ok) {
              setCreated(res.data);
              setName('');
              router.refresh();
              return;
            }
            setError(res.error.message);
          }}
        >
          {t('createKey')}
        </Button>
      </div>
      <FieldError>{error}</FieldError>
    </div>
  );
}

export interface WebhookRow {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  deliveries: Array<{ event: string; status: string; responseCode: number | null }>;
}

const ALL_EVENTS = ['offer.received', 'offer.accepted', 'transaction.state_changed', 'shipment.event', 'recall.issued'];

export function WebhooksCard({ endpoints }: { endpoints: WebhookRow[] }) {
  const t = useTranslations('enterprise');
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>(['transaction.state_changed']);
  const [created, setCreated] = useState<{ secret: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">{t('webhooksNote')}</p>
      {endpoints.length > 0 ? (
        <ul className="divide-y divide-slate-100 text-sm">
          {endpoints.map((w) => (
            <li key={w.id} className="space-y-1 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <code className="max-w-96 truncate text-xs">{w.url}</code>
                <span className="flex items-center gap-2">
                  <Badge tone={w.active ? 'success' : 'danger'}>{w.active ? 'AKTIV' : t('revoked')}</Badge>
                  {w.active ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        await apiPost(`/api/v1/webhooks/${w.id}/revoke`);
                        setBusy(false);
                        router.refresh();
                      }}
                    >
                      {t('revoke')}
                    </Button>
                  ) : null}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {w.events.join(', ')}
                {w.deliveries.length > 0
                  ? ` · ${t('lastDeliveries')}: ${w.deliveries.map((d) => `${d.event} ${d.status}${d.responseCode ? ` (${d.responseCode})` : ''}`).join(' · ')}`
                  : ''}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {created ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs font-medium text-emerald-800">{t('secretOnce')}</p>
          <code className="mt-1 block break-all rounded bg-white p-2 font-mono text-xs">{created.secret}</code>
        </div>
      ) : null}

      <div className="space-y-2">
        <div>
          <Label>URL</Label>
          <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://erp.example.eu/webhooks/pharmabridge" />
        </div>
        <div className="flex flex-wrap gap-3">
          {ALL_EVENTS.map((ev) => (
            <label key={ev} className="flex items-center gap-1.5 font-mono text-xs text-slate-600">
              <input
                type="checkbox"
                checked={events.includes(ev)}
                onChange={(e) =>
                  setEvents((prev) => (e.target.checked ? [...prev, ev] : prev.filter((x) => x !== ev)))
                }
                className="h-3.5 w-3.5 rounded border-slate-300"
              />
              {ev}
            </label>
          ))}
        </div>
        <Button
          disabled={busy || !url || events.length === 0}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const res = await apiPost<{ secret: string }>('/api/v1/webhooks', { url, events });
            setBusy(false);
            if (res.ok) {
              setCreated(res.data);
              setUrl('');
              router.refresh();
              return;
            }
            setError(res.error.message);
          }}
        >
          {t('createWebhook')}
        </Button>
        <FieldError>{error}</FieldError>
      </div>
    </div>
  );
}
