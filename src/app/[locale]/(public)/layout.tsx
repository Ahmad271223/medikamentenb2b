import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { BRAND } from '@/lib/branding';
import { LocaleSwitcher } from '@/components/locale-switcher';

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations();

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="font-display text-lg font-semibold tracking-tight text-brand-900">{BRAND.name}</span>
            <span className="hidden text-xs text-slate-400 sm:inline">{t('brand.tagline')}</span>
          </Link>
          <nav className="flex items-center gap-3">
            <LocaleSwitcher />
            <Link href="/login" className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900">
              {t('common.signIn')}
            </Link>
            <Link
              href="/register"
              className="rounded-md bg-brand-800 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700"
            >
              {t('common.register')}
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto w-full max-w-6xl px-4 py-8">
          <p className="text-xs leading-relaxed text-slate-500">{t('common.legalDisclaimer')}</p>
          <p className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-400">
            <span>
              © 2026 {BRAND.name} {BRAND.legalSuffix}
            </span>
            <Link href="/privacy" className="hover:text-slate-600 hover:underline">
              {t('legal.privacyTitle')}
            </Link>
            <Link href="/imprint" className="hover:text-slate-600 hover:underline">
              {t('legal.imprintTitle')}
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
