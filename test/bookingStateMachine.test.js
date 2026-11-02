import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOOKING_STATES,
  canTransition,
  assertTransition,
} from '../src/domain/bookingStateMachine.js';
import { DomainError } from '../src/domain/errors.js';

describe('bookingStateMachine', () => {
  const throwsInvalidTransition = (from, to) => {
    assert.throws(
      () => assertTransition(from, to),
      (err) => err instanceof DomainError && err.code === 'INVALID_TRANSITION',
    );
  };

  describe('allowed transitions', () => {
    it('allows pending -> paid', () => {
      assert.equal(canTransition(BOOKING_STATES.PENDING, BOOKING_STATES.PAID), true);
      assert.doesNotThrow(() => assertTransition(BOOKING_STATES.PENDING, BOOKING_STATES.PAID));
    });

    it('allows pending -> cancelled', () => {
      assert.equal(canTransition(BOOKING_STATES.PENDING, BOOKING_STATES.CANCELLED), true);
      assert.doesNotThrow(() => assertTransition(BOOKING_STATES.PENDING, BOOKING_STATES.CANCELLED));
    });

    it('allows paid -> checked_in', () => {
      assert.equal(canTransition(BOOKING_STATES.PAID, BOOKING_STATES.CHECKED_IN), true);
      assert.doesNotThrow(() => assertTransition(BOOKING_STATES.PAID, BOOKING_STATES.CHECKED_IN));
    });

    it('allows paid -> refunded', () => {
      assert.equal(canTransition(BOOKING_STATES.PAID, BOOKING_STATES.REFUNDED), true);
      assert.doesNotThrow(() => assertTransition(BOOKING_STATES.PAID, BOOKING_STATES.REFUNDED));
    });

    it('allows paid -> cancelled', () => {
      assert.equal(canTransition(BOOKING_STATES.PAID, BOOKING_STATES.CANCELLED), true);
      assert.doesNotThrow(() => assertTransition(BOOKING_STATES.PAID, BOOKING_STATES.CANCELLED));
    });
  });

  describe('illegal transitions', () => {
    it('refuses paying a cancelled booking', () => {
      assert.equal(canTransition(BOOKING_STATES.CANCELLED, BOOKING_STATES.PAID), false);
      throwsInvalidTransition(BOOKING_STATES.CANCELLED, BOOKING_STATES.PAID);
    });

    it('refuses pending -> checked_in or refunded directly', () => {
      throwsInvalidTransition(BOOKING_STATES.PENDING, BOOKING_STATES.CHECKED_IN);
      throwsInvalidTransition(BOOKING_STATES.PENDING, BOOKING_STATES.REFUNDED);
    });

    it('refuses transitions from terminal states', () => {
      const allStates = Object.values(BOOKING_STATES);
      const terminalStates = [
        BOOKING_STATES.CANCELLED,
        BOOKING_STATES.REFUNDED,
        BOOKING_STATES.CHECKED_IN,
      ];

      for (const terminal of terminalStates) {
        for (const target of allStates) {
          assert.equal(canTransition(terminal, target), false);
          throwsInvalidTransition(terminal, target);
        }
      }
    });

    it('refuses invalid/unknown states', () => {
      assert.equal(canTransition('unknown_state', BOOKING_STATES.PAID), false);
      throwsInvalidTransition('unknown_state', BOOKING_STATES.PAID);
    });
  });
});
