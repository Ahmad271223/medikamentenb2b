'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { apiPost } from '@/lib/client/api';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label, Select } from '@/components/ui/input';

const ROLES = ['COMPLIANCE_OFFICER', 'REGULATORY_ANALYST', 'PLATFORM_ADMIN'] as const;
type Role = (typeof ROLES)[number];

function roleError(message: string, t: (k: string) => string): string {
  switch (message) {
    case 'EMAIL_TAKEN':
      return t('errorEmailTaken');
    case 'CANNOT_DEMOTE_SELF':
      return t('errorSelfDemote');
    case 'ORG_MEMBER_CANNOT_BE_STAFF':
      return t('errorOrgMember');
    default:
      return message;
  }
}

/** Admin: create a platform staff account. The one-time password is shown exactly once. */
export function PlatformUserForm() {
  const t = useTranslations('admin');
  const ta = useTranslations('auth');
  const tc = useTranslations('common');
  const ts = useTranslations('status.platformRole');
  const router = useRouter();
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '', platformRole: 'COMPLIANCE_OFFICER' as Role, locale: 'de' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ email: string; temporaryPassword: string } | null>(null);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiPost<{ email: string; temporaryPassword: string }>('/api/v1/admin/users', form);
    setBusy(false);
    if (!res.ok) {
      setError(roleError(res.error.message, t));
      return;
    }
    setCreated(res.data);
    setForm({ email: '', firstName: '', lastName: '', platformRole: 'COMPLIANCE_OFFICER', locale: 'de' });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">{t('staffNote')}</p>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" data-testid="platform-user-form">
        <div>
          <Label htmlFor="staff-firstName">{ta('firstName')}</Label>
          <Input id="staff-firstName" required value={form.firstName} onChange={set('firstName')} data-testid="staff-first-name" />
        </div>
        <div>
          <Label htmlFor="staff-lastName">{ta('lastName')}</Label>
          <Input id="staff-lastName" required value={form.lastName} onChange={set('lastName')} data-testid="staff-last-name" />
        </div>
        <div>
          <Label htmlFor="staff-email">{tc('email')}</Label>
          <Input id="staff-email" type="email" required value={form.email} onChange={set('email')} data-testid="staff-email" />
        </div>
        <div>
          <Label htmlFor="staff-role">{t('platformRole')}</Label>
          <Select id="staff-role" value={form.platformRole} onChange={set('platformRole')} data-testid="staff-role">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ts(r)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="staff-locale">{t('staffLocale')}</Label>
          <Select id="staff-locale" value={form.locale} onChange={set('locale')}>
            <option value="de">Deutsch</option>
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </Select>
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={busy} data-testid="staff-create-button">
            {busy ? tc('loading') : t('createStaff')}
          </Button>
        </div>
        <div className="sm:col-span-2">
          <FieldError data-testid="staff-error">{error}</FieldError>
        </div>
      </form>
      {created ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900" data-testid="staff-created">
          <p>{t('staffCreated', { email: created.email })}</p>
          <p className="mt-2 select-all rounded-md border border-emerald-200 bg-white px-3 py-2 font-mono text-base tracking-wide text-slate-900">
            {created.temporaryPassword}
          </p>
          <p className="mt-2 text-xs text-emerald-800">{t('staffPasswordHint')}</p>
        </div>
      ) : null}
    </div>
  );
}

/** Admin: change the platform role of an existing user (server enforces the guards). */
export function PlatformRoleSelect({ userId, current }: { userId: string; current: string | null }) {
  const t = useTranslations('admin');
  const ts = useTranslations('status.platformRole');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function change(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    setBusy(true);
    setError(null);
    const res = await apiPost(`/api/v1/admin/users/${userId}/platform-role`, { platformRole: value || null });
    setBusy(false);
    if (!res.ok) {
      setError(roleError(res.error.message, t));
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-1">
      <Select value={current ?? ''} onChange={change} disabled={busy} className="h-8 w-auto min-w-44 text-xs" data-testid={`platform-role-${userId}`}>
        <option value="">{t('roleNone')}</option>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ts(r)}
          </option>
        ))}
      </Select>
      <FieldError>{error}</FieldError>
    </div>
  );
}
