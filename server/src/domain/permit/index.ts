export { PermitDomainError, isPermitDomainError, PERMIT_ERROR_CODES } from './errors';
export type { PermitErrorCode } from './errors';

export {
  PERMIT_STATUSES,
  TERMINAL_STATUSES,
  CANCELLABLE_STATUSES,
  EXPIRABLE_STATUSES,
  AUDIT_EVENTS,
  isTerminal,
} from './statuses';
export type { PermitStatus, TerminalStatus, AuditEvent } from './statuses';

export {
  PERMIT_ACTIONS,
  ALLOWED_TRANSITIONS,
  findTransition,
  isAllowedTransition,
  transition,
  assertWorkMayBeLogged,
  maybeExpire,
} from './transitions';
export type {
  PermitAction,
  AllowedTransition,
  PermitSnapshot,
  TransitionInput,
  TransitionResult,
} from './transitions';
