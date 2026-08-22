'use client';

import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || (href !== '/app' && pathname.startsWith(`${href}/`));

  return (
    <Link
      href={href}
      data-testid={`nav-link-${href.replace(/\//g, '-').replace(/^-/, '')}`}
      className={cn(
        'relative flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-[background-color,color] duration-150 ease-out',
        active
          ? 'bg-white/10 font-semibold text-white'
          : 'text-brand-100/70 hover:bg-white/5 hover:text-white',
      )}
    >
      {active ? (
        <span className="absolute inset-y-1.5 start-0 w-0.5 rounded-full bg-brand-300" aria-hidden />
      ) : null}
      {children}
    </Link>
  );
}
