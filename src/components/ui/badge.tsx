import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'border-slate-200 bg-slate-50 text-slate-600',
        success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        warning: 'border-amber-200 bg-amber-50 text-amber-700',
        danger: 'border-red-200 bg-red-50 text-red-700',
        info: 'border-sky-200 bg-sky-50 text-sky-700',
        brand: 'border-brand-200 bg-brand-50 text-brand-800',
        violet: 'border-violet-200 bg-violet-50 text-violet-700',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/** Maps well-known status enum values to a visual tone. */
export function toneForStatus(value: string): BadgeTone {
  switch (value) {
    case 'VERIFIED':
    case 'APPROVED':
    case 'ACTIVE':
    case 'ELIGIBLE':
    case 'TRADE_ENABLED':
    case 'CLEAR':
    case 'SETTLED':
      return 'success';
    case 'PENDING_KYB':
    case 'PENDING_REVIEW':
    case 'PENDING_VERIFICATION':
    case 'PENDING':
    case 'IN_REVIEW':
    case 'UNVERIFIED':
    case 'CONDITIONALLY_ELIGIBLE':
    case 'HUMAN_REVIEW_REQUIRED':
    case 'NEEDS_DOCUMENTS':
    case 'RESEARCH_IN_PROGRESS':
    case 'REVIEW':
      return 'warning';
    case 'REJECTED':
    case 'EXPIRED':
    case 'SUSPENDED':
    case 'INELIGIBLE':
    case 'BLOCKED':
    case 'RECALLED':
    case 'QUARANTINED':
    case 'CANCELLED':
      return 'danger';
    case 'DEMO':
      return 'violet';
    case 'INSUFFICIENT_DATA':
    case 'UNKNOWN':
    case 'NOT_TRADE_ENABLED':
    case 'NOT_SCREENED':
    case 'DRAFT':
      return 'neutral';
    default:
      return 'neutral';
  }
}
