// Service orchestrating attendee QR ticket check-in at event doors.
// Enforces single atomic check-in transitions to prevent duplicate admissions.

import { DomainError } from '../domain/errors.js';
import { verifyTicketToken } from '../lib/ticketToken.js';
import { clock as defaultClock } from '../lib/clock.js';

export class CheckinService {
  #repo;
  #clock;

  /**
   * @param {{ repo: object, clock?: import('../lib/clock.js').Clock }} deps
   */
  constructor({ repo, clock }) {
    this.#repo = repo;
    this.#clock = clock ?? defaultClock;
  }

  /**
   * Validates a signed ticket token and atomically admits the attendee.
   *
   * @param {object} params
   * @param {string} params.token - HMAC-SHA256 signed ticket token
   * @param {string} [params.eventId] - Event ID where staff is scanning
   * @returns {Promise<object>} Check-in confirmation with booking & attendee metadata
   */
  async checkin({ token, eventId }) {
    if (!token || typeof token !== 'string') {
      throw new DomainError('VALIDATION', 'Ticket token is required for check-in');
    }

    // 1. Verify token signature and extract reference (rejects tampered or forged codes)
    const { reference } = verifyTicketToken(token);

    // 2. Fetch booking
    const booking = await this.#repo.findBookingByReference(reference);
    if (!booking) {
      throw new DomainError('NOT_FOUND', 'Booking reference not found');
    }

    // 3. Event match verification (S14: reject ticket for a different event)
    if (eventId && booking.eventId !== eventId) {
      throw new DomainError('WRONG_EVENT', 'This ticket is for a different event');
    }

    // 4. Single atomic UPDATE check-in: SET status='checked_in' WHERE reference=? AND status='paid'
    const nowIso = this.#clock.iso();
    const admitted = await this.#repo.checkinBookingAtomic(reference, nowIso);

    if (!admitted) {
      // Re-read current state to provide precise failure diagnostics
      const current = await this.#repo.findBookingByReference(reference);

      if (current.status === 'checked_in') {
        throw new DomainError(
          'DUPLICATE_SCAN',
          `Ticket was already used at ${current.checkedInAt || 'an earlier scan'}`,
          { checkedInAt: current.checkedInAt }
        );
      }

      if (current.status === 'cancelled' || current.status === 'refunded') {
        throw new DomainError('INVALID_STATE', `This ticket has been ${current.status}`);
      }

      if (current.status === 'pending') {
        throw new DomainError('UNPAID_BOOKING', 'This booking has not been paid');
      }

      throw new DomainError('INVALID_STATE', `Cannot check in booking with status '${current.status}'`);
    }

    const event = await this.#repo.findEventById(booking.eventId);
    const tier = await this.#repo.findTierById(booking.tierId);

    return {
      success: true,
      reference: booking.reference,
      eventId: booking.eventId,
      eventTitle: event?.title || '',
      tierName: tier?.name || '',
      quantity: booking.quantity,
      checkedInAt: nowIso,
    };
  }
}
