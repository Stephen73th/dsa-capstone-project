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
           SET reference = ?, user_id = ?, tier_id = ?, event_id = ?, quantity = ?, amount_cents = ?,
               refund_cents = ?, status = ?, transaction_id = ?, paid_at = ?, expires_at = ?, checked_in_at = ?
           WHERE id = ?`
        )
        .run(
          booking.reference,
          booking.userId,
          booking.tierId,
          booking.eventId,
          booking.quantity,
          booking.amountCents,
          booking.refundCents ?? 0,
          booking.status,
          booking.transactionId || null,
          booking.paidAt || null,
          booking.expiresAt || null,
          booking.checkedInAt || null,
          booking.id
        );
    } else {
      this.#db
        .prepare(
          `INSERT INTO bookings (id, reference, user_id, tier_id, event_id, quantity, amount_cents,
                                 refund_cents, status, transaction_id, paid_at, expires_at, checked_in_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          booking.id,
          booking.reference,
          booking.userId,
          booking.tierId,
          booking.eventId,
          booking.quantity,
          booking.amountCents,
          booking.refundCents ?? 0,
          booking.status,
          booking.transactionId || null,
          booking.paidAt || null,
          booking.expiresAt || null,
          booking.checkedInAt || null,
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
      refundCents: row.refund_cents ?? 0,
      status: row.status,
      transactionId: row.transaction_id,
      paidAt: row.paid_at,
      expiresAt: row.expires_at,
      checkedInAt: row.checked_in_at,
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

  // --- Users ---
  async saveUser(user) {
    const existing = this.#db.prepare('SELECT id FROM users WHERE id = ?').get(user.id);
    if (existing) {
      this.#db
        .prepare('UPDATE users SET name = ?, email = ?, password_hash = ?, role = ? WHERE id = ?')
        .run(user.name, user.email, user.passwordHash || null, user.role, user.id);
    } else {
      this.#db
        .prepare('INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)')
        .run(user.id, user.name, user.email, user.passwordHash || null, user.role);
    }
    return this.findUserById(user.id);
  }

  async findUserById(id) {
    const row = this.#db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      passwordHash: row.password_hash,
      role: row.role,
    };
  }

  async findUserByEmail(email) {
    if (!email) return null;
    const row = this.#db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email.trim());
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      passwordHash: row.password_hash,
      role: row.role,
    };
  }

  async listBookingsByUserId(userId) {
    const rows = this.#db
      .prepare('SELECT * FROM bookings WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId);
    return rows.map((row) => ({
      id: row.id,
      reference: row.reference,
      userId: row.user_id,
      tierId: row.tier_id,
      eventId: row.event_id,
      quantity: row.quantity,
      amountCents: row.amount_cents,
      refundCents: row.refund_cents ?? 0,
      status: row.status,
      transactionId: row.transaction_id,
      paidAt: row.paid_at,
      expiresAt: row.expires_at,
      checkedInAt: row.checked_in_at,
      createdAt: row.created_at,
    }));
  }

  async listEventsByOrganizerId(organizerId) {
    const rows = this.#db
      .prepare('SELECT * FROM events WHERE organizer_id = ? ORDER BY starts_at ASC')
      .all(organizerId);
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

  // --- Atomic Status Transitions & Maintenance ---

  async checkinBookingAtomic(reference, checkedInAt) {
    const result = this.#db
      .prepare(
        `UPDATE bookings
         SET status = 'checked_in', checked_in_at = ?
         WHERE reference = ? AND status = 'paid'`
      )
      .run(checkedInAt, reference);
    return result.changes > 0;
  }

  async updateBookingStatusAtomic(reference, fromStatus, toStatus, extraFields = {}) {
    const sets = ['status = ?'];
    const params = [toStatus];
    if (extraFields.paidAt !== undefined) {
      sets.push('paid_at = ?');
      params.push(extraFields.paidAt);
    }
    if (extraFields.transactionId !== undefined) {
      sets.push('transaction_id = ?');
      params.push(extraFields.transactionId);
    }
    params.push(reference, fromStatus);
    const result = this.#db
      .prepare(`UPDATE bookings SET ${sets.join(', ')} WHERE reference = ? AND status = ?`)
      .run(...params);
    return result.changes > 0;
  }

  async listPendingBookingsBefore(isoDate) {
    const rows = this.#db
      .prepare('SELECT * FROM bookings WHERE status = ? AND created_at <= ?')
      .all('pending', isoDate);
    return rows.map((row) => ({
      id: row.id,
      reference: row.reference,
      userId: row.user_id,
      tierId: row.tier_id,
      eventId: row.event_id,
      quantity: row.quantity,
      amountCents: row.amount_cents,
      refundCents: row.refund_cents ?? 0,
      status: row.status,
      transactionId: row.transaction_id,
      paidAt: row.paid_at,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    }));
  }

  // --- Waitlist ---

  async addToWaitlist({ id, tierId, eventId, userId, createdAt }) {
    this.#db
      .prepare(
        `INSERT INTO waitlist_entries (id, tier_id, event_id, user_id, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(id, tierId, eventId, userId, createdAt);
    return { id, tierId, eventId, userId, createdAt };
  }

  async findWaitlistEntry(tierId, userId) {
    const row = this.#db
      .prepare('SELECT * FROM waitlist_entries WHERE tier_id = ? AND user_id = ?')
      .get(tierId, userId);
    if (!row) return null;
    return {
      id: row.id,
      tierId: row.tier_id,
      eventId: row.event_id,
      userId: row.user_id,
      createdAt: row.created_at,
    };
  }

  async getNextWaitlistEntry(tierId) {
    const row = this.#db
      .prepare(
        `SELECT we.* FROM waitlist_entries we
         LEFT JOIN waitlist_offers wo ON wo.waitlist_entry_id = we.id AND wo.status = 'active'
         WHERE we.tier_id = ? AND wo.id IS NULL
         ORDER BY we.created_at ASC
         LIMIT 1`
      )
      .get(tierId);
    if (!row) return null;
    return {
      id: row.id,
      tierId: row.tier_id,
      eventId: row.event_id,
      userId: row.user_id,
      createdAt: row.created_at,
    };
  }

  async removeWaitlistEntry(id) {
    const result = this.#db.prepare('DELETE FROM waitlist_entries WHERE id = ?').run(id);
    return result.changes > 0;
  }

  async createWaitlistOffer({ id, tierId, eventId, userId, waitlistEntryId, expiresAt, createdAt, status = 'active' }) {
    this.#db
      .prepare(
        `INSERT INTO waitlist_offers (id, tier_id, event_id, user_id, waitlist_entry_id, status, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, tierId, eventId, userId, waitlistEntryId, status, expiresAt, createdAt);
    return { id, tierId, eventId, userId, waitlistEntryId, status, expiresAt, createdAt };
  }

  async findWaitlistOfferById(id) {
    const row = this.#db.prepare('SELECT * FROM waitlist_offers WHERE id = ?').get(id);
    if (!row) return null;
    return {
      id: row.id,
      tierId: row.tier_id,
      eventId: row.event_id,
      userId: row.user_id,
      waitlistEntryId: row.waitlist_entry_id,
      status: row.status,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };
  }

  async findActiveWaitlistOffer(tierId, userId) {
    const row = this.#db
      .prepare('SELECT * FROM waitlist_offers WHERE tier_id = ? AND user_id = ? AND status = ?')
      .get(tierId, userId, 'active');
    if (!row) return null;
    return {
      id: row.id,
      tierId: row.tier_id,
      eventId: row.event_id,
      userId: row.user_id,
      waitlistEntryId: row.waitlist_entry_id,
      status: row.status,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };
  }

  async listActiveWaitlistOffersForUser(userId) {
    const rows = this.#db
      .prepare(
        `SELECT wo.*, e.title as event_title, tt.name as tier_name, tt.price_cents
         FROM waitlist_offers wo
         JOIN events e ON e.id = wo.event_id
         JOIN ticket_tiers tt ON tt.id = wo.tier_id
         WHERE wo.user_id = ? AND wo.status = 'active'
         ORDER BY wo.expires_at ASC`
      )
      .all(userId);
    return rows.map((row) => ({
      id: row.id,
      tierId: row.tier_id,
      eventId: row.event_id,
      userId: row.user_id,
      waitlistEntryId: row.waitlist_entry_id,
      status: row.status,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      eventTitle: row.event_title,
      tierName: row.tier_name,
      priceCents: row.price_cents,
    }));
  }

  async listExpiredWaitlistOffers(nowIso) {
    const rows = this.#db
      .prepare('SELECT * FROM waitlist_offers WHERE status = ? AND expires_at <= ?')
      .all('active', nowIso);
    return rows.map((row) => ({
      id: row.id,
      tierId: row.tier_id,
      eventId: row.event_id,
      userId: row.user_id,
      waitlistEntryId: row.waitlist_entry_id,
      status: row.status,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    }));
  }

  async updateWaitlistOfferStatus(id, newStatus) {
    const result = this.#db
      .prepare('UPDATE waitlist_offers SET status = ? WHERE id = ?')
      .run(newStatus, id);
    return result.changes > 0;
  }
}
