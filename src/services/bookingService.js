// Service orchestrating ticket booking, payment, and cancellations.
// Uses domain state machine and mock payment gateway.

import { newId, referenceCode } from '../domain/ids.js';
import { DomainError } from '../domain/errors.js';
import { assertTransition, BOOKING_STATES } from '../domain/bookingStateMachine.js';

export const MAX_TICKETS_PER_BOOKING = 10;

export class BookingService {
  #repo;
  #paymentGateway;

  constructor(repo, paymentGateway) {
    this.#repo = repo;
    this.#paymentGateway = paymentGateway;
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
      const message = seatsLeft === 0 ? `${tier.name} is sold out` : `Only ${seatsLeft} ticket(s) left in ${tier.name}`;
      throw new DomainError('SOLD_OUT', message, { seatsLeft });
    }

    // Deduct seats
    await this.#repo.updateTierSold(tier.id, quantity);

    // Generate unique human-readable reference code
    let reference;
    do {
      reference = referenceCode();
    } while (await this.#repo.findBookingByReference(reference));

    const booking = {
      id: newId(),
      reference,
      userId,
      tierId: tier.id,
      eventId: event.id,
      quantity,
      amountCents: tier.priceCents * quantity,
      status: BOOKING_STATES.PENDING,
      createdAt: new Date().toISOString(),
    };

    return await this.#repo.saveBooking(booking);
  }

  async payBooking(reference, { userId, shouldDecline = false } = {}) {
    const booking = await this.#repo.findBookingByReference(reference);
    if (!booking) throw new DomainError('NOT_FOUND', 'Booking not found');

    // Only the person who made the booking can pay for it
    if (userId && booking.userId !== userId) {
      throw new DomainError('FORBIDDEN', 'You cannot pay for another user’s booking');
    }

    // Enforce state machine (e.g. pending -> paid; will reject paid -> paid or cancelled -> paid)
    assertTransition(booking.status, BOOKING_STATES.PAID);

    // Attempt mock payment
    const paymentResult = await this.#paymentGateway.charge({
      amountCents: booking.amountCents,
      shouldDecline,
    });

    if (!paymentResult.success) {
      // Booking remains pending so the user can re-try with another card
      throw new DomainError('PAYMENT_DECLINED', paymentResult.message || 'Payment was declined');
    }

    // Update status to paid and record payment metadata
    booking.status = BOOKING_STATES.PAID;
    booking.transactionId = paymentResult.transactionId;
    booking.paidAt = new Date().toISOString();

    return await this.#repo.saveBooking(booking);
  }

  async cancelBooking(reference, { userId } = {}) {
    const booking = await this.#repo.findBookingByReference(reference);
    if (!booking) throw new DomainError('NOT_FOUND', 'Booking not found');

    if (userId && booking.userId !== userId) {
      throw new DomainError('FORBIDDEN', 'You cannot cancel another user’s booking');
    }

    // In Build 4, only unpaid (pending) bookings can be cancelled via this endpoint
    if (booking.status !== BOOKING_STATES.PENDING) {
      throw new DomainError('INVALID_STATE', `Only unpaid pending bookings can be cancelled`);
    }

    assertTransition(booking.status, BOOKING_STATES.CANCELLED);

    // Release seats back to the tier
    await this.#repo.updateTierSold(booking.tierId, -booking.quantity);

    booking.status = BOOKING_STATES.CANCELLED;
    return await this.#repo.saveBooking(booking);
  }

  async getBooking(reference) {
    const booking = await this.#repo.findBookingByReference(reference);
    if (!booking) throw new DomainError('NOT_FOUND', 'Booking not found');
    return booking;
  }
}
