/**
 * Domain vocabulary for the permit lifecycle.
 *
 * These unions are owned by the domain layer, not by Prisma. The Prisma enums
 * in schema.prisma MUST stay in lockstep with these (same names, same values).
 * Duplicating them is deliberate: unit tests of the state machine must not
 * require a generated client or a running database.
 */

export const PERMIT_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'ACTIVE',
  'SUSPENDED',
  'EXPIRED',
  'REJECTED',
  'CLOSED',
  'CLOSED_VERIFIED',
  'CANCELLED',
] as const;

export type PermitStatus = (typeof PERMIT_STATUSES)[number];

/** Dead. Nothing legal remains except reading the record. */
export const TERMINAL_STATUSES = [
  'EXPIRED',
  'REJECTED',
  'CLOSED_VERIFIED',
  'CANCELLED',
] as const satisfies readonly PermitStatus[];

export type TerminalStatus = (typeof TERMINAL_STATUSES)[number];

export function isTerminal(status: PermitStatus): status is TerminalStatus {
  return (TERMINAL_STATUSES as readonly PermitStatus[]).includes(status);
}

/**
 * States a requester / area owner / safety officer may still cancel.
 * CLOSED is excluded: it is waiting for verification, not abandonment
 * (domain decision D7).
 */
export const CANCELLABLE_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'ACTIVE',
  'SUSPENDED',
] as const satisfies readonly PermitStatus[];

/**
 * States whose validity window still matters. When planned_end passes,
 * these become EXPIRED (domain decision D8). DRAFT is excluded: an
 * unsubmitted form is not an authorization and does not "expire".
 */
export const EXPIRABLE_STATUSES = [
  'PENDING_APPROVAL',
  'APPROVED',
  'ACTIVE',
  'SUSPENDED',
] as const satisfies readonly PermitStatus[];

export const AUDIT_EVENTS = [
  'CREATED',
  'UPDATED',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'ACTIVATED',
  'SUSPENDED',
  'RESUMED',
  'CLOSED',
  'CLOSURE_VERIFIED',
  'CANCELLED',
  'EXPIRED',
  'WORK_LOGGED',
] as const;

export type AuditEvent = (typeof AUDIT_EVENTS)[number];
