import { getTranslations } from 'next-intl/server';
import { ShieldCheck } from 'lucide-react';

export default async function CompliancePage() {
  const t = await getTranslations();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-20">
      <ShieldCheck className="h-10 w-10 text-brand-700" />
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">{t('landing.complianceTitle')}</h1>
      <p className="mt-4 text-base leading-relaxed text-slate-600">{t('landing.complianceText')}</p>
      <div className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-6">
        <p className="text-sm leading-relaxed text-slate-500">{t('common.legalDisclaimer')}</p>
      </div>
    </div>
  );
}
