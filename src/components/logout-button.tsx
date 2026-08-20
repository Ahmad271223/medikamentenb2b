'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { apiPost } from '@/lib/client/api';

export function LogoutButton() {
  const t = useTranslations('common');
  const router = useRouter();

  return (
    <button
      className="text-xs font-medium text-slate-500 hover:text-slate-800"
      onClick={async () => {
        await apiPost('/api/v1/auth/logout');
        router.push('/login');
        router.refresh();
      }}
    >
      {t('signOut')}
    </button>
  );
}
