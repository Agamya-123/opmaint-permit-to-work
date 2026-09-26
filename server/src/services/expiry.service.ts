import { prisma } from '../lib/prisma';
import { EXPIRABLE_STATUSES, AuditEvent } from '../domain/permit/statuses';
import { maybeExpire } from '../domain/permit/transitions';

let schedulerInterval: NodeJS.Timeout | null = null;

/**
 * Sweeps and updates all permits in expirable statuses whose plannedEnd <= now.
 * Accepts an optional `now` timestamp for testability.
 */
export async function processExpiredPermits(now: Date = new Date()): Promise<number> {
  const expirablePermits = await prisma.permit.findMany({
    where: {
      status: { in: [...EXPIRABLE_STATUSES] },
      plannedEnd: { lte: now },
    },
    include: {
      approvals: true,
    },
  });

  if (expirablePermits.length === 0) {
    return 0;
  }

  let count = 0;
  for (const permit of expirablePermits) {
    const snapshot = {
      status: permit.status,
      plannedStart: permit.plannedStart,
      plannedEnd: permit.plannedEnd,
      allRequiredApprovalsGranted: permit.approvals.length > 0 && permit.approvals.every((a) => a.decision === 'APPROVED'),
    };

    const result = maybeExpire(snapshot, now);
    if (result) {
      await prisma.$transaction(async (tx) => {
        await tx.permit.update({
          where: { id: permit.id },
          data: { status: result.to },
        });
        await tx.auditLog.create({
          data: {
            permitId: permit.id,
            actorId: null, // System automatic action
            event: result.event,
            fromStatus: result.from,
            toStatus: result.to,
            reason: `Permit expired automatically past planned end time (${permit.plannedEnd.toISOString()})`,
            metadata: { automatic: true },
          },
        });
      });
      count++;
    }
  }

  return count;
}

/**
 * Starts the periodic background worker for server-side permit expiry.
 */
export function startExpiryScheduler(intervalMs: number = 30000): NodeJS.Timeout {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  processExpiredPermits().catch((err) => {
    if (process.env.NODE_ENV !== 'test') {
      console.error('Error in initial permit expiry sweep:', err);
    }
  });

  schedulerInterval = setInterval(() => {
    processExpiredPermits().catch((err) => {
      if (process.env.NODE_ENV !== 'test') {
        console.error('Error in scheduled permit expiry sweep:', err);
      }
    });
  }, intervalMs);

  return schedulerInterval;
}

/**
 * Stops the background scheduler (useful for test tear-downs).
 */
export function stopExpiryScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}
