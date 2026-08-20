'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { apiPost } from '@/lib/client/api';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/input';

export function SubmitKybButton({ disabled }: { disabled?: boolean }) {
  const t = useTranslations('onboarding');
  const tc = useTranslations('common');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div>
      <Button
        disabled={disabled || busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await apiPost('/api/v1/organizations/current/submit-kyb');
          setBusy(false);
          if (res.ok) {
            router.refresh();
            return;
          }
          setError(res.error.message);
        }}
      >
        {busy ? tc('loading') : t('submitKyb')}
      </Button>
      <FieldError>{error}</FieldError>
    </div>
  );
}
