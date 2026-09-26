import { describe, it, expect } from 'vitest';
import { evaluateConflict, locationOverlaps } from './conflict';
import { PermitType, PermitStatus } from '@prisma/client';

describe('Domain: Permit Conflict Detection', () => {
  describe('locationOverlaps', () => {
    it('returns false for different areas', () => {
      expect(locationOverlaps('area-1', 'eq-1', 'area-2', 'eq-1')).toBe(false);
    });

    it('returns true for same area and same equipment', () => {
      expect(locationOverlaps('area-1', 'eq-1', 'area-1', 'eq-1')).toBe(true);
    });

    it('returns false for same area but different equipment', () => {
      expect(locationOverlaps('area-1', 'eq-1', 'area-1', 'eq-2')).toBe(false);
    });

    it('returns true for same area when one or both omit specific equipment', () => {
      expect(locationOverlaps('area-1', null, 'area-1', 'eq-1')).toBe(true);
      expect(locationOverlaps('area-1', 'eq-1', 'area-1', null)).toBe(true);
      expect(locationOverlaps('area-1', null, 'area-1', null)).toBe(true);
    });
  });

  describe('evaluateConflict', () => {
    const mockExistingPermit = {
      id: 'permit-123',
      permitNumber: 'PTW-2026-0001',
      type: 'CONFINED_SPACE' as PermitType,
      status: 'APPROVED' as PermitStatus,
      plannedStart: new Date(),
      plannedEnd: new Date(),
      areaId: 'area-1',
      equipmentId: 'eq-1',
    };

    it('detects HOT_WORK overlapping with CONFINED_SPACE', () => {
      const conflict = evaluateConflict({ type: 'HOT_WORK' }, mockExistingPermit);
      expect(conflict).not.toBeNull();
      expect(conflict?.code).toBe('HOT_WORK_CONFINED_SPACE_OVERLAP');
      expect(conflict?.severity).toBe('CRITICAL');
      expect(conflict?.conflictingPermit.id).toBe('permit-123');
    });

    it('detects CONFINED_SPACE overlapping with HOT_WORK', () => {
      const hotWorkPermit = { ...mockExistingPermit, type: 'HOT_WORK' as PermitType };
      const conflict = evaluateConflict({ type: 'CONFINED_SPACE' }, hotWorkPermit);
      expect(conflict).not.toBeNull();
      expect(conflict?.code).toBe('HOT_WORK_CONFINED_SPACE_OVERLAP');
    });

    it('returns null when types do not create a known conflict', () => {
      const electricalPermit = { ...mockExistingPermit, type: 'ELECTRICAL_LOTO' as PermitType };
      const conflict = evaluateConflict({ type: 'WORKING_AT_HEIGHT' }, electricalPermit);
      expect(conflict).toBeNull();
    });
  });
});
