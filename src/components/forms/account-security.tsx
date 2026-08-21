'use client';

// Settings cards: TOTP-MFA setup and GDPR privacy controls.

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { apiPost } from '@/lib/client/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FieldError, Input, Label } from '@/components/ui/input';

export function MfaCard({ enabled }: { enabled: boolean }) {
  const t = useTranslations('mfa');
  const tc = useTranslations('common');
  const router = useRouter();
  const [setup, setSetup] = useState<{ secret: string; otpauth: string } | null>(null);
  const [code, setCode] = useState('');
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(action: 'setup' | 'verify' | 'disable') {
    setBusy(true);
    setError(null);
    setInfo(null);
    const res = await apiPost<{ secret?: string; otpauth?: string }>('/api/v1/auth/mfa', {
      action,
      ...(action !== 'setup' ? { code } : {}),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    if (action === 'setup') {
      setSetup(res.data as { secret: string; otpauth: string });
      return;
    }
    setInfo(action === 'verify' ? t('enabled') : t('disabled'));
    setSetup(null);
    setCode('');
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Badge tone={enabled ? 'success' : 'neutral'}>{enabled ? t('statusOn') : t('statusOff')}</Badge>
        <p className="text-xs text-slate-500">{t('hint')}</p>
      </div>

      {!enabled && !setup ? (
        <Button variant="secondary" disabled={busy} onClick={() => act('setup')}>
          {t('start')}
        </Button>
      ) : null}

      {setup ? (
        <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-medium text-slate-700">{t('secretLabel')}</p>
          <code className="block break-all rounded bg-white p-2 font-mono text-sm">{setup.secret}</code>
          <p className="break-all text-[11px] text-slate-400">{setup.otpauth}</p>
          <div className="flex items-end gap-2">
            <div>
              <Label>{t('verify')}</Label>
              <Input
                className="w-32"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <Button disabled={busy || code.length !== 6} onClick={() => act('verify')}>
              {busy ? tc('loading') : t('verify')}
            </Button>
          </div>
        </div>
      ) : null}

      {enabled ? (
        <div className="flex items-end gap-2">
          <div>
            <Label>{t('disable')}</Label>
            <Input className="w-32" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <Button variant="ghost" disabled={busy || code.length !== 6} onClick={() => act('disable')}>
            {t('disable')}
          </Button>
        </div>
      ) : null}

      <FieldError>{error}</FieldError>
      {info ? <p className="text-sm text-emerald-700">{info}</p> : null}
    </div>
  );
}

export function PrivacyCard({ isPlatformAccount }: { isPlatformAccount: boolean }) {
  const t = useTranslations('privacyCtrl');
  const tc = useTranslations('common');
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <a href="/api/v1/me/export" className="text-sm font-medium text-brand-700 hover:underline" download>
          ⬇ {t('export')}
        </a>
        <p className="mt-0.5 text-xs text-slate-500">{t('exportNote')}</p>
      </div>

      <div className="border-t border-slate-100 pt-4">
        <p className="text-sm font-semibold text-red-700">{t('deleteTitle')}</p>
        <p className="mt-1 max-w-xl text-xs text-slate-500">{t('deleteNote')}</p>
        {isPlatformAccount ? (
          <p className="mt-2 text-xs text-slate-400">{t('platformNote')}</p>
        ) : (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div>
              <Label>{t('deleteConfirm')}</Label>
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button
              variant="danger"
              disabled={busy || password.length === 0}
              onClick={async () => {
                setBusy(true);
                setError(null);
                const res = await apiPost('/api/v1/me/delete', { password });
                setBusy(false);
                if (res.ok) {
                  router.push('/');
                  router.refresh();
                  return;
                }
                setError(res.error.message);
              }}
            >
              {busy ? tc('loading') : t('deleteButton')}
            </Button>
          </div>
        )}
        <FieldError>{error}</FieldError>
      </div>
    </div>
  );
}
