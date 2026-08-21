import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { writeAudit } from '@/lib/audit/audit';
import { canTransition, type TxState } from '@/domain/transactions/state-machine';
import { calculateShelfLife } from '@/domain/shelf-life/shelf-life';
import { evaluateShelfLifeRule } from '@/domain/shelf-life/rules';
import type { ShelfLifeRulePayload } from '@/domain/shelf-life/types';
import { notifyOrgOwners } from './notify';
import { emitWebhookEvent } from './webhook-service';

export interface CreateShipmentInput {
  transactionId: string;
  carrier: string;
  service?: string;
  pickupDate?: string;
  estimatedArrival: string;
  trackingNumber?: string;
  airwayBill?: string;
}

export async function createShipment(userId: string, sellerOrgId: string, input: CreateShipmentInput) {
  const tx = await prisma.transaction.findUniqueOrThrow({
    where: { id: input.transactionId },
    include: { batch: true, buyerOrg: true },
  });
  if (tx.sellerOrgId !== sellerOrgId) throw new ApiError('FORBIDDEN', 403, 'NOT_SELLER');
  if (tx.state !== 'PAYMENT_AUTHORIZED' && tx.state !== 'READY_FOR_PICKUP') {
    throw new ApiError('CONFLICT', 409, 'TRANSACTION_NOT_SHIPPABLE');
  }
  const existing = await prisma.shipment.findFirst({
    where: { transactionId: tx.id, status: { notIn: ['CANCELLED'] } },
  });
  if (existing) throw new ApiError('CONFLICT', 409, 'SHIPMENT_EXISTS');

  const shipment = await prisma.$transaction(async (db) => {
    const shipment = await db.shipment.create({
      data: {
        transactionId: tx.id,
        originWarehouseId: tx.batch.warehouseId,
        destinationCity: tx.buyerOrg.city,
        destinationCountryId: tx.destinationCountryId,
        carrier: input.carrier,
        service: input.service ?? null,
        incoterm: null,
        temperatureMode: tx.batch.temperatureMode,
        temperatureMonitoring: tx.batch.temperatureMode !== 'AMBIENT',
        pickupDate: input.pickupDate ? new Date(input.pickupDate) : null,
        estimatedArrival: new Date(input.estimatedArrival),
        trackingNumber: input.trackingNumber ?? null,
        airwayBill: input.airwayBill ?? null,
        status: 'BOOKED',
      },
    });
    if (tx.state === 'PAYMENT_AUTHORIZED') {
      const step = canTransition('PAYMENT_AUTHORIZED', 'READY_FOR_PICKUP', 'SELLER');
      if (!step.allowed) throw new ApiError('CONFLICT', 409, step.code);
      await db.transaction.update({ where: { id: tx.id }, data: { state: 'READY_FOR_PICKUP' } });
      await db.transactionStateEvent.create({
        data: { transactionId: tx.id, fromState: 'PAYMENT_AUTHORIZED', toState: 'READY_FOR_PICKUP', actorType: 'USER', actorUserId: userId },
      });
    }
    await writeAudit(
      {
        actorUserId: userId,
        orgId: sellerOrgId,
        action: 'SHIPMENT_BOOKED',
        entityType: 'Shipment',
        entityId: shipment.id,
        newValue: { carrier: input.carrier, estimatedArrival: input.estimatedArrival },
      },
      db,
    );
    return shipment;
  });
  return { shipmentId: shipment.id };
}

/**
 * Dispatch = READY_FOR_PICKUP → IN_TRANSIT. The destination's CURRENT verified
 * shelf-life rule is re-evaluated against the shipment's actual estimated
 * arrival (spec §57/§22) — booking data, not order-time data. A failed or
 * unverifiable re-check blocks dispatch.
 */
export async function dispatchShipment(userId: string, sellerOrgId: string, shipmentId: string) {
  const shipment = await prisma.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
    include: { transaction: { include: { batch: { include: { product: true } } } } },
  });
  const tx = shipment.transaction;
  if (tx.sellerOrgId !== sellerOrgId) throw new ApiError('FORBIDDEN', 403, 'NOT_SELLER');
  if (!shipment.estimatedArrival) throw new ApiError('CONFLICT', 409, 'ESTIMATED_ARRIVAL_REQUIRED');

  const rule = await prisma.regulatoryRule.findFirst({
    where: { countryId: tx.destinationCountryId, ruleType: 'SHELF_LIFE' },
    include: { currentVersion: true },
  });
  let shelfLifeOk = false;
  const life = calculateShelfLife({
    expiryDate: tx.batch.expiryDate,
    manufacturingDate: tx.batch.manufacturingDate,
    originalShelfLifeMonths: tx.batch.product.originalShelfLifeMonths,
    atDate: shipment.estimatedArrival,
  });
  if (life.daysRemaining > 0 && rule?.currentVersion?.status === 'VERIFIED') {
    const outcome = evaluateShelfLifeRule(rule.currentVersion.payload as ShelfLifeRulePayload, life, {
      atcCode: tx.batch.product.atcCode,
      dosageForm: tx.batch.product.dosageForm,
      coldChain: tx.batch.product.coldChain,
    });
    shelfLifeOk = outcome.outcome === 'PASS';
  }

  const step = canTransition(tx.state, 'IN_TRANSIT', 'SELLER', {
    batchRecalled: tx.batch.recallStatus !== 'NONE',
    batchQuarantined: tx.batch.quarantineStatus === 'QUARANTINED',
    arrivalShelfLifeStillValid: shelfLifeOk,
  });
  if (!step.allowed) throw new ApiError('CONFLICT', 409, step.code);

  await prisma.$transaction(async (db) => {
    await db.shipment.update({ where: { id: shipment.id }, data: { status: 'IN_TRANSIT' } });
    await db.shipmentEvent.create({
      data: { shipmentId: shipment.id, type: 'DISPATCHED', occurredAt: new Date() },
    });
    await db.transaction.update({ where: { id: tx.id }, data: { state: 'IN_TRANSIT' } });
    await db.transactionStateEvent.create({
      data: {
        transactionId: tx.id,
        fromState: tx.state,
        toState: 'IN_TRANSIT',
        actorType: 'USER',
        actorUserId: userId,
        metadata: {
          arrivalShelfLifeDays: life.daysRemaining,
          arrivalShelfLifePercent: life.percentRemaining,
          ruleVersionId: rule?.currentVersion?.id ?? null,
        } as Prisma.InputJsonValue,
      },
    });
    await writeAudit(
      {
        actorUserId: userId,
        orgId: sellerOrgId,
        action: 'SHIPMENT_DISPATCHED',
        entityType: 'Shipment',
        entityId: shipment.id,
        newValue: { arrivalShelfLifeDays: life.daysRemaining },
      },
      db,
    );
  });
  await notifyOrgOwners(tx.buyerOrgId, {
    type: 'SHIPMENT_DISPATCHED',
    title: 'Sendung unterwegs / Shipment dispatched',
    data: { transactionId: tx.id, shipmentId: shipment.id },
  });
  void emitWebhookEvent([tx.sellerOrgId, tx.buyerOrgId], 'shipment.event', {
    shipmentId: shipment.id,
    transactionId: tx.id,
    type: 'DISPATCHED',
  }).catch(() => undefined);
  return { state: 'IN_TRANSIT' as const };
}

export type Milestone = 'PICKED_UP' | 'CUSTOMS_IN' | 'CUSTOMS_CLEARED' | 'DELIVERED' | 'EXCEPTION';

/**
 * Milestones are recorded facts; the transaction advances as SYSTEM in
 * response (event-sourced): CUSTOMS_IN → CUSTOMS, DELIVERED → DELIVERED.
 */
export async function recordShipmentEvent(
  userId: string,
  shipmentId: string,
  input: { type: Milestone; location?: string; occurredAt?: string },
) {
  const shipment = await prisma.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
    include: { transaction: true },
  });
  const tx = shipment.transaction;

  const targetState: TxState | null =
    input.type === 'CUSTOMS_IN' ? 'CUSTOMS' : input.type === 'DELIVERED' ? 'DELIVERED' : null;

  if (targetState) {
    const step = canTransition(tx.state, targetState, 'SYSTEM');
    if (!step.allowed) throw new ApiError('CONFLICT', 409, step.code);
  }

  await prisma.$transaction(async (db) => {
    await db.shipmentEvent.create({
      data: {
        shipmentId,
        type: input.type,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
        location: input.location ?? null,
      },
    });
    if (input.type === 'DELIVERED') {
      await db.shipment.update({
        where: { id: shipmentId },
        data: { status: 'DELIVERED', actualArrival: new Date() },
      });
    } else if (input.type === 'CUSTOMS_IN') {
      await db.shipment.update({ where: { id: shipmentId }, data: { status: 'CUSTOMS', customsStatus: 'IN_CLEARANCE' } });
    } else if (input.type === 'CUSTOMS_CLEARED') {
      await db.shipment.update({ where: { id: shipmentId }, data: { customsStatus: 'CLEARED' } });
    } else if (input.type === 'EXCEPTION') {
      await db.shipment.update({ where: { id: shipmentId }, data: { status: 'EXCEPTION' } });
    }
    if (targetState) {
      await db.transaction.update({ where: { id: tx.id }, data: { state: targetState } });
      await db.transactionStateEvent.create({
        data: { transactionId: tx.id, fromState: tx.state, toState: targetState, actorType: 'SYSTEM', actorUserId: userId },
      });
    }
    await writeAudit(
      {
        actorUserId: userId,
        orgId: tx.sellerOrgId,
        action: `SHIPMENT_${input.type}`,
        entityType: 'Shipment',
        entityId: shipmentId,
        newValue: { location: input.location ?? null },
      },
      db,
    );
  });
  void emitWebhookEvent([tx.sellerOrgId, tx.buyerOrgId], 'shipment.event', {
    shipmentId,
    transactionId: tx.id,
    type: input.type,
    location: input.location ?? null,
  }).catch(() => undefined);
  return { recorded: input.type, transactionState: targetState ?? tx.state };
}

/** Pure excursion check — exported for unit tests. */
export function isTemperatureExcursion(tempC: number, minC: number | null, maxC: number | null): boolean {
  if (minC !== null && tempC < minC) return true;
  if (maxC !== null && tempC > maxC) return true;
  return false;
}

export async function recordTemperature(
  userId: string,
  shipmentId: string,
  input: { temperatureC: number; recordedAt?: string; source?: string },
) {
  const shipment = await prisma.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
    include: { transaction: { include: { batch: { include: { product: true } } } } },
  });
  const product = shipment.transaction.batch.product;
  const excursion = isTemperatureExcursion(
    input.temperatureC,
    product.storageMinC === null ? null : Number(product.storageMinC),
    product.storageMaxC === null ? null : Number(product.storageMaxC),
  );

  await prisma.$transaction(async (db) => {
    await db.temperatureLog.create({
      data: {
        shipmentId,
        recordedAt: input.recordedAt ? new Date(input.recordedAt) : new Date(),
        temperatureC: String(input.temperatureC),
        source: input.source ?? null,
      },
    });
    if (excursion && !shipment.transaction.batch.temperatureExcursion) {
      await db.batch.update({
        where: { id: shipment.transaction.batchId },
        data: { temperatureExcursion: true },
      });
      await writeAudit(
        {
          actorType: 'SYSTEM',
          actorUserId: userId,
          orgId: shipment.transaction.sellerOrgId,
          action: 'TEMPERATURE_EXCURSION_FLAGGED',
          entityType: 'Batch',
          entityId: shipment.transaction.batchId,
          newValue: { temperatureC: input.temperatureC, shipmentId },
        },
        db,
      );
    }
  });

  if (excursion) {
    await Promise.all([
      notifyOrgOwners(shipment.transaction.sellerOrgId, {
        type: 'TEMPERATURE_EXCURSION',
        title: 'Temperaturabweichung / Temperature excursion',
        body: `${input.temperatureC} °C`,
        data: { shipmentId },
      }),
      notifyOrgOwners(shipment.transaction.buyerOrgId, {
        type: 'TEMPERATURE_EXCURSION',
        title: 'Temperaturabweichung / Temperature excursion',
        body: `${input.temperatureC} °C`,
        data: { shipmentId },
      }),
    ]);
  }
  return { excursion };
}
