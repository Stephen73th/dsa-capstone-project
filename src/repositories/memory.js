// In-memory data repository for events, ticket tiers, and bookings.
// All methods are async so the service layer works seamlessly whether
// data is in memory (Build 4) or in SQLite (Build 5).

import { DomainError } from '../domain/errors.js';

export class MemoryRepository {
  #events = new Map();
  #tiers = new Map();
  #bookings = new Map();
  #bookingsByReference = new Map();
  #users = new Map();
  #usersByEmail = new Map();
  #waitlistEntries = new Map();      // id → entry
  #waitlistOffers = new Map();       // id → offer

  // --- Events ---
  async saveEvent(event) {
    this.#events.set(event.id, { ...event });
    return { ...event };
  }

  async findEventById(id) {
    const event = this.#events.get(id);
    return event ? { ...event } : null;
  }

  async listEvents() {
    return Array.from(this.#events.values()).map((e) => ({ ...e }));
  }

  // --- Ticket Tiers ---
  async saveTier(tier) {
    this.#tiers.set(tier.id, { ...tier });
    return { ...tier };
  }

  async findTierById(id) {
    const tier = this.#tiers.get(id);
    return tier ? { ...tier } : null;
  }

  async listTiersByEventId(eventId) {
    return Array.from(this.#tiers.values())
      .filter((t) => t.eventId === eventId)
      .map((t) => ({ ...t }));
  }

  async updateTierSold(tierId, soldDelta) {
    const tier = this.#tiers.get(tierId);
    if (!tier) return null;
    if (soldDelta > 0 && tier.sold + soldDelta > tier.capacity) {
      throw new DomainError('SOLD_OUT', `${tier.name} is sold out`);
    }
    tier.sold = Math.max(0, tier.sold + soldDelta);
    this.#tiers.set(tierId, { ...tier });
    return { ...tier };
  }

  // --- Bookings ---
  async saveBooking(booking) {
    const record = { refundCents: 0, expiresAt: null, checkedInAt: null, ...booking };
    this.#bookings.set(booking.id, { ...record });
    this.#bookingsByReference.set(booking.reference, { ...record });
    return { ...record };
  }

  async findBookingByReference(reference) {
    const booking = this.#bookingsByReference.get(reference);
    return booking ? { ...booking } : null;
  }

  async updateBookingStatus(reference, status) {
    const booking = this.#bookingsByReference.get(reference);
    if (!booking) return null;
    booking.status = status;
    this.#bookings.set(booking.id, { ...booking });
    this.#bookingsByReference.set(reference, { ...booking });
    return { ...booking };
  }

  // Atomic check-in transition from paid → checked_in
  async checkinBookingAtomic(reference, checkedInAt) {
    const booking = this.#bookingsByReference.get(reference);
    if (!booking || booking.status !== 'paid') return false;
    booking.status = 'checked_in';
    booking.checkedInAt = checkedInAt;
    this.#bookings.set(booking.id, { ...booking });
    this.#bookingsByReference.set(reference, { ...booking });
    return true;
  }

  // Compare-and-set: transitions booking from fromStatus → toStatus atomically.
  // Returns true if the update was applied, false if the booking was not in fromStatus.
  async updateBookingStatusAtomic(reference, fromStatus, toStatus, extraFields = {}) {
    const booking = this.#bookingsByReference.get(reference);
    if (!booking || booking.status !== fromStatus) return false;
    Object.assign(booking, { status: toStatus, ...extraFields });
    this.#bookings.set(booking.id, { ...booking });
    this.#bookingsByReference.set(reference, { ...booking });
    return true;
  }

  // Returns all pending bookings created on or before isoDate (for expiry job).
  async listPendingBookingsBefore(isoDate) {
    return Array.from(this.#bookings.values())
      .filter((b) => b.status === 'pending' && b.createdAt <= isoDate)
      .map((b) => ({ ...b }));
  }

  async countBookingsByTierId(tierId) {
    return Array.from(this.#bookings.values()).filter((b) => b.tierId === tierId).length;
  }

  // --- Users ---
  async saveUser(user) {
    this.#users.set(user.id, { ...user });
    if (user.email) {
      this.#usersByEmail.set(user.email.toLowerCase(), { ...user });
    }
    return { ...user };
  }

  async findUserById(id) {
    const user = this.#users.get(id);
    return user ? { ...user } : null;
  }

  async findUserByEmail(email) {
    if (!email) return null;
    const user = this.#usersByEmail.get(email.toLowerCase().trim());
    return user ? { ...user } : null;
  }

  async listBookingsByUserId(userId) {
    return Array.from(this.#bookings.values())
      .filter((b) => b.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((b) => ({ ...b }));
  }

  async listEventsByOrganizerId(organizerId) {
    return Array.from(this.#events.values())
      .filter((e) => e.organizerId === organizerId)
      .map((e) => ({ ...e }));
  }

  // --- Waitlist Entries ---

  // Inserts entry; returns null (no-op) if same (tierId, userId) already exists.
  async addToWaitlist({ id, tierId, eventId, userId, createdAt }) {
    // Enforce UNIQUE(tier_id, user_id)
    const existing = Array.from(this.#waitlistEntries.values())
      .find((e) => e.tierId === tierId && e.userId === userId);
    if (existing) return null;
    const entry = { id, tierId, eventId, userId, createdAt };
    this.#waitlistEntries.set(id, entry);
    return { ...entry };
  }

  async findWaitlistEntry(tierId, userId) {
    const entry = Array.from(this.#waitlistEntries.values())
      .find((e) => e.tierId === tierId && e.userId === userId);
    return entry ? { ...entry } : null;
  }

  // Returns the oldest entry without an active offer (FIFO queue head).
  async getNextWaitlistEntry(tierId) {
    const activeOfferEntryIds = new Set(
      Array.from(this.#waitlistOffers.values())
        .filter((o) => o.status === 'active')
        .map((o) => o.waitlistEntryId)
    );
    const candidates = Array.from(this.#waitlistEntries.values())
      .filter((e) => e.tierId === tierId && !activeOfferEntryIds.has(e.id))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return candidates.length > 0 ? { ...candidates[0] } : null;
  }

  async removeWaitlistEntry(id) {
    return this.#waitlistEntries.delete(id);
  }

  // --- Waitlist Offers ---

  async createWaitlistOffer({ id, tierId, eventId, userId, waitlistEntryId, expiresAt, createdAt, status = 'active' }) {
    const offer = { id, tierId, eventId, userId, waitlistEntryId, status, expiresAt, createdAt };
    this.#waitlistOffers.set(id, offer);
    return { ...offer };
  }

  async findWaitlistOfferById(id) {
    const offer = this.#waitlistOffers.get(id);
    return offer ? { ...offer } : null;
  }

  async findActiveWaitlistOffer(tierId, userId) {
    const offer = Array.from(this.#waitlistOffers.values())
      .find((o) => o.tierId === tierId && o.userId === userId && o.status === 'active');
    return offer ? { ...offer } : null;
  }

  async listActiveWaitlistOffersForUser(userId) {
    return Array.from(this.#waitlistOffers.values())
      .filter((o) => o.userId === userId && o.status === 'active')
      .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))
      .map((o) => ({ ...o }));
  }

  async listExpiredWaitlistOffers(nowIso) {
    return Array.from(this.#waitlistOffers.values())
      .filter((o) => o.status === 'active' && o.expiresAt <= nowIso)
      .map((o) => ({ ...o }));
  }

  async updateWaitlistOfferStatus(id, newStatus) {
    const offer = this.#waitlistOffers.get(id);
    if (!offer) return false;
    offer.status = newStatus;
    this.#waitlistOffers.set(id, { ...offer });
    return true;
  }
}
