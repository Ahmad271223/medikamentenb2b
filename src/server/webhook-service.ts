import { createHmac, randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { writeAudit } from '@/lib/audit/audit';
import type { CurrentUser } from '@/lib/auth/current';

// Outbound webhooks (spec §38): HMAC-SHA256-signed deliveries with a
// persistent delivery log. MVP delivers inline with one retry; a queue
// (BullMQ/Redis) takes over when volume demands it (docs PART L).

export const WEBHOOK_EVENTS = [
  'offer.received',
  'offer.accepted',
  'transaction.state_changed',
  'shipment.event',
  'recall.issued',
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

const DELIVERY_TIMEOUT_MS = 5_000;
const MAX_ATTEMPTS = 2;

export async function createWebhookEndpoint(user: CurrentUser, url: string, events: string[]) {
  if (!user.org) throw new ApiError('NOT_FOUND', 404, 'NO_ORGANIZATION');
  const invalid = events.filter((e) => !WEBHOOK_EVENTS.includes(e as WebhookEvent));
  if (invalid.length > 0) throw new ApiError('VALIDATION_ERROR', 400, 'UNKNOWN_EVENTS', { invalid });

  const secret = `whsec_${randomBytes(24).toString('base64url')}`;
  const endpoint = await prisma.webhookEndpoint.create({
    data: { orgId: user.org.id, url, secret, events, createdById: user.id },
  });
  await writeAudit({
    actorUserId: user.id,
    orgId: user.org.id,
    action: 'WEBHOOK_CREATED',
    entityType: 'WebhookEndpoint',
    entityId: endpoint.id,
    newValue: { url, events },
  });
  // Secret is shown once — the receiver needs it to verify signatures.
  return { id: endpoint.id, url, events, secret };
}

export async function revokeWebhookEndpoint(user: CurrentUser, endpointId: string) {
  if (!user.org) throw new ApiError('NOT_FOUND', 404, 'NO_ORGANIZATION');
  const endpoint = await prisma.webhookEndpoint.findFirst({
    where: { id: endpointId, orgId: user.org.id, revokedAt: null },
  });
  if (!endpoint) throw new ApiError('NOT_FOUND', 404, 'WEBHOOK_NOT_FOUND');
  await prisma.webhookEndpoint.update({
    where: { id: endpoint.id },
    data: { active: false, revokedAt: new Date() },
  });
  await writeAudit({
    actorUserId: user.id,
    orgId: user.org.id,
    action: 'WEBHOOK_REVOKED',
    entityType: 'WebhookEndpoint',
    entityId: endpoint.id,
  });
}

export function signWebhookPayload(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

async function deliverOnce(url: string, body: string, signature: string): Promise<{ ok: boolean; code?: number; error?: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PB-Signature': `sha256=${signature}`,
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return { ok: res.ok, code: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'delivery failed' };
  }
}

/**
 * Emits an event to every active endpoint of the given organizations that
 * subscribed to it. Failures never break the business transaction that
 * triggered the event — they are recorded on the delivery row.
 */
export async function emitWebhookEvent(
  orgIds: string[],
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { orgId: { in: orgIds }, active: true, events: { has: event } },
  });
  if (endpoints.length === 0) return;

  for (const endpoint of endpoints) {
    const delivery = await prisma.webhookDelivery.create({
      data: { endpointId: endpoint.id, event, payload: data as Prisma.InputJsonValue },
    });
    const body = JSON.stringify({ id: delivery.id, event, createdAt: new Date().toISOString(), data });
    const signature = signWebhookPayload(endpoint.secret, body);

    let outcome: Awaited<ReturnType<typeof deliverOnce>> = { ok: false };
    let attempts = 0;
    for (; attempts < MAX_ATTEMPTS && !outcome.ok; attempts++) {
      outcome = await deliverOnce(endpoint.url, body, signature);
    }
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: outcome.ok ? 'SUCCESS' : 'FAILED',
        attempts,
        responseCode: outcome.code ?? null,
        lastError: outcome.ok ? null : (outcome.error ?? `HTTP ${outcome.code}`),
        deliveredAt: outcome.ok ? new Date() : null,
      },
    });
  }
}
