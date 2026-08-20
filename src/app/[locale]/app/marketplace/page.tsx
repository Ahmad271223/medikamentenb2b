import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/current';
import { searchMarketplace } from '@/server/marketplace-service';
import { countryName } from '@/lib/country-name';
import { formatDate, formatMoney, formatNumber } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, toneForStatus } from '@/components/ui/badge';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/kpi';

export const dynamic = 'force-dynamic';

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations();
  const locale = await getLocale();
  const user = (await getCurrentUser())!;
  if (!user.org) return null;

  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q : undefined;
  const listingType =
    params.type === 'SURPLUS' || params.type === 'SHORT_DATED' ? params.type : undefined;
  const maxUnitPrice = typeof params.maxPrice === 'string' && params.maxPrice ? Number(params.maxPrice) : undefined;
  const minShelfMonths = typeof params.minShelf === 'string' && params.minShelf ? Number(params.minShelf) : undefined;

  const result = await searchMarketplace(user.org.id, { q, listingType, maxUnitPrice, minShelfMonths });

  const buyerCountry = result.buyerCountryId
    ? await prisma.country.findUnique({ where: { id: result.buyerCountryId } })
    : null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('marketplace.title')}</h1>

      {result.verifiedRequired ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t('marketplace.verifiedRequired')}
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
            {t('marketplace.yourMarket', {
              country: buyerCountry ? countryName(buyerCountry, locale) : result.buyerCountryId,
            })}
          </div>

          {/* Filters — plain GET form, server-rendered results */}
          <form method="get" className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-5">
            <input
              name="q"
              defaultValue={q ?? ''}
              placeholder={t('marketplace.searchPlaceholder')}
              className="h-10 rounded-md border border-slate-300 px-3 text-sm sm:col-span-2"
            />
            <select name="type" defaultValue={listingType ?? ''} className="h-10 rounded-md border border-slate-300 px-3 text-sm">
              <option value="">{t('marketplace.filterAll')}</option>
              <option value="SURPLUS">{t('landing.surplusTitle')}</option>
              <option value="SHORT_DATED">{t('landing.shortDatedTitle')}</option>
            </select>
            <input
              name="minShelf"
              type="number"
              min="1"
              defaultValue={minShelfMonths ?? ''}
              placeholder={t('marketplace.minShelf')}
              className="h-10 rounded-md border border-slate-300 px-3 text-sm"
            />
            <div className="flex gap-2">
              <input
                name="maxPrice"
                type="number"
                step="0.01"
                min="0"
                defaultValue={maxUnitPrice ?? ''}
                placeholder={t('marketplace.maxPrice')}
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
              />
              <button className="h-10 rounded-md bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800">
                {t('marketplace.apply')}
              </button>
            </div>
          </form>

          <Card>
            <CardContent className="p-0">
              {result.items.length === 0 ? (
                <div className="p-6">
                  <EmptyState title={t('marketplace.empty')} />
                </div>
              ) : (
                <Table>
                  <THead>
                    <Tr>
                      <Th>{t('inventory.product')}</Th>
                      <Th>{t('marketplace.origin')}</Th>
                      <Th>{t('inventory.expiry')}</Th>
                      <Th>{t('marketplace.arrivalShelf')}</Th>
                      <Th>{t('marketplace.available')}</Th>
                      <Th>{t('common.price')}</Th>
                      <Th>{t('common.status')}</Th>
                      <Th />
                    </Tr>
                  </THead>
                  <TBody>
                    {result.items.map((item) => (
                      <Tr key={item.id}>
                        <Td>
                          <span className="font-medium">
                            {item.product.inn}
                            {item.product.strengthValue ? ` ${item.product.strengthValue}${item.product.strengthUnit ?? ''}` : ''}
                          </span>
                          <span className="block text-xs text-slate-500">
                            {item.product.dosageForm}
                            {item.product.atcCode ? ` · ${item.product.atcCode}` : ''}
                            {item.isDemo ? ' · DEMO' : ''}
                          </span>
                        </Td>
                        <Td>{item.originCountryId}</Td>
                        <Td className="tabular-nums">{formatDate(item.expiryDate, locale)}</Td>
                        <Td className="tabular-nums">
                          {item.eligibility?.arrivalShelfLifeDays != null
                            ? t('inventory.daysShort', { count: item.eligibility.arrivalShelfLifeDays })
                            : '—'}
                        </Td>
                        <Td className="tabular-nums">{formatNumber(item.quantityAvailable, locale)}</Td>
                        <Td className="tabular-nums">{formatMoney(item.unitPrice, item.currency, locale)}</Td>
                        <Td>
                          {item.eligibility ? (
                            <Badge tone={toneForStatus(item.eligibility.verdict)}>
                              {t(`status.verdict.${item.eligibility.verdict}`)}
                            </Badge>
                          ) : null}
                        </Td>
                        <Td>
                          <Link
                            href={`/app/marketplace/${item.id}`}
                            className="text-sm font-medium text-brand-700 hover:underline"
                          >
                            {t('common.details')} →
                          </Link>
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
