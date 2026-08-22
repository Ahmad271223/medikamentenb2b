import { cn } from '@/lib/utils';

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 transition-[border-color,box-shadow] duration-150 ease-out',
        'focus:border-brand-500 focus:shadow-focus focus:outline-none disabled:bg-slate-50',
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1.5 block text-sm font-medium text-slate-700', className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 transition-[border-color,box-shadow] duration-150 ease-out',
        'focus:border-brand-500 focus:shadow-focus focus:outline-none',
        className,
      )}
      {...props}
    />
  );
}

export function FieldError({
  children,
  'data-testid': testId,
}: {
  children?: React.ReactNode;
  'data-testid'?: string;
}) {
  if (!children) return null;
  return (
    <p className="mt-1 text-sm text-red-600" data-testid={testId}>
      {children}
    </p>
  );
}
