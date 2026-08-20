import { getLocale, getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/current';
import { formatDateTime } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/kpi';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const t = await getTranslations('notifications');
  const locale = await getLocale();
  const user = (await getCurrentUser())!;

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('title')}</h1>
      {notifications.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <Card key={n.id}>
              <CardContent className="flex items-start justify-between gap-4 py-4">
                <div>
                  <p className="text-sm font-medium text-slate-900">{n.title}</p>
                  {n.body ? <p className="mt-1 text-sm text-slate-600">{n.body}</p> : null}
                </div>
                <span className="shrink-0 text-xs tabular-nums text-slate-400">
                  {formatDateTime(n.createdAt, locale)}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
