import { prisma } from '../lib/prisma';
import { evaluateConflict, locationOverlaps, ConflictWarning } from '../domain/permit/conflict';
import { processExpiredPermits } from './expiry.service';

export async function detectPermitConflicts(target: {
  id?: string;
  type: string;
  areaId: string;
  equipmentId?: string | null;
  plannedStart: Date | string;
  plannedEnd: Date | string;
}): Promise<ConflictWarning[]> {
  await processExpiredPermits();

  const start = new Date(target.plannedStart);
  const end = new Date(target.plannedEnd);

  // Active/non-terminal permits overlapping in time in the target area
  const overlappingPermits = await prisma.permit.findMany({
    where: {
      areaId: target.areaId,
      status: {
        in: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'SUSPENDED'],
      },
      plannedStart: { lt: end },
      plannedEnd: { gt: start },
      ...(target.id ? { id: { not: target.id } } : {}),
    },
    select: {
      id: true,
      permitNumber: true,
      type: true,
      status: true,
      plannedStart: true,
      plannedEnd: true,
      areaId: true,
      equipmentId: true,
    },
  });

  const warnings: ConflictWarning[] = [];

  for (const p of overlappingPermits) {
    if (locationOverlaps(target.areaId, target.equipmentId, p.areaId, p.equipmentId)) {
      const warning = evaluateConflict({ type: target.type as any }, p as any);
      if (warning) {
        warnings.push(warning);
      }
    }
  }

  return warnings;
}
