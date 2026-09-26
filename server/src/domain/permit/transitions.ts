import { PermitDomainError } from './errors';
import {
  CANCELLABLE_STATUSES,
  EXPIRABLE_STATUSES,
  isTerminal,
  type AuditEvent,
  type PermitStatus,
} from './statuses';

/**
 * Intentional actions a caller can request. The client never sends a
 * target status; it sends an action. The domain decides the next status.
 * This is what "do not allow `permit.status = requestedStatus`" means.
 */
export const PERMIT_ACTIONS = [
  'SUBMIT',
  'APPROVE',
  'REJECT',
  'ACTIVATE',
  'SUSPEND',
  'RESUME',
  'CLOSE',
  'VERIFY_CLOSURE',
  'CANCEL',
  'EXPIRE',
] as const;

export type PermitAction = (typeof PERMIT_ACTIONS)[number];

/**
 * Allowed (from, action) → to. Completeness of this table is the contract.
 * Anything not listed is illegal, including "skip a step" and "resurrect
 * a terminal permit".
 *
 * CANCEL is special: it is legal from every non-terminal, non-CLOSED
 * status (see CANCELLABLE_STATUSES). EXPIRE is legal from every
 * EXPIRABLE_STATUS. Both are generated below rather than duplicated.
 */
const EXPLICIT_TRANSITIONS: ReadonlyArray<{
  from: PermitStatus;
  action: PermitAction;
  to: PermitStatus;
  event: AuditEvent;
}> = [
  { from: 'DRAFT', action: 'SUBMIT', to: 'PENDING_APPROVAL', event: 'SUBMITTED' },
  { from: 'PENDING_APPROVAL', action: 'APPROVE', to: 'APPROVED', event: 'APPROVED' },
  { from: 'PENDING_APPROVAL', action: 'REJECT', to: 'REJECTED', event: 'REJECTED' },
  { from: 'APPROVED', action: 'ACTIVATE', to: 'ACTIVE', event: 'ACTIVATED' },
  { from: 'ACTIVE', action: 'SUSPEND', to: 'SUSPENDED', event: 'SUSPENDED' },
  { from: 'SUSPENDED', action: 'RESUME', to: 'ACTIVE', event: 'RESUMED' },
  { from: 'ACTIVE', action: 'CLOSE', to: 'CLOSED', event: 'CLOSED' },
  { from: 'CLOSED', action: 'VERIFY_CLOSURE', to: 'CLOSED_VERIFIED', event: 'CLOSURE_VERIFIED' },
];

const CANCEL_TRANSITIONS = CANCELLABLE_STATUSES.map((from) => ({
  from,
  action: 'CANCEL' as const,
  to: 'CANCELLED' as const,
  event: 'CANCELLED' as const,
}));

const EXPIRE_TRANSITIONS = EXPIRABLE_STATUSES.map((from) => ({
  from,
  action: 'EXPIRE' as const,
  to: 'EXPIRED' as const,
  event: 'EXPIRED' as const,
}));

export const ALLOWED_TRANSITIONS = [
  ...EXPLICIT_TRANSITIONS,
  ...CANCEL_TRANSITIONS,
  ...EXPIRE_TRANSITIONS,
] as const;

export type AllowedTransition = (typeof ALLOWED_TRANSITIONS)[number];

export function findTransition(
  from: PermitStatus,
  action: PermitAction,
): AllowedTransition | undefined {
  return ALLOWED_TRANSITIONS.find((t) => t.from === from && t.action === action);
}

export function isAllowedTransition(from: PermitStatus, action: PermitAction): boolean {
  return findTransition(from, action) !== undefined;
}

/** Snapshot the domain needs to decide. Callers map from Prisma / HTTP. */
export interface PermitSnapshot {
  status: PermitStatus;
  plannedStart: Date;
  plannedEnd: Date;
  /** True only when every required approval slot is APPROVED. */
  allRequiredApprovalsGranted: boolean;
}

export interface TransitionInput {
  action: PermitAction;
  /** Wall clock. Injected so tests can freeze time. Never `new Date()` inside. */
  now: Date;
  /** Mandatory for REJECT, SUSPEND, CANCEL. Ignored otherwise. */
  reason?: string;
}

export interface TransitionResult {
  from: PermitStatus;
  to: PermitStatus;
  action: PermitAction;
  event: AuditEvent;
  reason?: string;
  at: Date;
}

function requireReason(action: PermitAction, reason: string | undefined): string {
  const trimmed = reason?.trim() ?? '';
  if (!trimmed) {
    throw new PermitDomainError(
      'REASON_REQUIRED',
      `${action} requires a reason. The plant needs to know why work stopped or was refused.`,
    );
  }
  return trimmed;
}

function assertWindowForActivation(permit: PermitSnapshot, now: Date): void {
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
}

/**
 * The only function that may produce a new permit status.
 *
 * Callers (HTTP handlers, cron, seed) MUST:
 *   1. Load the current permit.
 *   2. Call `transition(permit, input)`.
 *   3. Persist `{ status: result.to }` AND an audit-log row inside one
 *      transaction. Never write `status` without the matching audit row.
 *
 * They MUST NOT:
 *   - Accept a target status from the client.
 *   - Write `permit.status = requestedStatus`.
 */
export function transition(permit: PermitSnapshot, input: TransitionInput): TransitionResult {
  const { action, now } = input;

  if (isTerminal(permit.status) && action !== 'EXPIRE') {
    // EXPIRE on an already-terminal permit is still illegal (EXPIRED → EXPIRED
    // is not in the table). This branch just produces a clearer message for
    // the common "try to resurrect" case.
    if (permit.status === 'EXPIRED' && action === 'ACTIVATE') {
      throw new PermitDomainError(
        'PERMIT_EXPIRED',
        'An expired permit can never be reactivated. Raise a new permit.',
      );
    }
  }

  const edge = findTransition(permit.status, action);
  if (!edge) {
    throw new PermitDomainError(
      'INVALID_TRANSITION',
      `Action ${action} is not legal from status ${permit.status}.`,
    );
  }

  if (action === 'ACTIVATE') {
    if (!permit.allRequiredApprovalsGranted) {
      throw new PermitDomainError(
        'MISSING_APPROVALS',
        'Cannot activate until every required approver has approved.',
      );
    }
    assertWindowForActivation(permit, now);
  }

  if (action === 'RESUME') {
    // Resume is "activate again". The same clock and approval rules apply:
    // you cannot resume a window that has already ended, and you cannot
    // resume if approvals somehow vanished (they shouldn't).
    if (!permit.allRequiredApprovalsGranted) {
      throw new PermitDomainError(
        'MISSING_APPROVALS',
        'Cannot resume until every required approver has approved.',
      );
    }
    if (now >= permit.plannedEnd) {
      throw new PermitDomainError(
        'ACTIVATION_WINDOW_PASSED',
        `Cannot resume after planned end (${permit.plannedEnd.toISOString()}). The permit must expire.`,
      );
    }
  }

  let reason: string | undefined;
  if (action === 'REJECT' || action === 'SUSPEND' || action === 'CANCEL') {
    reason = requireReason(action, input.reason);
  }

  return {
    from: edge.from,
    to: edge.to,
    action: edge.action,
    event: edge.event,
    reason,
    at: now,
  };
}

/**
 * Guard for work logs / entry-exit / gas retests. Not a status transition,
 * but it lives here because "work requires ACTIVE" is a lifecycle rule,
 * not an HTTP rule.
 */
export function assertWorkMayBeLogged(status: PermitStatus): void {
  if (status !== 'ACTIVE') {
    throw new PermitDomainError(
      'NOT_ACTIVE',
      `Work cannot be logged against a permit in ${status}. Only ACTIVE permits accept work logs.`,
    );
  }
}

/**
 * Used by the expiry worker and the lazy-on-read path. Returns a result
 * if the window has passed and the permit is still expirably live;
 * otherwise null (already terminal, or still inside the window, or DRAFT).
 */
export function maybeExpire(permit: PermitSnapshot, now: Date): TransitionResult | null {
  if (now < permit.plannedEnd) return null;
  if (!isAllowedTransition(permit.status, 'EXPIRE')) return null;
  return transition(permit, { action: 'EXPIRE', now });
}
