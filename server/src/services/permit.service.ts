import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { AuditEvent, ApprovalRole, PermitStatus } from '@prisma/client';
import { PermitDomainError, PermitErrorCode } from '../domain/permit/errors';
import {
  PERMIT_ACTIONS,
  ALLOWED_TRANSITIONS,
  isAllowedTransition,
  findTransition,
  transition,
  assertWorkMayBeLogged,
  maybeExpire,
  type PermitAction,
  type PermitSnapshot,
  type TransitionResult,
} from '../domain/permit';

import { prisma } from '../lib/prisma';
import { processExpiredPermits } from './expiry.service';
import { detectPermitConflicts } from './conflict.service';

/** Load a permit and verify it exists – rethrows NotFound if missing. */
async function loadPermit(permitId: string): Promise<PermitSnapshot> {
  await processExpiredPermits();
  const permit = await prisma.permit.findUnique({
    where: { id: permitId },
    include: { approvals: true },
  });

  if (!permit) {
    throw new PrismaClientKnownRequestError('Permit not found', {
      code: 'P2025',
      clientVersion: '',
      meta: { model: 'Permit' },
    });
  }

  return {
    status: permit.status,
    plannedStart: permit.plannedStart,
    plannedEnd: permit.plannedEnd,
    allRequiredApprovalsGranted: permit.approvals.every(
      (a) => a.decision === 'APPROVED',
    ),
  };
}

/** Helper: build a filter where-clause from query params */
function buildPermitFilter({ status, type, plantId, areaId, startDate, endDate, pendingMyApproval, expiringSoon }: any) {
  const where: any = {};

  if (status) where.status = status;
  if (type) where.type = type;
  if (plantId) where.plantId = plantId;
  if (areaId) where.areaId = areaId;

  // Date range filtering
  if (startDate || endDate) {
    where.plannedEnd = {};
    if (startDate) where.plannedEnd.gte = startDate;
    if (endDate) where.plannedEnd.lte = endDate;
  }

  // Pending approvals for the currently authenticated requester
  if (pendingMyApproval && typeof pendingMyApproval === 'string' && pendingMyApproval.length === 36) {
    where.requesterId = pendingMyApproval; // injected by middleware / controller
    where.status = 'PENDING_APPROVAL';
  }

  // Expiring soon: permits active within the next X hours (e.g., 2)
  if (expiringSoon) {
    // TODO: inject a time window from the caller (e.g., 2 hours from now)
    const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000);
    where.status = 'ACTIVE';
    where.plannedEnd = {
      lte: twoHoursFromNow,
    };
  }

  return where;
}

/* ---------- ACTION HANDLERS ---------- */

export async function submitPermit(
  permitId: string,
  requesterId: string,
): Promise<{ permitId: string; toStatus: PermitStatus; event: string; warnings: any[] }> {
  const permit = await prisma.permit.findUnique({ where: { id: permitId } });
  if (!permit) {
    throw new PrismaClientKnownRequestError('Permit not found', {
      code: 'P2025',
      clientVersion: '',
      meta: { model: 'Permit' },
    });
  }

  const snapshot = await loadPermit(permitId);

  // Only the requester can submit their own permit
  if (snapshot.status !== 'DRAFT') {
    throw new PermitDomainError(
      'INVALID_TRANSITION',
      `Permit is in ${snapshot.status} status, cannot submit`,
    );
  }

  const conflicts = await detectPermitConflicts(permit);

  const result = transition(
    {
      status: snapshot.status,
      plannedStart: snapshot.plannedStart,
      plannedEnd: snapshot.plannedEnd,
      allRequiredApprovalsGranted: false,
    },
    { action: 'SUBMIT', now: new Date() },
  );

  // Persist the state change + audit row in one transaction
  await prisma.$transaction(async (tx) => {
    await tx.permit.update({
      where: { id: permitId },
      data: { status: result.to },
    });
    await tx.auditLog.create({
      data: {
        permitId,
        actorId: requesterId,
        event: result.event,
        fromStatus: result.from,
        toStatus: result.to,
        metadata: conflicts.length > 0 ? { conflicts } : {},
      },
    });
  });

  return { permitId, toStatus: result.to, event: result.event, warnings: conflicts };
}

export async function approvePermit(
  permitId: string,
  approverId: string,
  reason?: string,
): Promise<{ permitId: string; toStatus: PermitStatus; event: string }> {
  await processExpiredPermits();
  const permit = await prisma.permit.findUnique({
    where: { id: permitId },
    include: { approvals: true },
  });

  if (!permit) {
    throw new PrismaClientKnownRequestError('Permit not found', {
      code: 'P2025',
      clientVersion: '',
      meta: { model: 'Permit' },
    });
  }

  if (permit.status !== 'PENDING_APPROVAL') {
    throw new PermitDomainError(
      'INVALID_TRANSITION',
      `Cannot approve permit in ${permit.status} status`,
    );
  }

  if (permit.requesterId === approverId) {
    const err: any = new Error('Requester cannot approve their own permit');
    err.code = 'SELF_APPROVAL_NOT_ALLOWED';
    err.httpStatus = 403;
    throw err;
  }

  const approver = await prisma.user.findUnique({
    where: { id: approverId },
  });

  if (!approver) {
    const err: any = new Error('Approver user not found');
    err.code = 'UNAUTHORIZED';
    err.httpStatus = 403;
    throw err;
  }

  let approvalRole: ApprovalRole = 'AREA_OWNER';
  if (approver.role === 'SAFETY_OFFICER' || approver.role === 'ADMIN') {
    approvalRole = 'SAFETY_OFFICER';
  } else if (approver.role === 'AREA_OWNER') {
    approvalRole = 'AREA_OWNER';
    const isOwner = await prisma.areaOwner.findUnique({
      where: {
        areaId_userId: {
          areaId: permit.areaId,
          userId: approverId,
        },
      },
    });
    if (!isOwner) {
      const err: any = new Error('Area Owner can only approve permits within their assigned area');
      err.code = 'AREA_MISMATCH';
      err.httpStatus = 403;
      throw err;
    }
  }

  let finalStatus: PermitStatus = 'PENDING_APPROVAL';

  await prisma.$transaction(async (tx) => {
    await tx.permitApproval.upsert({
      where: {
        permitId_role: {
          permitId,
          role: approvalRole,
        },
      },
      create: {
        permitId,
        role: approvalRole,
        approverId,
        decision: 'APPROVED',
        comment: reason,
      },
      update: {
        approverId,
        decision: 'APPROVED',
        comment: reason,
        decidedAt: new Date(),
      },
    });

    const currentApprovals = await tx.permitApproval.findMany({
      where: { permitId },
    });

    const hasAreaOwnerApproved = currentApprovals.some(
      (a) => a.role === 'AREA_OWNER' && a.decision === 'APPROVED',
    );
    const hasSafetyApproved = currentApprovals.some(
      (a) => a.role === 'SAFETY_OFFICER' && a.decision === 'APPROVED',
    );

    if (hasAreaOwnerApproved && hasSafetyApproved) {
      finalStatus = 'APPROVED';
      await tx.permit.update({
        where: { id: permitId },
        data: { status: 'APPROVED' },
      });
    }

    await tx.auditLog.create({
      data: {
        permitId,
        actorId: approverId,
        event: AuditEvent.APPROVED,
        fromStatus: permit.status,
        toStatus: finalStatus,
        reason,
        metadata: { role: approvalRole },
      },
    });
  });

  return { permitId, toStatus: finalStatus, event: AuditEvent.APPROVED };
}

export async function rejectPermit(
  permitId: string,
  approverId: string,
  reason: string,
): Promise<{ permitId: string; toStatus: PermitStatus; event: string }> {
  await processExpiredPermits();
  const permit = await prisma.permit.findUnique({
    where: { id: permitId },
  });

  if (!permit) {
    throw new PrismaClientKnownRequestError('Permit not found', {
      code: 'P2025',
      clientVersion: '',
      meta: { model: 'Permit' },
    });
  }

  if (permit.status !== 'PENDING_APPROVAL') {
    throw new PermitDomainError(
      'INVALID_TRANSITION',
      `Cannot reject permit in ${permit.status} status`,
    );
  }

  if (permit.requesterId === approverId) {
    const err: any = new Error('Requester cannot reject their own permit');
    err.code = 'SELF_APPROVAL_NOT_ALLOWED';
    err.httpStatus = 403;
    throw err;
  }

  const approver = await prisma.user.findUnique({
    where: { id: approverId },
  });

  if (!approver) {
    const err: any = new Error('Approver user not found');
    err.code = 'UNAUTHORIZED';
    err.httpStatus = 403;
    throw err;
  }

  let approvalRole: ApprovalRole = 'AREA_OWNER';
  if (approver.role === 'SAFETY_OFFICER' || approver.role === 'ADMIN') {
    approvalRole = 'SAFETY_OFFICER';
  } else if (approver.role === 'AREA_OWNER') {
    approvalRole = 'AREA_OWNER';
    const isOwner = await prisma.areaOwner.findUnique({
      where: {
        areaId_userId: {
          areaId: permit.areaId,
          userId: approverId,
        },
      },
    });
    if (!isOwner) {
      const err: any = new Error('Area Owner can only reject permits within their assigned area');
      err.code = 'AREA_MISMATCH';
      err.httpStatus = 403;
      throw err;
    }
  }

  const result = transition(
    {
      status: permit.status,
      plannedStart: permit.plannedStart,
      plannedEnd: permit.plannedEnd,
      allRequiredApprovalsGranted: false,
    },
    { action: 'REJECT', now: new Date(), reason },
  );

  await prisma.$transaction(async (tx) => {
    await tx.permitApproval.upsert({
      where: {
        permitId_role: {
          permitId,
          role: approvalRole,
        },
      },
      create: {
        permitId,
        role: approvalRole,
        approverId,
        decision: 'REJECTED',
        comment: reason,
      },
      update: {
        approverId,
        decision: 'REJECTED',
        comment: reason,
        decidedAt: new Date(),
      },
    });

    await tx.permit.update({
      where: { id: permitId },
      data: { status: result.to },
    });

    await tx.auditLog.create({
      data: {
        permitId,
        actorId: approverId,
        event: result.event,
        fromStatus: result.from,
        toStatus: result.to,
        reason,
        metadata: { role: approvalRole },
      },
    });
  });

  return { permitId, toStatus: result.to, event: result.event };
}

export async function activatePermit(
  permitId: string,
  activatorId: string,
): Promise<{ permitId: string; toStatus: PermitStatus; event: string }> {
  await processExpiredPermits();
  // Load with approvals check
  const permit = await prisma.permit.findUnique({
    where: { id: permitId },
    include: { approvals: true },
  });

  if (!permit) {
    throw new PrismaClientKnownRequestError('Permit not found', {
      code: 'P2025',
      clientVersion: '',
      meta: { model: 'Permit' },
    });
  }

  if (permit.status !== 'APPROVED') {
    throw new PermitDomainError(
      'INVALID_TRANSITION',
      `Cannot activate permit in ${permit.status} status`,
    );
  }

  // Check all required approvals are granted
  const allApproved = permit.approvals.every((a) => a.decision === 'APPROVED');
  if (!allApproved) {
    throw new PermitDomainError(
      'MISSING_APPROVALS',
      'Cannot activate: not all required approvals have been granted.',
    );
  }

  // Check activation window
  const now = new Date();
  if (now < permit.plannedStart) {
    throw new PermitDomainError(
      'ACTIVATION_TOO_EARLY',
      `Cannot activate before planned start (${permit.plannedStart.toISOString()}).`,
    );
  }
  if (now >= permit.plannedEnd) {
    throw new PermitDomainError(
      'ACTIVATION_WINDOW_PASSED',
      `Cannot activate after planned end (${permit.plannedEnd.toISOString()}). Raise a new permit.`,
    );
  }

  const result = transition(
    {
      status: permit.status,
      plannedStart: permit.plannedStart,
      plannedEnd: permit.plannedEnd,
      allRequiredApprovalsGranted: true,
    },
    { action: 'ACTIVATE', now },
  );

  await prisma.$transaction(async (tx) => {
    await tx.permit.update({
      where: { id: permitId },
      data: { status: result.to, activatedAt: now },
    });
    await tx.auditLog.create({
      data: {
        permitId,
        actorId: activatorId,
        event: result.event,
        fromStatus: result.from,
        toStatus: result.to,
        metadata: {},
      },
    });
  });

  return { permitId, toStatus: result.to, event: result.event };
}

export async function suspendPermit(
  permitId: string,
  suspenderId: string,
  reason: string,
): Promise<{ permitId: string; toStatus: PermitStatus; event: string }> {
  const snapshot = await loadPermit(permitId);
  const suspender = await prisma.user.findUnique({ where: { id: suspenderId } });
  if (!suspender || (suspender.role !== 'SAFETY_OFFICER' && suspender.role !== 'ADMIN')) {
    throw new PermitDomainError('UNAUTHORIZED', 'Only Safety Officer or Admin can suspend');
  }

  if (snapshot.status !== 'ACTIVE') {
    throw new PermitDomainError(
      'INVALID_TRANSITION',
      `Cannot suspend permit in ${snapshot.status} status. Only ACTIVE permits can be suspended.`,
    );
  }

  const result = transition(
    {
      status: snapshot.status,
      plannedStart: snapshot.plannedStart,
      plannedEnd: snapshot.plannedEnd,
      allRequiredApprovalsGranted: snapshot.allRequiredApprovalsGranted,
    },
    { action: 'SUSPEND', now: new Date(), reason },
  );

  await prisma.$transaction(async (tx) => {
    await tx.permit.update({
      where: { id: permitId },
      data: { status: result.to },
    });
    await tx.auditLog.create({
      data: {
        permitId,
        actorId: suspenderId,
        event: result.event,
        fromStatus: result.from,
        toStatus: result.to,
        reason,
        metadata: {},
      },
    });
  });

  return { permitId, toStatus: result.to, event: result.event };
}

export async function resumePermit(
  permitId: string,
  resumerId: string,
): Promise<{ permitId: string; toStatus: PermitStatus; event: string }> {
  const snapshot = await loadPermit(permitId);
  const resumer = await prisma.user.findUnique({ where: { id: resumerId } });
  if (!resumer || (resumer.role !== 'SAFETY_OFFICER' && resumer.role !== 'ADMIN')) {
    throw new PermitDomainError('UNAUTHORIZED', 'Only Safety Officer or Admin can resume');
  }

  if (snapshot.status !== 'SUSPENDED') {
    throw new PermitDomainError(
      'INVALID_TRANSITION',
      `Cannot resume permit in ${snapshot.status} status. Only SUSPENDED permits can be resumed.`,
    );
  }

  // Check approvals are still intact
  const allApproved = snapshot.allRequiredApprovalsGranted;
  if (!allApproved) {
    throw new PermitDomainError(
      'MISSING_APPROVALS',
      'Cannot resume: required approvals are no longer intact.',
    );
  }

  // Check window has not passed
  const now = new Date();
  if (now >= snapshot.plannedEnd) {
    throw new PermitDomainError(
      'ACTIVATION_WINDOW_PASSED',
      `Cannot resume after planned end (${snapshot.plannedEnd.toISOString()}). The permit must expire.`,
    );
  }

  const result = transition(
    {
      status: snapshot.status,
      plannedStart: snapshot.plannedStart,
      plannedEnd: snapshot.plannedEnd,
      allRequiredApprovalsGranted: snapshot.allRequiredApprovalsGranted,
    },
    { action: 'RESUME', now },
  );

  await prisma.$transaction(async (tx) => {
    await tx.permit.update({
      where: { id: permitId },
      data: { status: result.to },
    });
    await tx.auditLog.create({
      data: {
        permitId,
        actorId: resumerId,
        event: result.event,
        fromStatus: result.from,
        toStatus: result.to,
        metadata: {},
      },
    });
  });

  return { permitId, toStatus: result.to, event: result.event };
}

export async function closePermit(
  permitId: string,
  closerId: string,
  reason?: string,
): Promise<{ permitId: string; toStatus: PermitStatus; event: string }> {
  const permit = await prisma.permit.findUnique({
    where: { id: permitId },
  });

  if (!permit) {
    throw new PrismaClientKnownRequestError('Permit not found', {
      code: 'P2025',
      clientVersion: '',
      meta: { model: 'Permit' },
    });
  }

  const closer = await prisma.user.findUnique({
    where: { id: closerId },
  });

  if (!closer) {
    const err: any = new Error('User not found');
    err.code = 'UNAUTHORIZED';
    err.httpStatus = 403;
    throw err;
  }

  if (permit.requesterId !== closerId && closer.role !== 'ADMIN') {
    const err: any = new Error('Only the permit requester or an Admin can mark work complete and close the permit');
    err.code = 'FORBIDDEN';
    err.httpStatus = 403;
    throw err;
  }

  const snapshot = await loadPermit(permitId);

  if (snapshot.status !== 'ACTIVE') {
    throw new PermitDomainError(
      'INVALID_TRANSITION',
      `Cannot close permit in ${snapshot.status} status. Only ACTIVE permits can be closed.`,
    );
  }

  const now = new Date();
  const result = transition(
    {
      status: snapshot.status,
      plannedStart: snapshot.plannedStart,
      plannedEnd: snapshot.plannedEnd,
      allRequiredApprovalsGranted: snapshot.allRequiredApprovalsGranted,
    },
    { action: 'CLOSE', now, reason },
  );

  await prisma.$transaction(async (tx) => {
    await tx.permit.update({
      where: { id: permitId },
      data: {
        status: result.to,
        closedAt: now,
        closureNotes: reason || null,
      },
    });
    await tx.auditLog.create({
      data: {
        permitId,
        actorId: closerId,
        event: result.event,
        fromStatus: result.from,
        toStatus: result.to,
        reason: reason || null,
        metadata: {},
      },
    });
  });

  return { permitId, toStatus: result.to, event: result.event };
}

export async function verifyClosure(
  permitId: string,
  verifierId: string,
  reason?: string,
): Promise<{ permitId: string; toStatus: PermitStatus; event: string }> {
  const permit = await prisma.permit.findUnique({
    where: { id: permitId },
  });

  if (!permit) {
    throw new PrismaClientKnownRequestError('Permit not found', {
      code: 'P2025',
      clientVersion: '',
      meta: { model: 'Permit' },
    });
  }

  const verifier = await prisma.user.findUnique({
    where: { id: verifierId },
  });

  if (!verifier) {
    const err: any = new Error('User not found');
    err.code = 'UNAUTHORIZED';
    err.httpStatus = 403;
    throw err;
  }

  if (verifier.role !== 'SAFETY_OFFICER' && verifier.role !== 'ADMIN') {
    const err: any = new Error('Only a Safety Officer or Admin can verify permit closure');
    err.code = 'FORBIDDEN';
    err.httpStatus = 403;
    throw err;
  }

  const snapshot = await loadPermit(permitId);

  if (snapshot.status !== 'CLOSED') {
    throw new PermitDomainError(
      'INVALID_TRANSITION',
      `Cannot verify closure on permit in ${snapshot.status} status. Only CLOSED permits can be verified.`,
    );
  }

  const now = new Date();
  const result = transition(
    {
      status: snapshot.status,
      plannedStart: snapshot.plannedStart,
      plannedEnd: snapshot.plannedEnd,
      allRequiredApprovalsGranted: snapshot.allRequiredApprovalsGranted,
    },
    { action: 'VERIFY_CLOSURE', now, reason },
  );

  await prisma.$transaction(async (tx) => {
    await tx.permit.update({
      where: { id: permitId },
      data: {
        status: result.to,
        verifiedAt: now,
      },
    });
    await tx.auditLog.create({
      data: {
        permitId,
        actorId: verifierId,
        event: result.event,
        fromStatus: result.from,
        toStatus: result.to,
        reason: reason || null,
        metadata: {},
      },
    });
  });

  return { permitId, toStatus: result.to, event: result.event };
}

export async function cancelPermit(
  permitId: string,
  cancellerId: string,
  reason: string,
): Promise<{ permitId: string; toStatus: PermitStatus; event: string }> {
  const snapshot = await loadPermit(permitId);
  const permit = await prisma.permit.findUnique({ where: { id: permitId } });
  if (!permit) throw new PrismaClientKnownRequestError('Not found', { code: 'P2025', clientVersion: '', meta: {} });

  // Authorization: only requester or admin can cancel; not on terminal states
  const canceller = await prisma.user.findUnique({ where: { id: cancellerId } });
  if (!canceller) throw new PermitDomainError('UNAUTHORIZED', 'User not found');
  const isRequester = permit.requesterId === cancellerId;
  const isAdmin = canceller.role === 'ADMIN';
  if (!isRequester && !isAdmin) {
    throw new PermitDomainError('UNAUTHORIZED', 'Only requester or admin can cancel');
  }

  if (snapshot.status === 'EXPIRED' || snapshot.status === 'CLOSED_VERIFIED') {
    throw new PermitDomainError(
      'INVALID_TRANSITION',
      `Cannot cancel a ${snapshot.status} permit.`,
    );
  }

  const result = transition(
    {
      status: snapshot.status,
      plannedStart: snapshot.plannedStart,
      plannedEnd: snapshot.plannedEnd,
      allRequiredApprovalsGranted: snapshot.allRequiredApprovalsGranted,
    },
    { action: 'CANCEL', now: new Date(), reason },
  );

  await prisma.$transaction(async (tx) => {
    await tx.permit.update({
      where: { id: permitId },
      data: { status: result.to },
    });
    await tx.auditLog.create({
      data: {
        permitId,
        actorId: cancellerId,
        event: result.event,
        fromStatus: result.from,
        toStatus: result.to,
        reason,
        metadata: {},
      },
    });
  });

  return { permitId, toStatus: result.to, event: result.event };
}

export async function expirePermit(permitId: string, expirerId?: string): Promise<{ permitId: string; toStatus: PermitStatus; event: string }> {
  const permit = await prisma.permit.findUnique({
    where: { id: permitId },
    include: { approvals: true },
  });

  if (!permit) {
    throw new PrismaClientKnownRequestError('Permit not found', {
      code: 'P2025',
      clientVersion: '',
      meta: { model: 'Permit' },
    });
  }

  const snapshot = {
    status: permit.status,
    plannedStart: permit.plannedStart,
    plannedEnd: permit.plannedEnd,
    allRequiredApprovalsGranted: permit.approvals.every(
      (a) => a.decision === 'APPROVED',
    ),
  };

  // Cannot expire DRAFT, CLOSED, or already-terminal permits
  if (!isAllowedTransition(snapshot.status, 'EXPIRE')) {
    throw new PermitDomainError(
      'INVALID_TRANSITION',
      `Cannot expire a permit in ${snapshot.status} status.`,
    );
  }

  const result = maybeExpire(snapshot, new Date());

  if (!result) {
    // Either still inside the window, or EXPIRE is not legal from this status
    throw new PermitDomainError(
      'INVALID_TRANSITION',
      `Cannot expire permit in ${snapshot.status} status at this time.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.permit.update({
      where: { id: permitId },
      data: { status: result.to },
    });
    await tx.auditLog.create({
      data: {
        permitId,
        actorId: expirerId,
        event: result.event,
        fromStatus: result.from,
        toStatus: result.to,
        metadata: {},
      },
    });
  });

  return { permitId, toStatus: result.to, event: result.event };
}

/* ---------- QUERY HANDLERS ---------- */

export async function getPermits({
  status,
  type,
  plantId,
  areaId,
  startDate,
  endDate,
  pendingMyApproval,
  expiringSoon,
  page = '1',
  limit = '20',
}: {
  status?: string;
  type?: string;
  plantId?: string;
  areaId?: string;
  startDate?: string;
  endDate?: string;
  pendingMyApproval?: string;
  expiringSoon?: string;
  page?: string;
  limit?: string;
}) {
  await processExpiredPermits();
  const where = buildPermitFilter({
    status,
    type,
    plantId,
    areaId,
    startDate,
    endDate,
    pendingMyApproval,
    expiringSoon,
  });

  const pageNum = parseInt(page, 10);
  const pageSize = parseInt(limit, 10);
  const skip = (pageNum - 1) * pageSize;

  const [permits, total] = await prisma.$transaction([
    prisma.permit.findMany({
      where,
      include: {
        requester: { select: { id: true, name: true, email: true } },
        area: { include: { plant: true } },
        equipment: true,
        approvals: {
          include: {
            approver: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.permit.count({ where }),
  ]);

  return {
    data: permits,
    total,
    page: pageNum,
    pages: Math.ceil(total / pageSize),
  };
}

export async function getPermit(permitId: string) {
  await processExpiredPermits();
  const permit = await prisma.permit.findUnique({
    where: { id: permitId },
    include: {
      requester: { select: { id: true, name: true, email: true, role: true } },
      area: { include: { plant: true } },
      equipment: true,
      approvals: {
        include: {
          approver: { select: { id: true, name: true, email: true, role: true } },
        },
      },
      auditLogs: {
        include: {
          actor: { select: { id: true, name: true, email: true, role: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!permit) {
    return null;
  }

  return permit;
}

export async function checkActivationReadiness(
  permitId: string,
): Promise<{
  isReady: boolean;
  canActivate: boolean;
  reason?: string;
  allApprovalsGranted: boolean;
  now: Date;
}> {
  const permit = await prisma.permit.findUnique({
    where: { id: permitId },
    include: { approvals: true },
  });

  if (!permit) {
    throw new PrismaClientKnownRequestError('Permit not found', {
      code: 'P2025',
      clientVersion: '',
      meta: { model: 'Permit' },
    });
  }

  const now = new Date();
  const allApproved = permit.approvals.every((a) => a.decision === 'APPROVED');

  if (permit.status !== 'APPROVED') {
    return {
      isReady: false,
      canActivate: false,
      reason: `Permit is in ${permit.status} status, not APPROVED`,
      allApprovalsGranted: false,
      now,
    };
  }

  if (now < permit.plannedStart) {
    return {
      isReady: false,
      canActivate: false,
      reason: `Cannot activate before planned start (${permit.plannedStart.toISOString()})`,
      allApprovalsGranted: true,
      now,
    };
  }

  if (now >= permit.plannedEnd) {
    return {
      isReady: false,
      canActivate: false,
      reason: `Cannot activate after planned end (${permit.plannedEnd.toISOString()}). Raise a new permit.`,
      allApprovalsGranted: true,
      now,
    };
  }

  return {
    isReady: true,
    canActivate: true,
    allApprovalsGranted: true,
    now,
  };
}

export async function createPermit(data: any, requesterId: string) {
  const permitNumber = `PTW-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  const conflicts = await detectPermitConflicts(data);

  return prisma.$transaction(async (tx) => {
    const permit = await tx.permit.create({
      data: {
        ...data,
        permitNumber,
        requesterId,
        status: 'DRAFT',
      },
    });

    await tx.auditLog.create({
      data: {
        permitId: permit.id,
        actorId: requesterId,
        event: AuditEvent.CREATED,
        toStatus: 'DRAFT',
        metadata: conflicts.length > 0 ? { conflicts } : {},
      },
    });

    return { ...permit, warnings: conflicts };
  });
}

export async function updatePermit(permitId: string, data: any, requesterId: string) {
  const permit = await prisma.permit.findUnique({ where: { id: permitId } });

  if (!permit) {
    throw new PrismaClientKnownRequestError('Permit not found', {
      code: 'P2025',
      clientVersion: '',
      meta: { model: 'Permit' },
    });
  }

  if (permit.status !== 'DRAFT') {
    throw new PermitDomainError('INVALID_TRANSITION', 'Only DRAFT permits can be updated.');
  }

  if (permit.requesterId !== requesterId) {
    throw new PermitDomainError('INVALID_TRANSITION', 'Only the original requester can update this draft.');
  }

  const allowedFields = ['workDescription', 'plannedStart', 'plannedEnd', 'contractorTeam', 'hazards', 'ppe', 'precautions', 'typeData', 'equipmentId'];
  const sanitized: any = {};
  for (const k of allowedFields) {
    if (k in data) sanitized[k] = data[k];
  }

  const updatedPermitData = { ...permit, ...sanitized };
  const conflicts = await detectPermitConflicts(updatedPermitData);

  const updatedPermit = await prisma.permit.update({
    where: { id: permitId },
    data: sanitized,
  });
  });

  return { ...updatedPermit, warnings: conflicts };
}

export async function logWork(permitId: string, actorId: string, notes: string, hours?: number) {
  await processExpiredPermits();
  const permit = await prisma.permit.findUnique({ where: { id: permitId } });

  if (!permit) {
    throw new PrismaClientKnownRequestError('Permit not found', {
      code: 'P2025',
      clientVersion: '',
      meta: { model: 'Permit' },
    });
  }

  assertWorkMayBeLogged(permit.status);

  return prisma.auditLog.create({
    data: {
      permitId,
      actorId,
      event: AuditEvent.WORK_LOGGED,
      metadata: { notes, hours },
    },
  });
}
