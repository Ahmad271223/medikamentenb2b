import { getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getCurrentUser, toActor } from '@/lib/auth/current';
import { hasPermission } from '@/lib/authz/permissions';
import { BRAND } from '@/lib/branding';
import { NavLink } from '@/components/nav-link';
import { MobileNav, type NavSection } from '@/components/mobile-nav';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { LogoutButton } from '@/components/logout-button';
import { Badge, toneForStatus } from '@/components/ui/badge';
import { getConfig } from '@/lib/config/platform-config';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user) redirect({ href: '/login', locale });

  const t = await getTranslations();
  const actor = toActor(user!);
  const demoMode = await getConfig('demo_mode');

  const canCompliance = hasPermission(actor, 'review:decide') || hasPermission(actor, 'rule:draft');
  const isAdmin = user!.platformRole === 'PLATFORM_ADMIN';
  const isSellerSide = user!.org?.kind === 'SELLER' || user!.org?.kind === 'HYBRID';
  const isBuyerSide = user!.org?.kind === 'BUYER' || user!.org?.kind === 'HYBRID';

  const sections: NavSection[] = [
    {
      label: t('nav.general'),
      links: [
        { href: '/app', label: t('nav.dashboard') },
        { href: '/app/onboarding', label: t('nav.onboarding') },
        { href: '/app/organization', label: t('nav.organization') },
        { href: '/app/notifications', label: t('nav.notifications') },
      ],
    },
  ];
  if (user!.org) {
    sections.push({
      label: t('nav.trade'),
      links: [
        ...(isBuyerSide
          ? [
              { href: '/app/marketplace', label: t('nav.marketplace') },
              { href: '/app/demands', label: t('nav.demands') },
            ]
          : []),
        ...(isSellerSide
          ? [
              { href: '/app/inventory', label: t('nav.inventory') },
              { href: '/app/listings', label: t('nav.listings') },
            ]
          : []),
        { href: '/app/matches', label: t('nav.matches') },
        { href: '/app/offers', label: t('nav.offers') },
        { href: '/app/transactions', label: t('nav.transactions') },
        { href: '/app/shipments', label: t('shipments.title') },
        { href: '/app/products', label: t('nav.products') },
        { href: '/app/licenses', label: t('nav.licenses') },
        { href: '/app/warehouses', label: t('nav.warehouses') },
        { href: '/app/documents', label: t('nav.documents') },
        { href: '/app/settings', label: t('nav.settings') },
      ],
    });
  }
  if (canCompliance) {
    sections.push({
      label: t('nav.complianceSection'),
      links: [
        { href: '/app/compliance', label: t('nav.complianceQueue') },
        { href: '/app/compliance/rules', label: t('nav.rules') },
        { href: '/app/compliance/rules/manage', label: t('nav.rulesManage') },
        { href: '/app/compliance/countries', label: t('nav.countries') },
        { href: '/app/compliance/recalls', label: t('nav.recalls') },
        { href: '/app/compliance/sanctions', label: t('nav.sanctions') },
        { href: '/app/transactions', label: t('nav.transactions') },
      ],
    });
  }
  if (isAdmin) {
    sections.push({
      label: t('nav.adminSection'),
      links: [
        { href: '/app/admin', label: t('nav.admin') },
        { href: '/app/admin/organizations', label: t('nav.organizations') },
        { href: '/app/admin/users', label: t('nav.users') },
        { href: '/app/admin/config', label: t('nav.config') },
        { href: '/app/admin/audit', label: t('nav.audit') },
      ],
    });
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col bg-brand-950 lg:flex">
        <div className="flex h-16 items-center border-b border-brand-900 px-5">
          <span className="text-base font-semibold tracking-tight text-white">{BRAND.name}</span>
        </div>
        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
          {sections.map((section) => (
            <div key={section.label}>
              <p className="mb-2 px-3 text-[11px] font-semibold tracking-wider text-brand-300 uppercase">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.links.map((link) => (
                  <NavLink key={`${section.label}-${link.href}`} href={link.href}>
                    {link.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {demoMode ? (
          <div className="bg-violet-700 px-4 py-1.5 text-center text-xs font-medium text-white">
            {t('common.demoBanner')}
          </div>
        ) : null}
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <MobileNav sections={sections} brand={BRAND.name} />
            {user!.org ? (
              <>
                <span className="max-w-48 truncate text-sm font-medium text-slate-800 sm:max-w-none">
                  {user!.org.legalName}
                </span>
                <Badge tone={toneForStatus(user!.org.status)}>{t(`status.org.${user!.org.status}`)}</Badge>
              </>
            ) : user!.platformRole ? (
              <Badge tone="brand">{t(`status.platformRole.${user!.platformRole}`)}</Badge>
            ) : null}
          </div>
          <div className="flex items-center gap-4">
            <LocaleSwitcher />
            <span className="hidden text-sm text-slate-600 sm:inline">
              {user!.firstName} {user!.lastName}
            </span>
            <LogoutButton />
          </div>
        </header>
        <main className="flex-1 px-4 py-8 sm:px-6">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
