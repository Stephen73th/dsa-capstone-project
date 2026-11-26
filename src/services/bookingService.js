// Service orchestrating ticket booking, payment, and cancellations.
// Build 8: adds refund policy on paid-booking cancellation, booking expiry check,
//          waitlist seat-offer on cancellation, and createBookingFromOffer helper.

import { newId, referenceCode } from '../domain/ids.js';
import { DomainError } from '../domain/errors.js';
import { assertTransition, BOOKING_STATES } from '../domain/bookingStateMachine.js';
import { calculateRefund } from '../domain/refundPolicy.js';
import { clock as defaultClock } from '../lib/clock.js';

export const MAX_TICKETS_PER_BOOKING = 10;
const HOLD_MINUTES = 5;

export class BookingService {
  #repo;
  #paymentGateway;
  #clock;
  #waitlistService; // injected lazily to avoid circular deps

  /**
   * @param {object} repo
   * @param {object} paymentGateway
   * @param {{ clock?: object, waitlistService?: object }} [opts]
   */
  constructor(repo, paymentGateway, opts = {}) {
    this.#repo = repo;
    this.#paymentGateway = paymentGateway;
    this.#clock = opts.clock ?? defaultClock;
    this.#waitlistService = opts.waitlistService ?? null;
  }

  /** Allows waitlistService to be set after construction (breaks circular dep). */
  setWaitlistService(waitlistService) {
    this.#waitlistService = waitlistService;
  }

  async bookTickets({ tierId, userId, quantity }) {
    if (!userId || String(userId).trim() === '') {
      throw new DomainError('UNAUTHORIZED', 'A user ID is required to book tickets');
    }

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_TICKETS_PER_BOOKING) {
      throw new DomainError('VALIDATION', `quantity must be between 1 and ${MAX_TICKETS_PER_BOOKING}`);
    }

    const tier = await this.#repo.findTierById(tierId);
    if (!tier) throw new DomainError('NOT_FOUND', 'Ticket tier not found');

    const event = await this.#repo.findEventById(tier.eventId);
    if (!event || event.status !== 'published') {
      throw new DomainError('INVALID_STATE', 'Cannot book tickets for an unpublished event');
    }

    const seatsLeft = tier.capacity - tier.sold;
    if (seatsLeft < quantity) {
      const message = seatsLeft === 0
        ? `${tier.name} is sold out`
        : `Only ${seatsLeft} ticket(s) left in ${tier.name}`;
      throw new DomainError('SOLD_OUT', message, { seatsLeft });
    }

    // Deduct seats atomically
    await this.#repo.updateTierSold(tier.id, quantity);

    // Generate unique human-readable reference code
    let reference;
    do {
      reference = referenceCode();
    } while (await this.#repo.findBookingByReference(reference));

    const now = this.#clock.iso();
    const expiresAt = new Date(this.#clock.nowMs() + HOLD_MINUTES * 60 * 1000).toISOString();

    const booking = {
      id: newId(),
      reference,
      userId,
      tierId: tier.id,
      eventId: event.id,
      quantity,
      amountCents: tier.priceCents * quantity,
      refundCents: 0,
      status: BOOKING_STATES.PENDING,
      expiresAt,
      createdAt: now,
    };

    return await this.#repo.saveBooking(booking);
  }

  /**
   * Creates a pending booking as a result of accepting a waitlist offer.
   * Skips the sold-out guard (seats were freed by the cancellation that triggered the offer).
   */
  async createBookingFromOffer({ tierId, eventId, userId, quantity = 1 }) {
    const tier = await this.#repo.findTierById(tierId);
    if (!tier) throw new DomainError('NOT_FOUND', 'Ticket tier not found');

    // Atomically deduct the seat
    await this.#repo.updateTierSold(tierId, quantity);

    let reference;
    do {
      reference = referenceCode();
    } while (await this.#repo.findBookingByReference(reference));

    const now = this.#clock.iso();
    const expiresAt = new Date(this.#clock.nowMs() + HOLD_MINUTES * 60 * 1000).toISOString();

    const booking = {
      id: newId(),
      reference,
      userId,
      tierId,
      eventId,
      quantity,
      amountCents: tier.priceCents * quantity,
      refundCents: 0,
      status: BOOKING_STATES.PENDING,
      expiresAt,
      createdAt: now,
    };

    return await this.#repo.saveBooking(booking);
  }

  async payBooking(reference, { userId, shouldDecline = false } = {}) {
    const booking = await this.#repo.findBookingByReference(reference);
    if (!booking) throw new DomainError('NOT_FOUND', 'Booking not found');

    if (userId && booking.userId !== userId) {
      throw new DomainError('FORBIDDEN', "You cannot pay for another user's booking");
    }

    // Enforce state machine (pending → paid; rejects already-paid, cancelled, etc.)
    assertTransition(booking.status, BOOKING_STATES.PAID);

    // Build 8: Reject if the hold window has expired
    if (booking.expiresAt && this.#clock.iso() > booking.expiresAt) {
      throw new DomainError('BOOKING_EXPIRED', 'This booking has expired — please book again');
    }

    const paymentResult = await this.#paymentGateway.charge({
      amountCents: booking.amountCents,
      shouldDecline,
    });

    if (!paymentResult.success) {
      throw new DomainError('PAYMENT_DECLINED', paymentResult.message || 'Payment was declined');
    }

    // Compare-and-set transition to paid
    const now = this.#clock.iso();
    const changed = await this.#repo.updateBookingStatusAtomic(
      reference, BOOKING_STATES.PENDING, BOOKING_STATES.PAID,
      { paidAt: now, transactionId: paymentResult.transactionId }
    );
    if (!changed) {
      throw new DomainError('INVALID_STATE', 'Booking status changed concurrently');
    }

    return await this.#repo.findBookingByReference(reference);
  }

  async cancelBooking(reference, { userId } = {}) {
    const booking = await this.#repo.findBookingByReference(reference);
    if (!booking) throw new DomainError('NOT_FOUND', 'Booking not found');

    if (userId && booking.userId !== userId) {
      throw new DomainError('FORBIDDEN', "You cannot cancel another user's booking");
    }

    // State machine allows: pending → cancelled and paid → cancelled
    assertTransition(booking.status, BOOKING_STATES.CANCELLED);

    const isPaid = booking.status === BOOKING_STATES.PAID;

    // Compare-and-set cancel
    const changed = await this.#repo.updateBookingStatusAtomic(
      reference, booking.status, BOOKING_STATES.CANCELLED
    );
    if (!changed) {
      throw new DomainError('INVALID_STATE', 'Booking was already cancelled or changed concurrently');
    }

    let refundCents = 0;

    if (isPaid && booking.amountCents > 0) {
      // Load the event to get startsAt for the refund policy
      const tier = await this.#repo.findTierById(booking.tierId);
      const event = tier ? await this.#repo.findEventById(tier.eventId) : null;

      if (event) {
        try {
          const result = calculateRefund({
            amountCents: booking.amountCents,
            startsAt: event.startsAt,
            now: this.#clock.now(),
          });
          refundCents = result.refundCents;
        } catch {
          // EVENT_STARTED → no refund
          refundCents = 0;
        }
      }

      if (refundCents > 0 && booking.transactionId) {
        await this.#paymentGateway.refund({
          amountCents: refundCents,
          transactionId: booking.transactionId,
        });
      }

      // Persist refundCents on the booking record
      const updated = await this.#repo.findBookingByReference(reference);
      updated.refundCents = refundCents;
      await this.#repo.saveBooking(updated);
    }

    // Release seats
    await this.#repo.updateTierSold(booking.tierId, -booking.quantity);

    // Offer freed seat to next person in waitlist queue
    if (this.#waitlistService) {
      await this.#waitlistService.offerNextInQueue({ tierId: booking.tierId });
    }

    return await this.#repo.findBookingByReference(reference);
  }

  async getBooking(reference) {
    const booking = await this.#repo.findBookingByReference(reference);
    if (!booking) throw new DomainError('NOT_FOUND', 'Booking not found');
    return booking;
  }

  async listUserBookings(userId) {
    if (!userId) return [];
    return await this.#repo.listBookingsByUserId(userId);
  }
}
