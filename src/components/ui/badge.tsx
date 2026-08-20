import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-slate-100 text-slate-700',
        success: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200',
        warning: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
        danger: 'bg-red-50 text-red-800 ring-1 ring-red-200',
        info: 'bg-blue-50 text-blue-800 ring-1 ring-blue-200',
        brand: 'bg-brand-50 text-brand-800 ring-1 ring-brand-200',
        violet: 'bg-violet-50 text-violet-800 ring-1 ring-violet-200',
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
