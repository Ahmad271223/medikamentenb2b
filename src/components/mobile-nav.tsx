'use client';

import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export interface NavSection {
  label: string;
  links: Array<{ href: string; label: string }>;
}

export function MobileNav({ sections, brand }: { sections: NavSection[]; brand: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="lg:hidden">
      <button
        aria-label="Menu"
        className="flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
        onClick={() => setOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex">
          <div className="w-72 overflow-y-auto bg-brand-950 p-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-base font-semibold text-white">{brand}</span>
              <button
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-md text-brand-200 hover:bg-brand-900"
                onClick={() => setOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="space-y-5">
              {sections.map((section) => (
                <div key={section.label}>
                  <p className="mb-1.5 px-2 text-[11px] font-semibold tracking-wider text-brand-300 uppercase">
                    {section.label}
                  </p>
                  <div className="space-y-0.5">
                    {section.links.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setOpen(false)}
                        className={cn(
                          'block rounded-md px-2 py-2 text-sm',
                          pathname === link.href
                            ? 'bg-brand-800 font-medium text-white'
                            : 'text-slate-300 hover:bg-brand-900 hover:text-white',
                        )}
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </nav>
          </div>
          <button aria-label="Close overlay" className="flex-1 bg-black/40" onClick={() => setOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}
