// Booking life cycle state machine.
// Defines allowed state transitions as pure data and functions.

import { DomainError } from './errors.js';

export const BOOKING_STATES = Object.freeze({
  PENDING: 'pending',
  PAID: 'paid',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
  CHECKED_IN: 'checked_in',
});

// Outgoing valid transitions for each state
const ALLOWED_TRANSITIONS = Object.freeze({
  [BOOKING_STATES.PENDING]: new Set([BOOKING_STATES.PAID, BOOKING_STATES.CANCELLED]),
  [BOOKING_STATES.PAID]: new Set([
    BOOKING_STATES.CHECKED_IN,
    BOOKING_STATES.REFUNDED,
    BOOKING_STATES.CANCELLED,
  ]),
  // Terminal states: nothing leaves them
  [BOOKING_STATES.CANCELLED]: new Set(),
  [BOOKING_STATES.REFUNDED]: new Set(),
  [BOOKING_STATES.CHECKED_IN]: new Set(),
});

export function canTransition(from, to) {
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.has(to);
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new DomainError(
      'INVALID_TRANSITION',
      `Cannot transition booking from '${from}' to '${to}'`,
      { from, to },
    );
  }
}
