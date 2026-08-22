import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { ShieldCheck, Recycle, BadgeCheck, ScrollText, ArrowRight, Globe2 } from 'lucide-react';

export default async function LandingPage() {
  const t = await getTranslations('landing');

  const pillars = [
    { icon: ShieldCheck, title: t('pillar1Title'), text: t('pillar1Text') },
    { icon: Recycle, title: t('pillar2Title'), text: t('pillar2Text') },
    { icon: BadgeCheck, title: t('pillar3Title'), text: t('pillar3Text') },
    { icon: ScrollText, title: t('pillar4Title'), text: t('pillar4Text') },
  ];

  const steps = [1, 2, 3, 4, 5].map((n) => ({
    n,
    title: t(`step${n}Title` as 'step1Title'),
    text: t(`step${n}Text` as 'step1Text'),
  }));

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-brand-950 text-white">
        <div className="hero-grid absolute inset-0" aria-hidden />
        <div className="absolute -end-40 -top-40 h-96 w-96 rounded-full bg-brand-700/30 blur-3xl" aria-hidden />
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-24 lg:grid-cols-[1.1fr_0.9fr] lg:py-28">
          <div className="animate-fade-up">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand-400/40 bg-brand-900/60 px-3 py-1 text-[11px] font-semibold tracking-[0.14em] text-brand-100 uppercase">
              <Globe2 className="h-3.5 w-3.5" /> B2B · Pharma · Compliance
            </p>
            <h1 className="font-display max-w-2xl text-4xl leading-[1.05] font-bold tracking-tight sm:text-5xl lg:text-6xl">
              {t('heroTitle')}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-brand-100/90">{t('heroSubtitle')}</p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                href="/register"
                data-testid="hero-register-cta"
                className="inline-flex items-center gap-2 rounded-md bg-white px-5 py-3 text-sm font-semibold text-brand-950 shadow-elevated transition-transform duration-150 ease-out hover:-translate-y-0.5"
              >
                {t('ctaRegister')} <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
              </Link>
              <Link
                href="/login"
                data-testid="hero-login-cta"
                className="rounded-md border border-brand-400/40 px-5 py-3 text-sm font-medium text-white transition-colors duration-150 ease-out hover:bg-white/10"
              >
                {t('ctaLogin')}
              </Link>
            </div>
          </div>
          <div className="relative hidden lg:block">
            <div className="animate-fade-up overflow-hidden rounded-2xl border border-white/10 shadow-elevated">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://images.unsplash.com/photo-1581093577421-f561a654a353?crop=entropy&cs=srgb&fm=jpg&q=85&w=900&h=1000&fit=crop"
                alt="Pharmaceutical laboratory"
                className="h-[460px] w-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section className="mx-auto w-full max-w-6xl px-4 py-20">
        <div className="stagger grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map((p) => (
            <div
              key={p.title}
              className="group rounded-lg border border-slate-200 bg-white p-6 shadow-card transition-shadow duration-200 ease-out hover:shadow-elevated"
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                <p.icon className="h-5 w-5" />
              </span>
              <h3 className="font-display mt-4 text-base font-semibold text-slate-900">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{p.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Categories */}
      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-20">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {t('categoriesTitle')}
          </h2>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-8">
              <span className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                {t('surplusTitle')}
              </span>
              <p className="mt-4 text-sm leading-relaxed text-slate-600">{t('surplusText')}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-8">
              <span className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-700">
                {t('shortDatedTitle')}
              </span>
              <p className="mt-4 text-sm leading-relaxed text-slate-600">{t('shortDatedText')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto w-full max-w-6xl px-4 py-20">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{t('howTitle')}</h2>
        <ol className="mt-8 grid gap-6 md:grid-cols-5">
          {steps.map((s) => (
            <li key={s.n} className="relative rounded-lg border border-slate-200 bg-white p-5 shadow-card">
              <span className="font-display flex h-8 w-8 items-center justify-center rounded-full bg-brand-800 text-sm font-semibold text-white">
                {s.n}
              </span>
              <h3 className="font-display mt-3 text-sm font-semibold text-slate-900">{s.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Audiences */}
      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-20 md:grid-cols-2">
          {(
            [
              ['sellersTitle', ['sellers1', 'sellers2', 'sellers3']],
              ['buyersTitle', ['buyers1', 'buyers2', 'buyers3']],
            ] as const
          ).map(([titleKey, items]) => (
            <div key={titleKey} className="rounded-lg border border-slate-200 bg-slate-50/60 p-8">
              <h3 className="font-display text-lg font-semibold text-slate-900">{t(titleKey)}</h3>
              <ul className="mt-4 space-y-3">
                {items.map((k) => (
                  <li key={k} className="flex items-start gap-2 text-sm text-slate-600">
                    <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                    {t(k)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Compliance statement */}
      <section className="mx-auto w-full max-w-6xl px-4 py-20">
        <div className="relative overflow-hidden rounded-2xl border border-brand-800 bg-brand-950 p-10 text-white">
          <div className="hero-grid absolute inset-0" aria-hidden />
          <div className="relative">
            <h2 className="font-display text-xl font-semibold text-white sm:text-2xl">{t('complianceTitle')}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-brand-100/90">{t('complianceText')}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
