// SQLite implementation of the Repository interface.
// Uses native node:sqlite DatabaseSync and parameterised queries (?).
// All public methods are async to maintain identical contract with MemoryRepository.

import { DomainError } from '../domain/errors.js';

export class SqliteRepository {
  #db;

  constructor(db) {
    this.#db = db;
  }

  // --- Events ---
  async saveEvent(event) {
    const existing = this.#db.prepare('SELECT id FROM events WHERE id = ?').get(event.id);
    if (existing) {
      this.#db
        .prepare(
          `UPDATE events
           SET organizer_id = ?, title = ?, city = ?, venue = ?, starts_at = ?, status = ?
           WHERE id = ?`
        )
        .run(
          event.organizerId,
          event.title,
          event.city,
          event.venue || '',
          event.startsAt,
          event.status,
          event.id
        );
    } else {
      this.#db
        .prepare(
          `INSERT INTO events (id, organizer_id, title, city, venue, starts_at, status)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          event.id,
          event.organizerId,
          event.title,
          event.city,
          event.venue || '',
          event.startsAt,
          event.status
        );
    }
    return this.findEventById(event.id);
  }

  async findEventById(id) {
    const row = this.#db.prepare('SELECT * FROM events WHERE id = ?').get(id);
    if (!row) return null;

    const tiers = this.#db.prepare('SELECT id FROM ticket_tiers WHERE event_id = ?').all(id);
    return {
      id: row.id,
      organizerId: row.organizer_id,
      title: row.title,
      city: row.city,
      venue: row.venue,
      startsAt: row.starts_at,
      status: row.status,
      tierIds: tiers.map((t) => t.id),
    };
  }

  async listEvents() {
    const rows = this.#db.prepare('SELECT * FROM events').all();
    return rows.map((row) => {
      const tiers = this.#db.prepare('SELECT id FROM ticket_tiers WHERE event_id = ?').all(row.id);
      return {
        id: row.id,
        organizerId: row.organizer_id,
        title: row.title,
        city: row.city,
        venue: row.venue,
        startsAt: row.starts_at,
        status: row.status,
        tierIds: tiers.map((t) => t.id),
      };
    });
  }

  // --- Ticket Tiers ---
  async saveTier(tier) {
    const existing = this.#db.prepare('SELECT id FROM ticket_tiers WHERE id = ?').get(tier.id);
    if (existing) {
      this.#db
        .prepare(
          `UPDATE ticket_tiers
           SET event_id = ?, name = ?, price_cents = ?, capacity = ?, sold = ?
           WHERE id = ?`
        )
        .run(tier.eventId, tier.name, tier.priceCents, tier.capacity, tier.sold ?? 0, tier.id);
    } else {
      this.#db
        .prepare(
          `INSERT INTO ticket_tiers (id, event_id, name, price_cents, capacity, sold)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(tier.id, tier.eventId, tier.name, tier.priceCents, tier.capacity, tier.sold ?? 0);
    }
    return this.findTierById(tier.id);
  }

  async findTierById(id) {
    const row = this.#db.prepare('SELECT * FROM ticket_tiers WHERE id = ?').get(id);
    if (!row) return null;
    return {
      id: row.id,
      eventId: row.event_id,
      name: row.name,
      priceCents: row.price_cents,
      capacity: row.capacity,
      sold: row.sold,
    };
  }

  async listTiersByEventId(eventId) {
    const rows = this.#db.prepare('SELECT * FROM ticket_tiers WHERE event_id = ?').all(eventId);
    return rows.map((row) => ({
      id: row.id,
      eventId: row.event_id,
      name: row.name,
      priceCents: row.price_cents,
      capacity: row.capacity,
      sold: row.sold,
    }));
  }

  // Atomic seat reservation in the database to prevent overselling.
  // Updates sold only if sold + soldDelta <= capacity.
  // Returns the updated tier, or throws DomainError('SOLD_OUT') if changes === 0.
  async updateTierSold(tierId, soldDelta) {
    if (soldDelta > 0) {
      const result = this.#db
        .prepare(
          `UPDATE ticket_tiers
           SET sold = sold + ?
           WHERE id = ? AND sold + ? <= capacity`
        )
        .run(soldDelta, tierId, soldDelta);

      if (result.changes === 0) {
        const tier = await this.findTierById(tierId);
        if (!tier) return null;
        throw new DomainError('SOLD_OUT', `${tier.name} is sold out`);
      }
    } else if (soldDelta < 0) {
      this.#db
        .prepare(
          `UPDATE ticket_tiers
           SET sold = sold + ?
           WHERE id = ? AND sold + ? >= 0`
        )
        .run(soldDelta, tierId, soldDelta);
    }

    return this.findTierById(tierId);
  }

  // --- Bookings ---
  async saveBooking(booking) {
    const existing = this.#db.prepare('SELECT id FROM bookings WHERE id = ?').get(booking.id);
    if (existing) {
      this.#db
        .prepare(
          `UPDATE bookings
           SET reference = ?, user_id = ?, tier_id = ?, event_id = ?, quantity = ?, amount_cents = ?, status = ?, transaction_id = ?, paid_at = ?
           WHERE id = ?`
        )
        .run(
          booking.reference,
          booking.userId,
          booking.tierId,
          booking.eventId,
          booking.quantity,
          booking.amountCents,
          booking.status,
          booking.transactionId || null,
          booking.paidAt || null,
          booking.id
        );
    } else {
      this.#db
        .prepare(
          `INSERT INTO bookings (id, reference, user_id, tier_id, event_id, quantity, amount_cents, status, transaction_id, paid_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          booking.id,
          booking.reference,
          booking.userId,
          booking.tierId,
          booking.eventId,
          booking.quantity,
          booking.amountCents,
          booking.status,
          booking.transactionId || null,
          booking.paidAt || null,
          booking.createdAt
        );
    }
    return this.findBookingByReference(booking.reference);
  }

  async findBookingByReference(reference) {
    const row = this.#db.prepare('SELECT * FROM bookings WHERE reference = ?').get(reference);
    if (!row) return null;
    return {
      id: row.id,
      reference: row.reference,
      userId: row.user_id,
      tierId: row.tier_id,
      eventId: row.event_id,
      quantity: row.quantity,
      amountCents: row.amount_cents,
      status: row.status,
      transactionId: row.transaction_id,
      paidAt: row.paid_at,
      createdAt: row.created_at,
    };
  }

  async updateBookingStatus(reference, status) {
    this.#db.prepare('UPDATE bookings SET status = ? WHERE reference = ?').run(status, reference);
    return this.findBookingByReference(reference);
  }

  // Helper for tests/scripts: count total bookings in table
  async countBookingsByTierId(tierId) {
    const row = this.#db
      .prepare('SELECT COUNT(*) as count FROM bookings WHERE tier_id = ?')
      .get(tierId);
    return row.count;
  }
}
