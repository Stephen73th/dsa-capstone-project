// In-memory data repository for events, ticket tiers, and bookings.
// All methods are async so the service layer works seamlessly whether
// data is in memory (Build 4) or in SQLite (Build 5).

export class MemoryRepository {
  #events = new Map();
  #tiers = new Map();
  #bookings = new Map();
  #bookingsByReference = new Map();

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
    tier.sold += soldDelta;
    return { ...tier };
  }

  // --- Bookings ---
  async saveBooking(booking) {
    this.#bookings.set(booking.id, { ...booking });
    this.#bookingsByReference.set(booking.reference, { ...booking });
    return { ...booking };
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
    return { ...booking };
  }
}
