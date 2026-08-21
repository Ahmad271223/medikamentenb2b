// Payment provider abstraction (spec §49): the platform NEVER implements a
// proprietary escrow product — real fund flows run through a licensed
// third-party provider behind this interface (founder decision, PART O #2).

export interface AuthorizeResult {
  providerRef: string;
  state: 'AUTHORIZED' | 'FAILED';
}

export interface PaymentProvider {
  readonly name: string;
  /** Reserve/authorize the buyer's payment for a transaction amount. */
  authorize(input: { transactionId: string; amount: string; currency: string }): Promise<AuthorizeResult>;
  /** Release the authorized funds to settlement (after buyer acceptance). */
  release(input: { providerRef: string }): Promise<{ state: 'RELEASED' | 'FAILED' }>;
  /** Return authorized funds to the buyer (dispute resolved against the seller). */
  refund(input: { providerRef: string }): Promise<{ state: 'REFUNDED' | 'FAILED' }>;
}

/**
 * MANUAL_DEMO provider — explicitly NOT a payment integration. It records the
 * intent so the full transaction lifecycle is testable; every reference is
 * prefixed `DEMO-` and no funds move anywhere. A real provider adapter
 * implements the same interface once PART O decision 2 is made.
 */
class ManualDemoProvider implements PaymentProvider {
  readonly name = 'MANUAL_DEMO';

  async authorize(input: { transactionId: string }): Promise<AuthorizeResult> {
    return { providerRef: `DEMO-AUTH-${input.transactionId.slice(0, 8)}`, state: 'AUTHORIZED' };
  }

  async release(): Promise<{ state: 'RELEASED' }> {
    return { state: 'RELEASED' };
  }

  async refund(): Promise<{ state: 'REFUNDED' }> {
    return { state: 'REFUNDED' };
  }
}

export function getPaymentProvider(): PaymentProvider {
  // Future: switch on env/config once a licensed provider is contracted.
  return new ManualDemoProvider();
}
