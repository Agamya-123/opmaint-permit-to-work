/**
 * Typed domain errors for permit transitions.
 *
 * Codes are stable. The HTTP layer maps them; it does not invent new ones.
 * 409 = the permit's current state / clock forbids the action.
 * 400 = the request itself is malformed (missing reason).
 */

export const PERMIT_ERROR_CODES = [
  'INVALID_TRANSITION',
  'MISSING_APPROVALS',
  'ACTIVATION_TOO_EARLY',
  'ACTIVATION_WINDOW_PASSED',
  'PERMIT_EXPIRED',
  'NOT_ACTIVE',
  'REASON_REQUIRED',
] as const;

export type PermitErrorCode = (typeof PERMIT_ERROR_CODES)[number];

export class PermitDomainError extends Error {
  readonly code: PermitErrorCode;
  readonly httpStatus: 400 | 409;

  constructor(code: PermitErrorCode, message: string) {
    super(message);
    this.name = 'PermitDomainError';
    this.code = code;
    this.httpStatus = code === 'REASON_REQUIRED' ? 400 : 409;
  }
}

export function isPermitDomainError(error: unknown): error is PermitDomainError {
  return error instanceof PermitDomainError;
}
