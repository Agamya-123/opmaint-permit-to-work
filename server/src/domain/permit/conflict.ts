import { PermitStatus, PermitType } from '@prisma/client';

export type ConflictSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface ConflictingPermit {
  id: string;
  permitNumber: string;
  type: PermitType;
  status: PermitStatus;
  plannedStart: Date;
  plannedEnd: Date;
  areaId: string;
  equipmentId?: string | null;
}

export interface ConflictWarning {
  code: string;
  severity: ConflictSeverity;
  message: string;
  conflictingPermit: ConflictingPermit;
}

/**
 * Given a "target" permit and an overlapping existing permit,
 * evaluate if their combination constitutes a safety conflict.
 */
export function evaluateConflict(
  target: { type: PermitType },
  existing: ConflictingPermit
): ConflictWarning | null {
  const tType = target.type;
  const eType = existing.type;

  // Rule 1: HOT_WORK + CONFINED_SPACE overlap
  const isHotWorkConfined =
    (tType === 'HOT_WORK' && eType === 'CONFINED_SPACE') ||
    (tType === 'CONFINED_SPACE' && eType === 'HOT_WORK');

  if (isHotWorkConfined) {
    return {
      code: 'HOT_WORK_CONFINED_SPACE_OVERLAP',
      severity: 'CRITICAL',
      message: `Safety Conflict: ${tType.replace('_', ' ')} overlaps with ${eType.replace('_', ' ')} permit ${existing.permitNumber}`,
      conflictingPermit: existing,
    };
  }

  // Future rules could go here
  // e.g. ELECTRICAL_LOTO + HOT_WORK

  return null;
}

/**
 * Evaluates whether two location descriptions overlap.
 * If they are in the same area:
 * - If one specifies equipment and the other doesn't (area level), they overlap.
 * - If both specify equipment, they only overlap if it's the SAME equipment.
 * - If neither specify equipment, they overlap on the area level.
 */
export function locationOverlaps(
  tAreaId: string,
  tEqId: string | null | undefined,
  eAreaId: string,
  eEqId: string | null | undefined
): boolean {
  if (tAreaId !== eAreaId) {
    return false;
  }

  // Same area. Now check equipment.
  if (tEqId && eEqId) {
    if (tEqId !== eEqId) {
      return false; // Different specific equipment within the same area
    }
  }

  return true; // Overlap! (Either same equipment, or at least one is Area-wide)
}
