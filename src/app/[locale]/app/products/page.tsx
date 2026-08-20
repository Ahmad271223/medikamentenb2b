import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/current';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, toneForStatus } from '@/components/ui/badge';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/kpi';
import { ProductForm } from '@/components/forms/product-form';

export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  const t = await getTranslations();
  const user = (await getCurrentUser())!;
  if (!user.org) return null;

  const products = await prisma.product.findMany({
    where: {
      deletedAt: null,
      ...(user.platformRole ? {} : { OR: [{ status: 'VERIFIED' }, { proposedByOrgId: user.org.id }] }),
    },
    orderBy: { inn: 'asc' },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('products.title')}</h1>

      <Card>
        <CardContent className="p-0">
          {products.length === 0 ? (
            <div className="p-6">
              <EmptyState title={t('products.empty')} />
            </div>
          ) : (
            <Table>
              <THead>
                <Tr>
                  <Th>{t('products.inn')}</Th>
                  <Th>{t('products.brand')}</Th>
                  <Th>{t('products.atc')}</Th>
                  <Th>{t('products.strength')}</Th>
                  <Th>{t('products.form')}</Th>
                  <Th>{t('products.coldChain')}</Th>
                  <Th>{t('common.status')}</Th>
                </Tr>
              </THead>
              <TBody>
                {products.map((p) => (
                  <Tr key={p.id}>
                    <Td className="font-medium">
                      {p.inn}
                      {p.isDemo ? <Badge tone="violet" className="ms-2">DEMO</Badge> : null}
                    </Td>
                    <Td>{p.brandName ?? '—'}</Td>
                    <Td className="font-mono text-xs">{p.atcCode ?? '—'}</Td>
                    <Td className="tabular-nums">
                      {p.strengthValue ? `${p.strengthValue.toString()} ${p.strengthUnit ?? ''}` : '—'}
                    </Td>
                    <Td>{p.dosageForm}</Td>
                    <Td>{p.coldChain ? t('common.yes') : t('common.no')}</Td>
                    <Td>
                      <Badge tone={toneForStatus(p.status)}>
                        {p.status === 'VERIFIED'
                          ? t('status.quality.VERIFIED')
                          : p.status === 'PENDING_REVIEW'
                            ? t('status.review.PENDING')
                            : p.status}
                      </Badge>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('products.add')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ProductForm />
        </CardContent>
      </Card>
    </div>
  );
}
