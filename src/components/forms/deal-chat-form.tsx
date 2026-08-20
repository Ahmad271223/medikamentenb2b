'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { apiPost } from '@/lib/client/api';
import { Button } from '@/components/ui/button';
import { FieldError, Input } from '@/components/ui/input';

export function DealChatForm({ transactionId }: { transactionId: string }) {
  const t = useTranslations('chat');
  const router = useRouter();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    const res = await apiPost(`/api/v1/transactions/${transactionId}/messages`, { body: body.trim() });
    setBusy(false);
    if (res.ok) {
      setBody('');
      router.refresh();
      return;
    }
    setError(res.error.message);
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t('placeholder')}
        maxLength={4000}
        className="flex-1"
      />
      <Button type="submit" disabled={busy || !body.trim()}>
        {t('send')}
      </Button>
      <FieldError>{error}</FieldError>
    </form>
  );
}
