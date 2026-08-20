import { getLocale, getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, toActor } from '@/lib/auth/current';
import { hasPermission } from '@/lib/authz/permissions';
import { countryName } from '@/lib/country-name';
import { formatDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/kpi';
import { ShortageSignalForm } from '@/components/forms/intel-forms';

export const dynamic = 'force-dynamic';

const SEVERITY_TONE = { LOW: 'neutral', MEDIUM: 'info', HIGH: 'warning', CRITICAL: 'danger', UNKNOWN: 'neutral' } as const;

export default async function ShortagesPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const user = (await getCurrentUser())!;
  if (!hasPermission(toActor(user), 'rule:draft')) return <EmptyState title="403" />;

  const [signals, products, countries] = await Promise.all([
    prisma.shortageSignal.findMany({
      include: { product: { select: { inn: true } }, country: true },
      orderBy: { reportedAt: 'desc' },
      take: 100,
    }),
    prisma.product.findMany({ where: { status: 'VERIFIED', deletedAt: null }, orderBy: { inn: 'asc' } }),
    prisma.country.findMany({ orderBy: { id: 'asc' } }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('shortages.title')}</h1>
      <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
        {t('shortages.note')}
      </div>

      <Card>
        <CardContent className="p-0">
          {signals.length === 0 ? (
            <div className="p-6">
              <EmptyState title={t('shortages.empty')} />
            </div>
          ) : (
            <Table>
              <THead>
                <Tr>
                  <Th>{t('common.country')}</Th>
                  <Th>{t('inventory.product')}</Th>
                  <Th>{t('shortages.severity')}</Th>
                  <Th>{t('shortages.reportedAt')}</Th>
                  <Th>{t('pricing.source')}</Th>
                  <Th>{t('compliance.ruleConfidence')}</Th>
                </Tr>
              </THead>
              <TBody>
                {signals.map((s) => (
                  <Tr key={s.id}>
                    <Td className="font-medium">{countryName(s.country, locale)}</Td>
                    <Td>{s.product?.inn ?? s.productFreeText ?? '—'}</Td>
                    <Td>
                      <Badge tone={SEVERITY_TONE[s.severity]}>{s.severity}</Badge>
                    </Td>
                    <Td className="tabular-nums">{formatDate(s.reportedAt, locale)}</Td>
                    <Td className="max-w-48">
                      {s.sourceUrl ? (
                        <a href={s.sourceUrl} target="_blank" rel="noreferrer" className="block truncate text-xs text-brand-700 hover:underline">
                          {s.source}
                        </a>
                      ) : (
                        <span className="text-xs">{s.source}</span>
                      )}
                    </Td>
                    <Td className="text-xs">{s.confidence}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('shortages.add')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ShortageSignalForm
            products={products.map((p) => ({ id: p.id, label: `${p.inn} · ${p.dosageForm}` }))}
            countries={countries.map((c) => ({ id: c.id, name: `${countryName(c, locale)} (${c.id})` }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
