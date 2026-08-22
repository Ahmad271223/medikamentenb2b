'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Search, Loader2 } from 'lucide-react';

interface Suggestion {
  label: string;
  sub: string;
  q: string;
}

const DEBOUNCE_MS = 180;

/** Autocomplete search bar of the discover page. Suggestions come from the
 *  same eligibility-filtered query the buyer can actually purchase from. */
export function DiscoverSearch({ initialQuery = '' }: { initialQuery?: string }) {
  const t = useTranslations('discover');
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeq = useRef(0);

  // Close on outside click; clear a pending debounce on unmount.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('mousedown', onClick);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function loadSuggestions(term: string) {
    const seq = ++requestSeq.current;
    try {
      const res = await fetch(`/api/v1/discover/suggest?q=${encodeURIComponent(term)}`, {
        headers: { Accept: 'application/json' },
      });
      const json = (await res.json()) as { ok: boolean; data?: Suggestion[] };
      if (seq !== requestSeq.current) return; // a newer keystroke superseded this request
      if (json.ok && json.data) {
        setItems(json.data);
        setOpen(json.data.length > 0);
      }
    } catch {
      // suggestions are best-effort; submitting still performs a full search
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    const term = next.trim();
    if (term.length < 2) {
      requestSeq.current++;
      setItems([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(() => void loadSuggestions(term), DEBOUNCE_MS);
  }

  const go = (term: string) => {
    setOpen(false);
    router.push(term.trim() ? `/app/discover?q=${encodeURIComponent(term.trim())}` : '/app/discover');
  };

  return (
    <div ref={boxRef} className="relative">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(value);
        }}
      >
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-card transition-[border-color,box-shadow] duration-150 ease-out focus-within:border-brand-500 focus-within:shadow-focus">
          <Search className="h-5 w-5 shrink-0 text-slate-400" />
          <input
            value={value}
            onChange={onChange}
            onFocus={() => items.length && setOpen(true)}
            placeholder={t('searchPlaceholder')}
            className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
            data-testid="discover-search-input"
            aria-label={t('searchAria')}
          />
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-slate-300" /> : null}
          <button
            type="submit"
            data-testid="discover-search-submit"
            className="hidden shrink-0 rounded-md bg-brand-800 px-4 py-1.5 text-sm font-medium text-white transition-colors duration-150 ease-out hover:bg-brand-700 sm:block"
          >
            {t('searchButton')}
          </button>
        </div>
      </form>

      {open && items.length > 0 ? (
        <ul
          className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-start shadow-elevated"
          data-testid="discover-suggestions"
        >
          {items.map((it, i) => (
            <li key={`${it.q}-${i}`}>
              <button
                type="button"
                onClick={() => go(it.q)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-start transition-colors duration-150 ease-out hover:bg-slate-50"
                data-testid={`discover-suggestion-${i}`}
              >
                <Search className="h-4 w-4 shrink-0 text-slate-300" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-800">{it.label}</span>
                  <span className="block truncate text-xs text-slate-400">{it.sub}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
