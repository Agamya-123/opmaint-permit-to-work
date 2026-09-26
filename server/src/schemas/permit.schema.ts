import { z } from 'zod';
import { PermitType, PermitStatus } from '@prisma/client';
import { PERMIT_ACTIONS } from '../domain/permit';

export const createPermitSchema = z.object({
  type: z.nativeEnum(PermitType),
  plantId: z.string().uuid(),
  areaId: z.string().uuid(),
  equipmentId: z.string().uuid().optional().nullable(),
  contractorTeam: z.string().optional().nullable(),
  workDescription: z.string().min(5, 'Work description must be at least 5 characters'),
  plannedStart: z.string().datetime(),
  plannedEnd: z.string().datetime(),
  hazards: z.array(z.string()).optional().default([]),
  ppe: z.array(z.string()).optional().default([]),
  precautions: z
    .array(
      z.object({
        label: z.string(),
        checked: z.boolean(),
      }),
    )
    .optional()
    .default([]),
  typeData: z.record(z.unknown()).optional().default({}),
});

export const updatePermitSchema = createPermitSchema.partial();

export const permitActionSchema = z.object({
  action: z.enum(PERMIT_ACTIONS),
  reason: z.string().optional(),
});

export const getPermitsQuerySchema = z.object({
  status: z.nativeEnum(PermitStatus).optional(),
  type: z.nativeEnum(PermitType).optional(),
  plantId: z.string().uuid().optional(),
  areaId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  pendingMyApproval: z.string().optional(),
  expiringSoon: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

export const logWorkSchema = z.object({
  notes: z.string().min(1, 'Work log notes are required'),
  hoursLogged: z.number().positive().optional(),
});
