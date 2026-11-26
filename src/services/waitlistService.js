// WaitlistService — manages the per-tier waitlist queue and time-limited offers.
//
// Flow:
//   1. Tier sells out → attendee calls joinWaitlist()
//   2. A paid booking is cancelled → bookingService calls offerNextInQueue()
//   3. offerNextInQueue creates an active WaitlistOffer (expires in 15 min)
//   4. Attendee sees the offer and calls acceptOffer() within the window
//   5. acceptOffer creates a pending Booking and removes the queue entry
//   6. Maintenance job expires stale offers and re-offers to next person

import { DomainError } from '../domain/errors.js';
import { newId } from '../domain/ids.js';

const OFFER_HOLD_MS = 15 * 60 * 1000; // 15 minutes

export class WaitlistService {
  #repo;
  #clock;

  /**
   * @param {{ repo: object, clock: import('../lib/clock.js').Clock }} deps
   */
  constructor({ repo, clock }) {
    this.#repo = repo;
    this.#clock = clock;
  }

  /**
   * Adds a user to the waitlist for a tier.
   * Throws NOT_SOLD_OUT   if the tier still has seats available.
   * Throws ALREADY_ON_WAITLIST if the user is already in the queue.
   *
   * @param {{ tierId: string, eventId: string, userId: string }} params
   * @returns {Promise<object>} The new waitlist entry
   */
  async joinWaitlist({ tierId, eventId, userId }) {
    const tier = await this.#repo.findTierById(tierId);
    if (!tier) throw new DomainError('NOT_FOUND', `Tier ${tierId} not found`);

    // Cannot join waitlist when seats are still available
    if (tier.sold < tier.capacity) {
      throw new DomainError('NOT_SOLD_OUT', 'Tickets are still available — no need to join the waitlist');
    }

    // Check for duplicate
    const existing = await this.#repo.findWaitlistEntry(tierId, userId);
    if (existing) {
      throw new DomainError('ALREADY_ON_WAITLIST', 'You are already on the waitlist for this tier');
    }

    const entry = await this.#repo.addToWaitlist({
      id: newId(),
      tierId,
      eventId,
      userId,
      createdAt: this.#clock.iso(),
    });

    return entry;
  }

  /**
   * Accepts an active offer: compare-and-sets the offer to 'accepted',
   * then creates a pending booking for the user.
   * Throws OFFER_NOT_FOUND if no offer with that id exists.
   * Throws OFFER_EXPIRED   if the offer has already expired or is not 'active'.
   * Throws FORBIDDEN       if the offer belongs to a different user.
   *
   * @param {{ offerId: string, userId: string, bookingService: object }} params
   * @returns {Promise<object>} The new pending booking
   */
  async acceptOffer({ offerId, userId, bookingService }) {
    const offer = await this.#repo.findWaitlistOfferById(offerId);
    if (!offer) throw new DomainError('OFFER_NOT_FOUND', 'Offer not found');
    if (offer.userId !== userId) throw new DomainError('FORBIDDEN', 'This offer is not for you');

    const now = this.#clock.iso();
    if (offer.status !== 'active' || offer.expiresAt <= now) {
      throw new DomainError('OFFER_EXPIRED', 'This offer has expired');
    }

    // Compare-and-set: mark accepted (prevents double-accept)
    const changed = await this.#repo.updateWaitlistOfferStatus(offerId, 'accepted');
    if (!changed) throw new DomainError('OFFER_EXPIRED', 'This offer has already been claimed');

    // Remove from queue
    await this.#repo.removeWaitlistEntry(offer.waitlistEntryId);

    // Create a pending booking (uses bookingService so it deducts seats atomically)
    const booking = await bookingService.createBookingFromOffer({
      tierId: offer.tierId,
      eventId: offer.eventId,
      userId,
      quantity: 1,
    });

    return booking;
  }

  /**
   * Internal helper: take the next person in the queue and create an active offer.
   * Called by bookingService.cancelBooking() when a seat is freed.
   *
   * @param {{ tierId: string, seatsFreed?: number }} params
   * @returns {Promise<object|null>} The new offer, or null if the queue is empty
   */
  async offerNextInQueue({ tierId }) {
    const entry = await this.#repo.getNextWaitlistEntry(tierId);
    if (!entry) return null;

    const now = this.#clock.nowMs();
    const expiresAt = new Date(now + OFFER_HOLD_MS).toISOString();

    const offer = await this.#repo.createWaitlistOffer({
      id: newId(),
      tierId: entry.tierId,
      eventId: entry.eventId,
      userId: entry.userId,
      waitlistEntryId: entry.id,
      expiresAt,
      createdAt: this.#clock.iso(),
    });

    return offer;
  }

  /**
   * Expire all stale active offers (called by maintenance job).
   * For each expired offer, marks it 'expired' and offers the next person.
   *
   * @returns {Promise<number>} Count of offers expired
   */
  async expireStaleOffers() {
    const nowIso = this.#clock.iso();
    const stale = await this.#repo.listExpiredWaitlistOffers(nowIso);
    let count = 0;
    for (const offer of stale) {
      const changed = await this.#repo.updateWaitlistOfferStatus(offer.id, 'expired');
      if (changed) {
        count++;
        // Remove the expired queue entry so they don't block the line
        await this.#repo.removeWaitlistEntry(offer.waitlistEntryId);
        // Offer the next person in that tier's queue
        await this.offerNextInQueue({ tierId: offer.tierId });
      }
    }
    return count;
  }

  /**
   * Returns all active offers for a user (for the tickets page UI).
   *
   * @param {string} userId
   * @returns {Promise<object[]>}
   */
  async listOffersForUser(userId) {
    return this.#repo.listActiveWaitlistOffersForUser(userId);
  }
}
