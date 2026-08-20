'use client';

import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || (href !== '/app' && pathname.startsWith(`${href}/`));

  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
        active ? 'bg-brand-800 font-medium text-white' : 'text-slate-300 hover:bg-brand-900 hover:text-white',
      )}
    >
      {children}
    </Link>
  );
}
