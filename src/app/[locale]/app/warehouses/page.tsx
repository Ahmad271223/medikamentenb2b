import { getLocale, getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/current';
import { countryName } from '@/lib/country-name';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/kpi';
import { WarehouseForm } from '@/components/forms/warehouse-form';

export const dynamic = 'force-dynamic';

export default async function WarehousesPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const user = (await getCurrentUser())!;
  if (!user.org) return null;

  const [warehouses, countries] = await Promise.all([
    prisma.warehouse.findMany({ where: { orgId: user.org.id, deletedAt: null }, include: { country: true } }),
    prisma.country.findMany({ orderBy: { id: 'asc' } }),
  ]);
  const countryOptions = countries.map((c) => ({ id: c.id, name: `${countryName(c, locale)} (${c.id})` }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('warehouses.title')}</h1>

      <Card>
        <CardContent className="p-0">
          {warehouses.length === 0 ? (
            <div className="p-6">
              <EmptyState title={t('warehouses.empty')} />
            </div>
          ) : (
            <Table>
              <THead>
                <Tr>
                  <Th>{t('warehouses.name')}</Th>
                  <Th>{t('org.city')}</Th>
                  <Th>{t('common.country')}</Th>
                  <Th>{t('warehouses.capabilities')}</Th>
                </Tr>
              </THead>
              <TBody>
                {warehouses.map((w) => (
                  <Tr key={w.id}>
                    <Td className="font-medium">{w.name}</Td>
                    <Td>{w.city ?? '—'}</Td>
                    <Td>{countryName(w.country, locale)}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1.5">
                        {w.capAmbient ? <Badge>{t('warehouses.ambient')}</Badge> : null}
                        {w.capCold2to8 ? <Badge tone="info">{t('warehouses.cold')}</Badge> : null}
                        {w.capFrozen ? <Badge tone="info">{t('warehouses.frozen')}</Badge> : null}
                        {w.capControlledRoom ? <Badge tone="info">{t('warehouses.crt')}</Badge> : null}
                        {w.gdpCompliant ? <Badge tone="success">{t('warehouses.gdp')}</Badge> : null}
                      </div>
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
          <CardTitle>{t('warehouses.add')}</CardTitle>
        </CardHeader>
        <CardContent>
          <WarehouseForm countries={countryOptions} />
        </CardContent>
      </Card>
    </div>
  );
}
