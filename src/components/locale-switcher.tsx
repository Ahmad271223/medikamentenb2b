'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

const LOCALE_LABELS: Record<string, string> = { de: 'Deutsch', en: 'English', ar: 'العربية' };

export function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <select
      aria-label="Language"
      className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700"
      value={locale}
      onChange={(e) => router.replace(pathname, { locale: e.target.value as (typeof routing.locales)[number] })}
    >
      {routing.locales.map((l) => (
        <option key={l} value={l}>
          {LOCALE_LABELS[l] ?? l}
        </option>
      ))}
    </select>
  );
}
