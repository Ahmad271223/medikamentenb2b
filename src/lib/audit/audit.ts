import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';

// Append-only audit writer. The AuditLog table rejects UPDATE/DELETE at the
// database level (see migration audit_immutability) — this module only ever
// inserts.

type Db = PrismaClient | Prisma.TransactionClient;

export interface AuditEntry {
  actorType?: 'USER' | 'SYSTEM' | 'COMPLIANCE';
  actorUserId?: string | null;
  orgId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
  ip?: string | null;
  sessionId?: string | null;
}

export async function writeAudit(entry: AuditEntry, db: Db = prisma): Promise<void> {
  await db.auditLog.create({
    data: {
      actorType: entry.actorType ?? 'USER',
      actorUserId: entry.actorUserId ?? null,
      orgId: entry.orgId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      oldValue: entry.oldValue === undefined ? undefined : (entry.oldValue as Prisma.InputJsonValue),
      newValue: entry.newValue === undefined ? undefined : (entry.newValue as Prisma.InputJsonValue),
      reason: entry.reason ?? null,
      ip: entry.ip ?? null,
      sessionId: entry.sessionId ?? null,
    },
  });
}
