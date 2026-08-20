// Transaction state machine — every transition is validated here and logged by
// the service layer. See docs/architecture/E-marketplace-workflow.md

export const TRANSACTION_STATES = [
  'DRAFT', 'LISTED', 'MATCHED', 'BUYER_INTEREST', 'NEGOTIATION', 'OFFER_SUBMITTED',
  'OFFER_ACCEPTED', 'COMPLIANCE_REVIEW', 'DOCUMENTS_REQUIRED', 'IMPORT_PERMIT_PENDING',
  'READY_FOR_PAYMENT', 'PAYMENT_AUTHORIZED', 'READY_FOR_PICKUP', 'IN_TRANSIT', 'CUSTOMS',
  'DELIVERED', 'BUYER_ACCEPTED', 'SETTLED', 'CANCELLED', 'REJECTED', 'QUARANTINED',
  'RECALL', 'DISPUTE',
] as const;

export type TxState = (typeof TRANSACTION_STATES)[number];

export type TxActor =
  | 'SELLER'
  | 'BUYER'
  | 'COMPLIANCE_OFFICER'
  | 'PLATFORM_ADMIN'
  | 'LOGISTICS'
  | 'SYSTEM';

export const TERMINAL_STATES: readonly TxState[] = ['SETTLED', 'CANCELLED', 'REJECTED'];

/** States from which a party may still cancel (before physical execution). */
const CANCELLABLE_STATES: readonly TxState[] = [
  'DRAFT', 'LISTED', 'MATCHED', 'BUYER_INTEREST', 'NEGOTIATION', 'OFFER_SUBMITTED',
  'OFFER_ACCEPTED', 'COMPLIANCE_REVIEW', 'DOCUMENTS_REQUIRED', 'IMPORT_PERMIT_PENDING',
  'READY_FOR_PAYMENT', 'PAYMENT_AUTHORIZED',
];

export interface TransitionContext {
  batchRecalled?: boolean;
  batchQuarantined?: boolean;
  orgSuspended?: boolean;
  /** COMPLIANCE_REVIEW → READY_FOR_PAYMENT preconditions */
  requiredDocsVerified?: boolean;
  permitVerifiedIfRequired?: boolean;
  sanctionsClear?: boolean;
  licensesValid?: boolean;
  /** READY_FOR_PAYMENT → PAYMENT_AUTHORIZED */
  paymentAuthorized?: boolean;
  /** READY_FOR_PICKUP → IN_TRANSIT: shelf-life rule re-checked at booking */
  arrivalShelfLifeStillValid?: boolean;
  reason?: string;
}

interface TransitionRule {
  from: TxState | TxState[];
  to: TxState;
  actors: TxActor[];
  guard?: (ctx: TransitionContext) => string | null; // returns denial code or null
}

const complianceApprovalGuard = (ctx: TransitionContext): string | null => {
  if (!ctx.requiredDocsVerified) return 'DOCS_NOT_VERIFIED';
  if (!ctx.permitVerifiedIfRequired) return 'PERMIT_NOT_VERIFIED';
  if (!ctx.sanctionsClear) return 'SANCTIONS_NOT_CLEAR';
  if (!ctx.licensesValid) return 'LICENSES_NOT_VALID';
  return null;
};

const TRANSITIONS: TransitionRule[] = [
  { from: 'DRAFT', to: 'LISTED', actors: ['SELLER', 'SYSTEM'], guard: (c) => (c.licensesValid ? null : 'LICENSES_NOT_VALID') },
  { from: 'LISTED', to: 'MATCHED', actors: ['SYSTEM'] },
  { from: 'MATCHED', to: 'BUYER_INTEREST', actors: ['BUYER'] },
  { from: 'BUYER_INTEREST', to: 'NEGOTIATION', actors: ['BUYER', 'SELLER'] },
  { from: 'NEGOTIATION', to: 'OFFER_SUBMITTED', actors: ['BUYER', 'SELLER'] },
  { from: 'OFFER_SUBMITTED', to: 'NEGOTIATION', actors: ['BUYER', 'SELLER'] },
  { from: 'OFFER_SUBMITTED', to: 'OFFER_ACCEPTED', actors: ['BUYER', 'SELLER'] },
  { from: 'OFFER_ACCEPTED', to: 'COMPLIANCE_REVIEW', actors: ['SYSTEM'] },
  { from: 'COMPLIANCE_REVIEW', to: 'DOCUMENTS_REQUIRED', actors: ['COMPLIANCE_OFFICER'] },
  { from: 'DOCUMENTS_REQUIRED', to: 'COMPLIANCE_REVIEW', actors: ['SELLER', 'BUYER', 'SYSTEM'] },
  { from: 'COMPLIANCE_REVIEW', to: 'IMPORT_PERMIT_PENDING', actors: ['COMPLIANCE_OFFICER'] },
  { from: 'IMPORT_PERMIT_PENDING', to: 'COMPLIANCE_REVIEW', actors: ['BUYER', 'SYSTEM'] },
  // The human gate: only a platform Compliance Officer may release a transaction.
  { from: 'COMPLIANCE_REVIEW', to: 'READY_FOR_PAYMENT', actors: ['COMPLIANCE_OFFICER'], guard: complianceApprovalGuard },
  { from: 'COMPLIANCE_REVIEW', to: 'REJECTED', actors: ['COMPLIANCE_OFFICER'] },
  { from: 'READY_FOR_PAYMENT', to: 'PAYMENT_AUTHORIZED', actors: ['SYSTEM', 'BUYER'], guard: (c) => (c.paymentAuthorized ? null : 'PAYMENT_NOT_AUTHORIZED') },
  { from: 'PAYMENT_AUTHORIZED', to: 'READY_FOR_PICKUP', actors: ['SELLER', 'SYSTEM'] },
  { from: 'READY_FOR_PICKUP', to: 'IN_TRANSIT', actors: ['LOGISTICS', 'SELLER', 'SYSTEM'], guard: (c) => (c.arrivalShelfLifeStillValid ? null : 'SHELF_LIFE_RECHECK_FAILED') },
  { from: 'IN_TRANSIT', to: 'CUSTOMS', actors: ['LOGISTICS', 'SYSTEM'] },
  { from: 'CUSTOMS', to: 'DELIVERED', actors: ['LOGISTICS', 'SYSTEM'] },
  { from: 'DELIVERED', to: 'BUYER_ACCEPTED', actors: ['BUYER'] },
  { from: 'BUYER_ACCEPTED', to: 'SETTLED', actors: ['SYSTEM', 'PLATFORM_ADMIN'] },
  { from: ['DELIVERED', 'BUYER_ACCEPTED'], to: 'DISPUTE', actors: ['BUYER', 'SELLER'] },
  { from: 'DISPUTE', to: 'SETTLED', actors: ['COMPLIANCE_OFFICER', 'PLATFORM_ADMIN'] },
  { from: 'DISPUTE', to: 'REJECTED', actors: ['COMPLIANCE_OFFICER', 'PLATFORM_ADMIN'] },
  { from: [...CANCELLABLE_STATES], to: 'CANCELLED', actors: ['SELLER', 'BUYER', 'COMPLIANCE_OFFICER', 'PLATFORM_ADMIN'], guard: (c) => (c.reason ? null : 'CANCEL_REASON_REQUIRED') },
  // Safety freezes are possible from any non-terminal state.
  { from: TRANSACTION_STATES.filter((s) => !TERMINAL_STATES.includes(s) && s !== 'QUARANTINED' && s !== 'RECALL'), to: 'QUARANTINED', actors: ['COMPLIANCE_OFFICER', 'PLATFORM_ADMIN', 'SYSTEM'] },
  { from: TRANSACTION_STATES.filter((s) => !TERMINAL_STATES.includes(s) && s !== 'RECALL'), to: 'RECALL', actors: ['COMPLIANCE_OFFICER', 'PLATFORM_ADMIN', 'SYSTEM'] },
  { from: 'QUARANTINED', to: 'COMPLIANCE_REVIEW', actors: ['COMPLIANCE_OFFICER'] },
  { from: ['QUARANTINED', 'RECALL'], to: 'CANCELLED', actors: ['COMPLIANCE_OFFICER', 'PLATFORM_ADMIN'], guard: (c) => (c.reason ? null : 'CANCEL_REASON_REQUIRED') },
];

export type TransitionResult = { allowed: true } | { allowed: false; code: string };

const SAFETY_TARGETS: readonly TxState[] = ['QUARANTINED', 'RECALL', 'CANCELLED', 'REJECTED', 'DISPUTE'];

export function canTransition(
  from: TxState,
  to: TxState,
  actor: TxActor,
  ctx: TransitionContext = {},
): TransitionResult {
  if (TERMINAL_STATES.includes(from)) return { allowed: false, code: 'STATE_TERMINAL' };

  // Global safety guards: a recalled/quarantined batch or suspended org can
  // only move toward safety states, never forward.
  if ((ctx.batchRecalled || ctx.batchQuarantined || ctx.orgSuspended) && !SAFETY_TARGETS.includes(to)) {
    return { allowed: false, code: ctx.batchRecalled ? 'BATCH_RECALLED' : ctx.batchQuarantined ? 'BATCH_QUARANTINED' : 'ORG_SUSPENDED' };
  }

  const rule = TRANSITIONS.find((t) => {
    const froms = Array.isArray(t.from) ? t.from : [t.from];
    return froms.includes(from) && t.to === to;
  });
  if (!rule) return { allowed: false, code: 'TRANSITION_NOT_DEFINED' };
  if (!rule.actors.includes(actor)) return { allowed: false, code: 'ACTOR_NOT_PERMITTED' };
  if (rule.guard) {
    const denial = rule.guard(ctx);
    if (denial) return { allowed: false, code: denial };
  }
  return { allowed: true };
}

/** All states reachable from `from` for a given actor (UI affordances). */
export function availableTransitions(from: TxState, actor: TxActor): TxState[] {
  if (TERMINAL_STATES.includes(from)) return [];
  const targets = new Set<TxState>();
  for (const t of TRANSITIONS) {
    const froms = Array.isArray(t.from) ? t.from : [t.from];
    if (froms.includes(from) && t.actors.includes(actor)) targets.add(t.to);
  }
  return [...targets];
}
