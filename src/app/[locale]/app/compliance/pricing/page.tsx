import { getLocale, getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, toActor } from '@/lib/auth/current';
import { hasPermission } from '@/lib/authz/permissions';
import { countryName } from '@/lib/country-name';
import { formatDate, formatMoney } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/kpi';
import { PricingReferenceForm } from '@/components/forms/intel-forms';

export const dynamic = 'force-dynamic';

export default async function PricingPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const user = (await getCurrentUser())!;
  if (!hasPermission(toActor(user), 'rule:draft')) return <EmptyState title="403" />;

  const [refs, products, countries] = await Promise.all([
    prisma.pricingReference.findMany({
      include: { product: { select: { inn: true } } },
      orderBy: { asOf: 'desc' },
      take: 100,
    }),
    prisma.product.findMany({ where: { status: 'VERIFIED', deletedAt: null }, orderBy: { inn: 'asc' } }),
    prisma.country.findMany({ orderBy: { id: 'asc' } }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('pricing.title')}</h1>
      <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
        {t('pricing.note')}
      </div>

      <Card>
        <CardContent className="p-0">
          {refs.length === 0 ? (
            <div className="p-6">
              <EmptyState title={t('pricing.empty')} />
            </div>
          ) : (
            <Table>
              <THead>
                <Tr>
                  <Th>{t('inventory.product')}</Th>
                  <Th>{t('common.country')}</Th>
                  <Th>{t('pricing.priceType')}</Th>
                  <Th>{t('pricing.price')}</Th>
                  <Th>{t('pricing.asOf')}</Th>
                  <Th>{t('pricing.source')}</Th>
                  <Th>{t('compliance.ruleConfidence')}</Th>
                </Tr>
              </THead>
              <TBody>
                {refs.map((r) => (
                  <Tr key={r.id}>
                    <Td className="font-medium">{r.product.inn}</Td>
                    <Td>{r.countryId ?? '—'}</Td>
                    <Td className="text-xs">{r.priceType}</Td>
                    <Td className="tabular-nums">{formatMoney(r.price.toString(), r.currency, locale)}</Td>
                    <Td className="tabular-nums">{formatDate(r.asOf, locale)}</Td>
                    <Td className="max-w-48">
                      {r.sourceUrl ? (
                        <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="block truncate text-xs text-brand-700 hover:underline">
                          {r.sourceName}
                        </a>
                      ) : (
                        <span className="text-xs">{r.sourceName}</span>
                      )}
                    </Td>
                    <Td className="text-xs">{r.confidence}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('pricing.add')}</CardTitle>
        </CardHeader>
        <CardContent>
          <PricingReferenceForm
            products={products.map((p) => ({ id: p.id, label: `${p.inn} · ${p.dosageForm}` }))}
            countries={countries.map((c) => ({ id: c.id, name: `${countryName(c, locale)} (${c.id})` }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
