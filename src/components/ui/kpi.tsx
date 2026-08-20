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
    <Card>
      <CardContent className="py-5">
        <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">{label}</p>
        <p
          className={cn(
            'mt-2 text-2xl font-semibold tabular-nums',
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
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/50 px-6 py-12 text-center">
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {note ? <p className="mx-auto mt-1 max-w-xl text-sm text-slate-500">{note}</p> : null}
    </div>
  );
}
