import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getCurrentUser } from '@/lib/auth/current';
import { formatMoney, formatNumber } from '@/lib/utils';
import { diffMonthsUtc } from '@/domain/dates';
import { searchMarketplace, type MarketplaceItem } from '@/server/marketplace-service';
import {
  MED_CATEGORIES,
  MED_CATEGORY_GROUPS,
  QUICK_CATEGORY_KEYS,
  categoriesInGroup,
  categoryByKey,
  categoryForAtc,
} from '@/lib/med-categories';
import { DiscoverSearch } from '@/components/discover-search';
import { Badge, toneForStatus } from '@/components/ui/badge';
import {
  Pill, Bug, ShieldPlus, Droplet, HeartPulse, Droplets, Activity, Wind, Soup, Brain,
  FlaskConical, Sparkles, Eye, Leaf, LayoutGrid, Package, MapPin, Clock, Snowflake, ArrowRight, SlidersHorizontal,
  Biohazard, ShieldAlert, Shield, Syringe, TestTube, Filter, Beaker, CircleDot, Venus, Waves, Bone, Bandage,
  Ribbon, HandHeart, Dna, BrainCircuit, Siren, Ear, Smile, Sun, Utensils, ScanLine,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

type SP = Record<string, string | string[] | undefined>;
type Sort = 'newest' | 'price_asc' | 'price_desc' | 'shelf_desc';
type Tr = Awaited<ReturnType<typeof getTranslations<'discover'>>>;

const SORTS: Sort[] = ['newest', 'price_asc', 'price_desc', 'shelf_desc'];
const MIN_SHELF_OPTIONS = [3, 6, 12, 24];

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Pill, Bug, ShieldPlus, Droplet, HeartPulse, Droplets, Activity, Wind, Soup, Brain,
  FlaskConical, Sparkles, Eye, Leaf, Package,
  Biohazard, ShieldAlert, Shield, Syringe, TestTube, Filter, Beaker, CircleDot, Venus, Waves, Bone, Bandage,
  Ribbon, HandHeart, Dna, BrainCircuit, Siren, Ear, Smile, Sun, Utensils, ScanLine,
};

function CatIcon({ name, className }: { name: string; className?: string }) {
  const C = ICONS[name] ?? Package;
  return <C className={className} />;
}

const num = (v?: string) => {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/** Remaining shelf life for the card badge — display only (UTC month math, no local time). */
function shelfInfo(expiry: Date | null, t: Tr) {
  if (!expiry) return { label: '—', tone: 'bg-slate-100 text-slate-500' };
  const months = Math.max(0, diffMonthsUtc(expiry, new Date()));
  const tone =
    months < 3 ? 'bg-red-50 text-red-700' : months < 6 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700';
  return { label: months >= 24 ? t('shelfMonthsPlus', { months: 24 }) : t('shelfMonths', { months }), tone };
}

function ProductCard({ item, locale, t, tStatus }: { item: MarketplaceItem; locale: string; t: Tr; tStatus: (k: string) => string }) {
  const p = item.product;
  const shelf = shelfInfo(item.expiryDate, t);
  const strength = p.strengthValue ? `${p.strengthValue} ${p.strengthUnit ?? ''}`.trim() : null;
  const packs = p.packUnit ?? t('packs');
  return (
    <Link
      href={`/app/marketplace/${item.id}`}
      data-testid={`discover-card-${item.id}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-card transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-elevated"
    >
      <div className="relative flex h-28 items-center justify-center bg-slate-50">
        <CatIcon
          name={categoryForAtc(p.atcCode)?.icon ?? 'Package'}
          className="h-10 w-10 text-slate-400 transition-colors duration-150 ease-out group-hover:text-brand-500"
        />
        <div className="absolute end-3 top-3 flex gap-1.5">
          {p.coldChain ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700">
              <Snowflake className="h-3 w-3" /> {t('coldChain')}
            </span>
          ) : null}
          {item.listingType === 'SHORT_DATED' ? (
            <span className="rounded-md bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-white">{t('shortDatedBadge')}</span>
          ) : null}
        </div>
        {item.isDemo ? (
          <Badge tone="violet" className="absolute start-3 top-3">
            DEMO
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div>
          <h3 className="line-clamp-1 text-sm font-semibold tracking-tight text-slate-900">{p.brandName ?? p.inn}</h3>
          <p className="line-clamp-1 text-xs text-slate-500">
            {p.inn}
            {strength ? ` · ${strength}` : ''} · {p.dosageForm}
          </p>
        </div>
        <p className="line-clamp-1 text-xs text-slate-400">{p.manufacturer ?? '—'}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${shelf.tone}`}>
            <Clock className="me-0.5 h-3 w-3" />
            {shelf.label}
          </span>
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 tabular-nums">
            {formatNumber(item.quantityAvailable, locale)} {packs}
          </span>
          <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
            <MapPin className="me-0.5 h-3 w-3" />
            {item.originCountryId}
          </span>
        </div>
        {/* Regulatory verdict for the buyer's own country — conditions are never hidden. */}
        {item.eligibility ? (
          <Badge tone={toneForStatus(item.eligibility.verdict)} className="self-start">
            {tStatus(`verdict.${item.eligibility.verdict}`)}
          </Badge>
        ) : null}
        <div className="mt-auto flex items-end justify-between pt-2">
          <div>
            <p className="text-[10px] tracking-wide text-slate-400 uppercase">{t('fromPrice')}</p>
            <p className="text-lg font-semibold tracking-tight text-slate-900 tabular-nums">
              {formatMoney(item.unitPrice, item.currency, locale)}
            </p>
            <p className="text-[10px] text-slate-400">{t('minOrder', { count: formatNumber(item.minOrderQuantity, locale) })}</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-md bg-brand-800 px-3 py-1.5 text-xs font-medium text-white transition-colors duration-150 ease-out group-hover:bg-brand-700">
            {t('details')} <ArrowRight className="h-3.5 w-3.5 rtl:-scale-x-100" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function FilterForm({ sp, q, cat, sort, t, testidSuffix = '' }: { sp: SP; q?: string; cat?: string; sort: Sort; t: Tr; testidSuffix?: string }) {
  const s = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : undefined);
  const select = 'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-brand-500 focus:shadow-focus focus:outline-none';
  const input = 'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:shadow-focus focus:outline-none';
  const label = 'mb-1.5 block text-xs font-medium text-slate-600';
  return (
    <form method="get" className="space-y-5 rounded-lg border border-slate-200 bg-white p-5 shadow-card">
      {q ? <input type="hidden" name="q" defaultValue={q} /> : null}
      {cat ? <input type="hidden" name="cat" defaultValue={cat} /> : null}
      <p className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">{t('filters')}</p>

      <div>
        <label className={label}>{t('saleType')}</label>
        <select name="type" defaultValue={s('type') ?? ''} className={select}>
          <option value="">{t('all')}</option>
          <option value="SURPLUS">{t('surplus')}</option>
          <option value="SHORT_DATED">{t('shortDated')}</option>
        </select>
      </div>

      <div>
        <label className={label}>{t('pricePerPack')}</label>
        <div className="flex items-center gap-2">
          <input name="minPrice" type="number" step="0.01" min="0" defaultValue={s('minPrice') ?? ''} placeholder={t('from')} className={input} />
          <input name="maxPrice" type="number" step="0.01" min="0" defaultValue={s('maxPrice') ?? ''} placeholder={t('to')} className={input} />
        </div>
      </div>

      <div>
        <label className={label}>{t('minShelf')}</label>
        <select name="minShelf" defaultValue={s('minShelf') ?? ''} className={select}>
          <option value="">{t('any')}</option>
          {MIN_SHELF_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {t('monthsPlus', { months: m })}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={label}>{t('dosageForm')}</label>
        <input name="dosageForm" defaultValue={s('dosageForm') ?? ''} placeholder={t('dosageFormPlaceholder')} className={input} />
      </div>

      <div>
        <label className={label}>{t('storage')}</label>
        <select name="temp" defaultValue={s('temp') ?? ''} className={select}>
          <option value="">{t('all')}</option>
          <option value="AMBIENT">{t('ambient')}</option>
          <option value="COLD_2_8">{t('cold')}</option>
          <option value="FROZEN">{t('frozen')}</option>
        </select>
      </div>

      <div>
        <label className={label}>{t('sort')}</label>
        <select name="sort" defaultValue={sort} className={select}>
          <option value="newest">{t('sortNewest')}</option>
          <option value="price_asc">{t('sortPriceAsc')}</option>
          <option value="price_desc">{t('sortPriceDesc')}</option>
          <option value="shelf_desc">{t('sortShelfDesc')}</option>
        </select>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          data-testid={`discover-apply-filters${testidSuffix}`}
          className="h-10 flex-1 rounded-md bg-brand-800 text-sm font-medium text-white transition-colors duration-150 ease-out hover:bg-brand-700"
        >
          {t('apply')}
        </button>
        <Link
          href="/app/discover"
          className="flex h-10 items-center rounded-md border border-slate-300 px-3 text-sm text-slate-600 transition-colors duration-150 ease-out hover:bg-slate-50"
        >
          {t('reset')}
        </Link>
      </div>
    </form>
  );
}

/** All categories, grouped by specialty — the "browse" entry point. */
function CategoryGrid({ active, t }: { active?: string; t: Tr }) {
  return (
    <div className="space-y-6">
      {MED_CATEGORY_GROUPS.map((group) => (
        <div key={group}>
          <p className="mb-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">{t(`groups.${group}`)}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {categoriesInGroup(group).map((c) => {
              const isActive = active === c.key;
              return (
                <Link
                  key={c.key}
                  href={`/app/discover?cat=${c.key}`}
                  data-testid={`discover-category-${c.key}`}
                  className={`flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-sm transition-colors duration-150 ease-out ${
                    isActive
                      ? 'border-brand-800 bg-brand-800 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50'
                  }`}
                >
                  <CatIcon name={c.icon} className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : 'text-brand-600'}`} />
                  <span className="truncate">{t(`categories.${c.key}`)}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<SP> }) {
  const locale = await getLocale();
  const t = await getTranslations('discover');
  const tm = await getTranslations('marketplace');
  const tStatus = await getTranslations('status');
  const user = (await getCurrentUser())!;
  if (!user.org) return null;

  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : undefined);
  const q = s('q');
  const cat = s('cat');
  const listingType = sp.type === 'SURPLUS' || sp.type === 'SHORT_DATED' ? (sp.type as 'SURPLUS' | 'SHORT_DATED') : undefined;
  const sortParam = s('sort');
  const sort: Sort = SORTS.includes(sortParam as Sort) ? (sortParam as Sort) : 'newest';
  const category = categoryByKey(cat);
  const browsing = !q && !category; // landing state: show the full category grid open

  const result = await searchMarketplace(user.org.id, {
    q,
    listingType,
    atcPrefixes: category?.atcPrefixes,
    maxUnitPrice: num(s('maxPrice')),
    minUnitPrice: num(s('minPrice')),
    minShelfMonths: num(s('minShelf')),
    dosageForm: s('dosageForm'),
    temperatureMode: s('temp'),
    sort,
  });

  const chips = QUICK_CATEGORY_KEYS.map(categoryByKey).filter(Boolean) as typeof MED_CATEGORIES;
  const categoryOptions = MED_CATEGORIES.map((c) => ({ key: c.key, label: t(`categories.${c.key}`) }));
  const chipBase =
    'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-150 ease-out';

  return (
    <div className="-mx-4 -my-8 sm:-mx-6" data-testid="discover-page">
      {/* Hero */}
      <section className="border-b border-slate-200 bg-white px-4 pb-8 pt-10 sm:px-6">
        <div className="mx-auto max-w-5xl text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">{t('title')}</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">{t('subtitle')}</p>
          <div className="mx-auto mt-6 max-w-2xl">
            <DiscoverSearch initialQuery={q ?? ''} categories={categoryOptions} />
          </div>
          <div className="mx-auto mt-5 flex max-w-4xl gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:justify-center sm:overflow-visible">
            {chips.map((c) => (
              <Link
                key={c.key}
                href={`/app/discover?cat=${c.key}`}
                data-testid={`discover-chip-${c.key}`}
                className={`${chipBase} ${
                  cat === c.key
                    ? 'border-brand-800 bg-brand-800 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <CatIcon name={c.icon} className="h-3.5 w-3.5" />
                {t(`categories.${c.key}`)}
              </Link>
            ))}
            <a
              href="#categories"
              className={`${chipBase} border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}
              data-testid="discover-chip-all"
            >
              <LayoutGrid className="h-3.5 w-3.5" /> {t('allCategoriesCount', { count: MED_CATEGORIES.length })}
            </a>
          </div>
        </div>
      </section>

      {result.verifiedRequired ? (
        <div className="mx-auto mt-8 max-w-2xl rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {tm('verifiedRequired')}
        </div>
      ) : (
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          {/* Browse by specialty — open while browsing, collapsed once a search or category is active */}
          <details id="categories" open={browsing} className="group mb-8 rounded-lg border border-slate-200 bg-white shadow-card">
            <summary
              data-testid="discover-categories-toggle"
              className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-semibold text-slate-900"
            >
              <span className="inline-flex items-center gap-2">
                <LayoutGrid className="h-4 w-4 text-brand-600" /> {t('browseCategories')}
              </span>
              <span className="text-xs font-medium text-slate-400">{t('allCategoriesCount', { count: MED_CATEGORIES.length })}</span>
            </summary>
            <div className="border-t border-slate-100 px-5 py-5">
              <CategoryGrid active={cat} t={t} />
            </div>
          </details>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr]">
            {/* Filter sidebar (desktop) */}
            <aside className="hidden lg:block">
              <div className="sticky top-6">
                <FilterForm sp={sp} q={q} cat={cat} sort={sort} t={t} />
              </div>
            </aside>

            {/* Results */}
            <div>
              {/* Mobile filter toggle */}
              <details className="mb-4 lg:hidden">
                <summary
                  data-testid="discover-filter-toggle"
                  className="flex cursor-pointer list-none items-center justify-center gap-2 rounded-md border border-slate-300 bg-white py-2.5 text-sm font-medium text-slate-700"
                >
                  <SlidersHorizontal className="h-4 w-4" /> {t('filterToggle')}
                </summary>
                <div className="mt-3">
                  <FilterForm sp={sp} q={q} cat={cat} sort={sort} t={t} testidSuffix="-mobile" />
                </div>
              </details>

              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-slate-500" data-testid="discover-result-count">
                  <span className="font-semibold text-slate-900 tabular-nums">{t('resultCount', { count: result.items.length })}</span>
                  {category ? ` · ${t(`categories.${category.key}`)}` : ''}
                  {q ? ` · „${q}“` : ''}
                </p>
              </div>
              {result.items.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 p-12 text-center">
                  <Package className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-3 text-sm font-semibold text-slate-700">{t('emptyTitle')}</p>
                  <p className="mt-1 text-xs text-slate-500">{t('emptyNote')}</p>
                </div>
              ) : (
                <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {result.items.map((item) => (
                    <ProductCard key={item.id} item={item} locale={locale} t={t} tStatus={tStatus} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
