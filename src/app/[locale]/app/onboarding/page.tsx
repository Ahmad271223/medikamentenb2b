import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/current';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, toneForStatus } from '@/components/ui/badge';
import { SubmitKybButton } from '@/components/forms/submit-kyb-button';
import { CheckCircle2, Circle } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const t = await getTranslations();
  const user = (await getCurrentUser())!;
  if (!user.org) return null;

  const [licenseCount, warehouseCount] = await Promise.all([
    prisma.license.count({ where: { orgId: user.org.id } }),
    prisma.warehouse.count({ where: { orgId: user.org.id, deletedAt: null } }),
  ]);

  // Warehouses matter for the supply side only (shipments originate there);
  // a pure buyer receives at its organization address.
  const needsWarehouse = user.org.kind !== 'BUYER';
  const canSubmit =
    licenseCount > 0 &&
    (!needsWarehouse || warehouseCount > 0) &&
    (user.org.status === 'DRAFT' || user.org.status === 'REJECTED');
  const submitted = user.org.status === 'PENDING_KYB';
  const verified = user.org.status === 'VERIFIED';

  const steps = [
    { label: t('onboarding.stepProfile'), done: true },
    { label: t('onboarding.stepLicense'), done: licenseCount > 0 },
    ...(needsWarehouse ? [{ label: t('onboarding.stepWarehouse'), done: warehouseCount > 0 }] : []),
    { label: t('onboarding.stepSubmit'), done: submitted || verified },
    { label: t('onboarding.stepReview'), done: verified },
  ];

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('onboarding.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('onboarding.subtitle')}</p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{t('onboarding.statusLabel')}</CardTitle>
          <Badge tone={toneForStatus(user.org.status)}>{t(`status.org.${user.org.status}`)}</Badge>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center gap-3 text-sm">
                {s.done ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                ) : (
                  <Circle className="h-5 w-5 shrink-0 text-slate-300" />
                )}
                <span className={s.done ? 'text-slate-800' : 'text-slate-500'}>{s.label}</span>
              </li>
            ))}
          </ol>
          <div className="mt-6">
            {submitted ? (
              <p className="text-sm text-slate-600">{t('onboarding.submitted')}</p>
            ) : verified ? null : (
              <SubmitKybButton disabled={!canSubmit} />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
