import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/current';
import { PLATFORM_DEFAULTS } from '@/lib/config/platform-config';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/kpi';
import { ConfigEditor, type ConfigRow } from '@/components/forms/config-editor';

export const dynamic = 'force-dynamic';

export default async function AdminConfigPage() {
  const t = await getTranslations('config');
  const user = (await getCurrentUser())!;
  if (user.platformRole !== 'PLATFORM_ADMIN') return <EmptyState title="403" />;

  const rows = await prisma.platformConfig.findMany();
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  const merged: ConfigRow[] = Object.entries(PLATFORM_DEFAULTS).map(([key, defaultValue]) => ({
    key,
    value: stored.has(key) ? stored.get(key) : defaultValue,
    isDefault: !stored.has(key),
    defaultValue,
  }));

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('title')}</h1>
      <p className="text-sm text-slate-500">{t('note')}</p>
      <Card>
        <CardContent>
          <ConfigEditor rows={merged} />
        </CardContent>
      </Card>
    </div>
  );
}
