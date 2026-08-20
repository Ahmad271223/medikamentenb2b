import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/current';
import { KpiCard, EmptyState } from '@/components/ui/kpi';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const t = await getTranslations('admin');
  const user = (await getCurrentUser())!;
  if (user.platformRole !== 'PLATFORM_ADMIN') return <EmptyState title="403" />;

  const [pendingKyb, verifiedOrgs, totalUsers, totalBatches] = await Promise.all([
    prisma.complianceReview.count({ where: { type: 'KYB', status: { in: ['PENDING', 'IN_REVIEW'] } } }),
    prisma.organization.count({ where: { status: 'VERIFIED' } }),
    prisma.user.count({ where: { status: 'ACTIVE' } }),
    prisma.batch.count({ where: { deletedAt: null } }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('title')}</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={t('pendingKyb')} value={pendingKyb} tone={pendingKyb > 0 ? 'warning' : 'default'} />
        <KpiCard label={t('verifiedOrgs')} value={verifiedOrgs} />
        <KpiCard label={t('totalUsers')} value={totalUsers} />
        <KpiCard label={t('totalBatches')} value={totalBatches} />
      </div>
    </div>
  );
}
