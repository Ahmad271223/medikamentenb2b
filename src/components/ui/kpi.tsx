import { Card, CardContent } from './card';
import { cn } from '@/lib/utils';

export function KpiCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: 'default' | 'warning' | 'danger';
}) {
  return (
    <Card className="relative overflow-hidden transition-shadow duration-200 ease-out hover:shadow-elevated">
      <span
        className={cn(
          'absolute inset-y-0 start-0 w-1',
          tone === 'warning' ? 'bg-amber-400' : tone === 'danger' ? 'bg-red-400' : 'bg-brand-600',
        )}
        aria-hidden
      />
      <CardContent className="py-5 ps-6">
        <p className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">{label}</p>
        <p
          className={cn(
            'font-display mt-2 text-2xl font-semibold tabular-nums',
            tone === 'warning' && 'text-amber-700',
            tone === 'danger' && 'text-red-700',
            tone === 'default' && 'text-slate-900',
          )}
        >
          {value}
        </p>
        {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export function EmptyState({ title, note }: { title: string; note?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-6 py-14 text-center">
      <p className="font-display text-sm font-semibold text-slate-700">{title}</p>
      {note ? <p className="mx-auto mt-1.5 max-w-xl text-sm text-slate-500">{note}</p> : null}
    </div>
  );
}
