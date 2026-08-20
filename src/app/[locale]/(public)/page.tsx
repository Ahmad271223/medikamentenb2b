import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { ShieldCheck, Recycle, BadgeCheck, ScrollText, ArrowRight } from 'lucide-react';

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
      <section className="bg-gradient-to-b from-brand-950 to-brand-900 text-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-24">
          <p className="mb-4 inline-block rounded-full border border-brand-400/40 bg-brand-800/60 px-3 py-1 text-xs font-medium tracking-wider text-brand-100 uppercase">
            B2B · Pharma · Compliance
          </p>
          <h1 className="max-w-3xl text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
            {t('heroTitle')}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-brand-100">{t('heroSubtitle')}</p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-md bg-white px-5 py-3 text-sm font-semibold text-brand-900 hover:bg-brand-50"
            >
              {t('ctaRegister')} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </Link>
            <Link
              href="/login"
              className="rounded-md border border-brand-400/50 px-5 py-3 text-sm font-medium text-white hover:bg-brand-800"
            >
              {t('ctaLogin')}
            </Link>
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section className="mx-auto w-full max-w-6xl px-4 py-20">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map((p) => (
            <div key={p.title} className="rounded-lg border border-slate-200 bg-white p-6">
              <p.icon className="h-6 w-6 text-brand-700" />
              <h3 className="mt-4 text-sm font-semibold text-slate-900">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{p.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Categories */}
      <section className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto w-full max-w-6xl px-4 py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{t('categoriesTitle')}</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-8">
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
                {t('surplusTitle')}
              </span>
              <p className="mt-4 text-sm leading-relaxed text-slate-600">{t('surplusText')}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-8">
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                {t('shortDatedTitle')}
              </span>
              <p className="mt-4 text-sm leading-relaxed text-slate-600">{t('shortDatedText')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto w-full max-w-6xl px-4 py-20">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{t('howTitle')}</h2>
        <ol className="mt-8 grid gap-6 md:grid-cols-5">
          {steps.map((s) => (
            <li key={s.n} className="relative rounded-lg border border-slate-200 bg-white p-5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-700 text-xs font-semibold text-white">
                {s.n}
              </span>
              <h3 className="mt-3 text-sm font-semibold text-slate-900">{s.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Audiences */}
      <section className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-20 md:grid-cols-2">
          {(
            [
              ['sellersTitle', ['sellers1', 'sellers2', 'sellers3']],
              ['buyersTitle', ['buyers1', 'buyers2', 'buyers3']],
            ] as const
          ).map(([titleKey, items]) => (
            <div key={titleKey} className="rounded-lg border border-slate-200 bg-white p-8">
              <h3 className="text-lg font-semibold text-slate-900">{t(titleKey)}</h3>
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
        <div className="rounded-lg border border-brand-200 bg-brand-50 p-8">
          <h2 className="text-lg font-semibold text-brand-900">{t('complianceTitle')}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-brand-900/80">{t('complianceText')}</p>
        </div>
      </section>
    </div>
  );
}
