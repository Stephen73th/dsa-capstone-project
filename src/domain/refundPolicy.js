// Pure refund policy calculation engine.
// Determines refund amount and percentage based on time remaining until event start.

import { DomainError } from './errors.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;
const TWO_DAYS_MS = 2 * ONE_DAY_MS;

/**
 * Calculates refund amount and percentage according to the course policy:
 * - 7 days or more before start: 100% refund
 * - 2 days or more before start: 50% refund (Math.floor on cents)
 * - Under 2 days before start: 0% refund
 * - Exact boundaries belong to the higher (better) tier
 * - Throws EVENT_STARTED if the event has already started
 *
 * @param {object} params
 * @param {number} params.amountCents - Total booking amount in whole cents
 * @param {Date|string|number} params.startsAt - Event start time
 * @param {Date|string|number} [params.now] - Current time (defaults to Date.now())
 * @returns {{ refundCents: number, percentage: number }}
 */
export function calculateRefund({ amountCents, startsAt, now = new Date() }) {
  if (typeof amountCents !== 'number' || amountCents < 0 || !Number.isInteger(amountCents)) {
    throw new DomainError('VALIDATION', 'amountCents must be a non-negative integer');
  }

  const startTime = new Date(startsAt).getTime();
  const nowTime = new Date(now).getTime();

  if (Number.isNaN(startTime)) {
    throw new DomainError('VALIDATION', 'startsAt must be a valid date');
  }

  if (nowTime >= startTime) {
    throw new DomainError('EVENT_STARTED', 'Cannot refund a booking for an event that has already started');
  }

  const diffMs = startTime - nowTime;

  if (diffMs >= SEVEN_DAYS_MS) {
    return {
      refundCents: amountCents,
      percentage: 100,
    };
  }

  if (diffMs >= TWO_DAYS_MS) {
    return {
      refundCents: Math.floor(amountCents * 0.5),
      percentage: 50,
    };
  }

  return {
    refundCents: 0,
    percentage: 0,
  };
}
