import { defineRouting } from 'next-intl/routing';

// Locale priority per founder requirement: German first, then English, then
// Arabic (RTL). UI Arabic uses Modern Standard Arabic register — an ar-LB
// variant can be layered later without structural changes.
export const routing = defineRouting({
  locales: ['de', 'en', 'ar'],
  defaultLocale: 'de',
});

export type AppLocale = (typeof routing.locales)[number];

export const RTL_LOCALES: ReadonlySet<string> = new Set(['ar']);
