import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/current';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BulkImport } from '@/components/forms/bulk-import';

export const dynamic = 'force-dynamic';

export default async function BulkImportPage() {
  const t = await getTranslations('bulk');
  const user = (await getCurrentUser())!;
  if (!user.org) return null;

  const warehouses = await prisma.warehouse.findMany({
    where: { orgId: user.org.id, deletedAt: null },
    select: { id: true, name: true },
  });

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('title')}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{t('file')}</CardTitle>
        </CardHeader>
        <CardContent>
          <BulkImport warehouses={warehouses} />
        </CardContent>
      </Card>
    </div>
  );
}
