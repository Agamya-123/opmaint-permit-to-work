import { describe, expect, it } from 'vitest';
import { PermitDomainError } from './errors';
import {
  CANCELLABLE_STATUSES,
  EXPIRABLE_STATUSES,
  PERMIT_STATUSES,
  TERMINAL_STATUSES,
  type PermitStatus,
} from './statuses';
import {
  ALLOWED_TRANSITIONS,
  assertWorkMayBeLogged,
  isAllowedTransition,
  maybeExpire,
  PERMIT_ACTIONS,
  transition,
  type PermitAction,
  type PermitSnapshot,
} from './transitions';

const T0 = new Date('2026-09-26T08:00:00.000Z');
const START = new Date('2026-09-26T08:00:00.000Z');
const END = new Date('2026-09-26T16:00:00.000Z');
const BEFORE_START = new Date('2026-09-26T07:00:00.000Z');
const AFTER_END = new Date('2026-09-26T17:00:00.000Z');
const MID_WINDOW = new Date('2026-09-26T12:00:00.000Z');

function permit(overrides: Partial<PermitSnapshot> = {}): PermitSnapshot {
  return {
    status: 'DRAFT',
    plannedStart: START,
    plannedEnd: END,
    allRequiredApprovalsGranted: false,
    ...overrides,
  };
}

function expectDomainError(
  fn: () => unknown,
  code: PermitDomainError['code'],
): PermitDomainError {
  try {
    fn();
    throw new Error(`expected PermitDomainError(${code}) but nothing was thrown`);
  } catch (err) {
    expect(err).toBeInstanceOf(PermitDomainError);
    const e = err as PermitDomainError;
    expect(e.code).toBe(code);
    return e;
  }
}

describe('transition table completeness', () => {
  it('covers every documented happy-path edge', () => {
    const expected: Array<[PermitStatus, PermitAction, PermitStatus]> = [
      ['DRAFT', 'SUBMIT', 'PENDING_APPROVAL'],
      ['PENDING_APPROVAL', 'APPROVE', 'APPROVED'],
      ['PENDING_APPROVAL', 'REJECT', 'REJECTED'],
      ['APPROVED', 'ACTIVATE', 'ACTIVE'],
      ['ACTIVE', 'SUSPEND', 'SUSPENDED'],
      ['SUSPENDED', 'RESUME', 'ACTIVE'],
      ['ACTIVE', 'CLOSE', 'CLOSED'],
      ['CLOSED', 'VERIFY_CLOSURE', 'CLOSED_VERIFIED'],
    ];
    for (const [from, action, to] of expected) {
      const edge = ALLOWED_TRANSITIONS.find((t) => t.from === from && t.action === action);
      expect(edge, `${from} + ${action}`).toBeDefined();
      expect(edge!.to).toBe(to);
    }
  });

  it('lets every cancellable status cancel into CANCELLED', () => {
    for (const from of CANCELLABLE_STATUSES) {
      expect(isAllowedTransition(from, 'CANCEL')).toBe(true);
    }
  });

  it('lets every expirable status expire into EXPIRED', () => {
    for (const from of EXPIRABLE_STATUSES) {
      expect(isAllowedTransition(from, 'EXPIRE')).toBe(true);
    }
  });

  it('does not let DRAFT expire (an unsubmitted form is not an authorization)', () => {
    expect(isAllowedTransition('DRAFT', 'EXPIRE')).toBe(false);
  });

  it('does not let CLOSED cancel (D7: closed is waiting for verification)', () => {
    expect(isAllowedTransition('CLOSED', 'CANCEL')).toBe(false);
  });
});

describe('valid transitions', () => {
  it('DRAFT → PENDING_APPROVAL on SUBMIT', () => {
    const result = transition(permit({ status: 'DRAFT' }), { action: 'SUBMIT', now: T0 });
    expect(result).toMatchObject({
      from: 'DRAFT',
      to: 'PENDING_APPROVAL',
      action: 'SUBMIT',
      event: 'SUBMITTED',
    });
    expect(result.at).toEqual(T0);
  });

  it('PENDING_APPROVAL → APPROVED on APPROVE', () => {
    const result = transition(permit({ status: 'PENDING_APPROVAL' }), {
      action: 'APPROVE',
      now: T0,
    });
    expect(result.to).toBe('APPROVED');
    expect(result.event).toBe('APPROVED');
  });

  it('PENDING_APPROVAL → REJECTED on REJECT with a reason', () => {
    const result = transition(permit({ status: 'PENDING_APPROVAL' }), {
      action: 'REJECT',
      now: T0,
      reason: 'LEL reading is missing.',
    });
    expect(result.to).toBe('REJECTED');
    expect(result.event).toBe('REJECTED');
    expect(result.reason).toBe('LEL reading is missing.');
  });

  it('APPROVED → ACTIVE on ACTIVATE when approvals and clock are valid', () => {
    const result = transition(
      permit({ status: 'APPROVED', allRequiredApprovalsGranted: true }),
      { action: 'ACTIVATE', now: MID_WINDOW },
    );
    expect(result.to).toBe('ACTIVE');
    expect(result.event).toBe('ACTIVATED');
  });

  it('ACTIVE → SUSPENDED on SUSPEND with a reason', () => {
    const result = transition(permit({ status: 'ACTIVE' }), {
      action: 'SUSPEND',
      now: MID_WINDOW,
      reason: 'Gas alarm on adjacent line.',
    });
    expect(result.to).toBe('SUSPENDED');
    expect(result.event).toBe('SUSPENDED');
    expect(result.reason).toBe('Gas alarm on adjacent line.');
  });

  it('SUSPENDED → ACTIVE on RESUME inside the window with approvals intact', () => {
    const result = transition(
      permit({ status: 'SUSPENDED', allRequiredApprovalsGranted: true }),
      { action: 'RESUME', now: MID_WINDOW },
    );
    expect(result.to).toBe('ACTIVE');
    expect(result.event).toBe('RESUMED');
  });

  it('ACTIVE → CLOSED on CLOSE', () => {
    const result = transition(permit({ status: 'ACTIVE' }), { action: 'CLOSE', now: MID_WINDOW });
    expect(result.to).toBe('CLOSED');
    expect(result.event).toBe('CLOSED');
  });

  it('CLOSED → CLOSED_VERIFIED on VERIFY_CLOSURE', () => {
    const result = transition(permit({ status: 'CLOSED' }), {
      action: 'VERIFY_CLOSURE',
      now: MID_WINDOW,
    });
    expect(result.to).toBe('CLOSED_VERIFIED');
    expect(result.event).toBe('CLOSURE_VERIFIED');
  });

  it('ACTIVE → EXPIRED on EXPIRE', () => {
    const result = transition(permit({ status: 'ACTIVE' }), {
      action: 'EXPIRE',
      now: AFTER_END,
    });
    expect(result.to).toBe('EXPIRED');
    expect(result.event).toBe('EXPIRED');
  });
});

describe('invalid transitions', () => {
  const illegal: Array<[PermitStatus, PermitAction]> = [
    ['DRAFT', 'ACTIVATE'],
    ['DRAFT', 'APPROVE'],
    ['DRAFT', 'CLOSE'],
    ['PENDING_APPROVAL', 'ACTIVATE'],
    ['PENDING_APPROVAL', 'CLOSE'],
    ['APPROVED', 'SUBMIT'],
    ['APPROVED', 'CLOSE'],
    ['ACTIVE', 'ACTIVATE'],
    ['ACTIVE', 'APPROVE'],
    ['SUSPENDED', 'CLOSE'],
    ['SUSPENDED', 'ACTIVATE'],
    ['CLOSED', 'ACTIVATE'],
    ['CLOSED', 'CANCEL'],
    ['CLOSED_VERIFIED', 'ACTIVATE'],
    ['REJECTED', 'APPROVE'],
    ['REJECTED', 'ACTIVATE'],
    ['CANCELLED', 'SUBMIT'],
    ['EXPIRED', 'RESUME'],
    ['EXPIRED', 'CLOSE'],
  ];

  it.each(illegal)('rejects %s + %s', (status, action) => {
    const err = expectDomainError(
      () =>
        transition(permit({ status, allRequiredApprovalsGranted: true }), {
          action,
          now: MID_WINDOW,
          reason: 'whatever',
        }),
      status === 'EXPIRED' && action === 'ACTIVATE' ? 'PERMIT_EXPIRED' : 'INVALID_TRANSITION',
    );
    expect(err.httpStatus).toBe(409);
    expect(err.message.length).toBeGreaterThan(10);
  });

  it('never produces a result for an unknown action from a terminal state', () => {
    for (const status of TERMINAL_STATUSES) {
      for (const action of PERMIT_ACTIONS) {
        expect(() =>
          transition(permit({ status, allRequiredApprovalsGranted: true }), {
            action,
            now: MID_WINDOW,
            reason: 'n/a',
          }),
        ).toThrow(PermitDomainError);
      }
    }
  });
});

describe('activation before start', () => {
  it('rejects ACTIVATE when now < plannedStart even with all approvals', () => {
    const err = expectDomainError(
      () =>
        transition(
          permit({ status: 'APPROVED', allRequiredApprovalsGranted: true }),
          { action: 'ACTIVATE', now: BEFORE_START },
        ),
      'ACTIVATION_TOO_EARLY',
    );
    expect(err.message).toContain(START.toISOString());
    expect(err.httpStatus).toBe(409);
  });

  it('allows ACTIVATE exactly at plannedStart', () => {
    const result = transition(
      permit({ status: 'APPROVED', allRequiredApprovalsGranted: true }),
      { action: 'ACTIVATE', now: START },
    );
    expect(result.to).toBe('ACTIVE');
  });
});

describe('activation without approvals', () => {
  it('rejects ACTIVATE when any required approval is missing', () => {
    const err = expectDomainError(
      () =>
        transition(
          permit({ status: 'APPROVED', allRequiredApprovalsGranted: false }),
          { action: 'ACTIVATE', now: MID_WINDOW },
        ),
      'MISSING_APPROVALS',
    );
    expect(err.httpStatus).toBe(409);
  });

  it('does not even consult the clock if approvals are missing', () => {
    // Guard order: approvals first. A missing-approval error must win over
    // a too-early error so the API tells the caller the real blocker.
    expectDomainError(
      () =>
        transition(
          permit({ status: 'APPROVED', allRequiredApprovalsGranted: false }),
          { action: 'ACTIVATE', now: BEFORE_START },
        ),
      'MISSING_APPROVALS',
    );
  });
});

describe('activation after expiry / window passed', () => {
  it('rejects ACTIVATE when now >= plannedEnd', () => {
    const err = expectDomainError(
      () =>
        transition(
          permit({ status: 'APPROVED', allRequiredApprovalsGranted: true }),
          { action: 'ACTIVATE', now: AFTER_END },
        ),
      'ACTIVATION_WINDOW_PASSED',
    );
    expect(err.message).toContain(END.toISOString());
  });

  it('rejects ACTIVATE exactly at plannedEnd (window is half-open: [start, end))', () => {
    expectDomainError(
      () =>
        transition(
          permit({ status: 'APPROVED', allRequiredApprovalsGranted: true }),
          { action: 'ACTIVATE', now: END },
        ),
      'ACTIVATION_WINDOW_PASSED',
    );
  });
});

describe('expired → active rejection', () => {
  it('refuses to resurrect an EXPIRED permit via ACTIVATE', () => {
    const err = expectDomainError(
      () =>
        transition(
          permit({ status: 'EXPIRED', allRequiredApprovalsGranted: true }),
          { action: 'ACTIVATE', now: MID_WINDOW },
        ),
      'PERMIT_EXPIRED',
    );
    expect(err.message).toMatch(/never be reactivated/i);
    expect(err.httpStatus).toBe(409);
  });

  it('refuses RESUME from EXPIRED too', () => {
    expectDomainError(
      () =>
        transition(
          permit({ status: 'EXPIRED', allRequiredApprovalsGranted: true }),
          { action: 'RESUME', now: MID_WINDOW },
        ),
      'INVALID_TRANSITION',
    );
  });
});

describe('suspension', () => {
  it('requires a non-empty reason', () => {
    expectDomainError(
      () => transition(permit({ status: 'ACTIVE' }), { action: 'SUSPEND', now: MID_WINDOW }),
      'REASON_REQUIRED',
    );
    expectDomainError(
      () =>
        transition(permit({ status: 'ACTIVE' }), {
          action: 'SUSPEND',
          now: MID_WINDOW,
          reason: '   ',
        }),
      'REASON_REQUIRED',
    );
  });

  it('records the reason on the result so the audit row can copy it', () => {
    const result = transition(permit({ status: 'ACTIVE' }), {
      action: 'SUSPEND',
      now: MID_WINDOW,
      reason: '  Shift handover — gas retest required.  ',
    });
    expect(result.reason).toBe('Shift handover — gas retest required.');
  });

  it('cannot suspend a permit that is not ACTIVE', () => {
    for (const status of PERMIT_STATUSES.filter((s) => s !== 'ACTIVE')) {
      expect(isAllowedTransition(status, 'SUSPEND')).toBe(false);
    }
  });
});

describe('resume', () => {
  it('cannot resume after the window has ended — expire instead', () => {
    expectDomainError(
      () =>
        transition(
          permit({ status: 'SUSPENDED', allRequiredApprovalsGranted: true }),
          { action: 'RESUME', now: AFTER_END },
        ),
      'ACTIVATION_WINDOW_PASSED',
    );
  });

  it('cannot resume if approvals are no longer intact', () => {
    expectDomainError(
      () =>
        transition(
          permit({ status: 'SUSPENDED', allRequiredApprovalsGranted: false }),
          { action: 'RESUME', now: MID_WINDOW },
        ),
      'MISSING_APPROVALS',
    );
  });

  it('cannot be requested by sending status=ACTIVE from SUSPENDED without going through RESUME', () => {
    // There is no action that means "set status to X". The only legal
    // path back to ACTIVE is RESUME, which is what this test pins.
    expect(isAllowedTransition('SUSPENDED', 'ACTIVATE')).toBe(false);
    expect(isAllowedTransition('SUSPENDED', 'RESUME')).toBe(true);
  });
});

describe('cancellation', () => {
  it('cancels every cancellable status into CANCELLED and records the reason', () => {
    for (const status of CANCELLABLE_STATUSES) {
      const result = transition(permit({ status }), {
        action: 'CANCEL',
        now: MID_WINDOW,
        reason: 'Job cancelled by production.',
      });
      expect(result.to).toBe('CANCELLED');
      expect(result.event).toBe('CANCELLED');
      expect(result.reason).toBe('Job cancelled by production.');
    }
  });

  it('requires a reason', () => {
    expectDomainError(
      () => transition(permit({ status: 'DRAFT' }), { action: 'CANCEL', now: T0 }),
      'REASON_REQUIRED',
    );
  });

  it('cannot cancel terminal permits', () => {
    for (const status of TERMINAL_STATUSES) {
      expectDomainError(
        () =>
          transition(permit({ status }), {
            action: 'CANCEL',
            now: MID_WINDOW,
            reason: 'too late',
          }),
        'INVALID_TRANSITION',
      );
    }
  });
});

describe('audit log payload on every transition', () => {
  it('always returns from, to, action, event, and at — enough to write an audit row', () => {
    const cases: Array<{
      status: PermitStatus;
      action: PermitAction;
      extra?: Partial<PermitSnapshot>;
      reason?: string;
      now?: Date;
    }> = [
      { status: 'DRAFT', action: 'SUBMIT' },
      { status: 'PENDING_APPROVAL', action: 'APPROVE' },
      { status: 'PENDING_APPROVAL', action: 'REJECT', reason: 'unsafe' },
      {
        status: 'APPROVED',
        action: 'ACTIVATE',
        extra: { allRequiredApprovalsGranted: true },
        now: MID_WINDOW,
      },
      { status: 'ACTIVE', action: 'SUSPEND', reason: 'alarm' },
      {
        status: 'SUSPENDED',
        action: 'RESUME',
        extra: { allRequiredApprovalsGranted: true },
        now: MID_WINDOW,
      },
      { status: 'ACTIVE', action: 'CLOSE' },
      { status: 'CLOSED', action: 'VERIFY_CLOSURE' },
      { status: 'ACTIVE', action: 'CANCEL', reason: 'called off' },
      { status: 'ACTIVE', action: 'EXPIRE' },
    ];

    for (const c of cases) {
      const result = transition(permit({ status: c.status, ...c.extra }), {
        action: c.action,
        now: c.now ?? T0,
        reason: c.reason,
      });
      expect(result.from).toBe(c.status);
      expect(result.to).toBeTruthy();
      expect(result.action).toBe(c.action);
      expect(result.event).toBeTruthy();
      expect(result.at).toBeInstanceOf(Date);
    }
  });
});

describe('work logs require ACTIVE', () => {
  it('allows work on ACTIVE', () => {
    expect(() => assertWorkMayBeLogged('ACTIVE')).not.toThrow();
  });

  it.each(PERMIT_STATUSES.filter((s) => s !== 'ACTIVE'))(
    'rejects work on %s',
    (status) => {
      const err = expectDomainError(() => assertWorkMayBeLogged(status), 'NOT_ACTIVE');
      expect(err.message).toContain(status);
      expect(err.httpStatus).toBe(409);
    },
  );
});

describe('maybeExpire (lazy / cron helper)', () => {
  it('returns null while still inside the window', () => {
    expect(maybeExpire(permit({ status: 'ACTIVE' }), MID_WINDOW)).toBeNull();
  });

  it('expires PENDING_APPROVAL / APPROVED / ACTIVE / SUSPENDED once the window ends', () => {
    for (const status of EXPIRABLE_STATUSES) {
      const result = maybeExpire(permit({ status }), AFTER_END);
      expect(result, status).not.toBeNull();
      expect(result!.to).toBe('EXPIRED');
      expect(result!.event).toBe('EXPIRED');
    }
  });

  it('does not expire DRAFT, CLOSED, or already-terminal permits', () => {
    for (const status of ['DRAFT', 'CLOSED', ...TERMINAL_STATUSES] as PermitStatus[]) {
      expect(maybeExpire(permit({ status }), AFTER_END)).toBeNull();
    }
  });
});

describe('the client cannot set a status', () => {
  it('exposes actions, not target statuses, as the public input', () => {
    // If someone tries to "just set status to ACTIVE", there is no API for
    // that. The only way to become ACTIVE is ACTIVATE or RESUME, each of
    // which runs the full rule set.
    expect(PERMIT_ACTIONS).not.toContain('SET_STATUS');
    expect(Object.keys(transition(permit(), { action: 'SUBMIT', now: T0 }))).not.toContain(
      'requestedStatus',
    );
  });
});
