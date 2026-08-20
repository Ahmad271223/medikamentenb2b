'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { apiPost } from '@/lib/client/api';
import { Button } from '@/components/ui/button';
import { FieldError, Input } from '@/components/ui/input';

export function ReviewDecisionForm({ reviewId }: { reviewId: string }) {
  const t = useTranslations('compliance');
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function decide(decision: 'APPROVED' | 'REJECTED') {
    if (reason.trim().length < 3) {
      setError(t('decideNote'));
      return;
    }
    setBusy(true);
    setError(null);
    const res = await apiPost(`/api/v1/compliance/reviews/${reviewId}/decide`, { decision, reason });
    setBusy(false);
    if (res.ok) {
      router.refresh();
      return;
    }
    setError(res.error.message);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        className="h-8 w-56 text-xs"
        placeholder={t('decideNote')}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <Button size="sm" variant="success" disabled={busy} onClick={() => decide('APPROVED')}>
        {t('approve')}
      </Button>
      <Button size="sm" variant="danger" disabled={busy} onClick={() => decide('REJECTED')}>
        {t('reject')}
      </Button>
      <FieldError>{error}</FieldError>
    </div>
  );
}
