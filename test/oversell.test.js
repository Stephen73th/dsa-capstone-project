import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../src/db/connection.js';
import { SqliteRepository } from '../src/repositories/sqlite.js';
import { BookingService } from '../src/services/bookingService.js';
import { MockPaymentGateway } from '../src/lib/mockPaymentGateway.js';
import { newId } from '../src/domain/ids.js';

describe('S08: Concurrency and Overselling Protection', () => {
  it('sells the last ticket to exactly 1 person when 50 book simultaneously', async () => {
    // Isolated in-memory SQLite instance for testing
    const db = createDatabase(':memory:');
    const repo = new SqliteRepository(db);
    const paymentGateway = new MockPaymentGateway();
    const bookingService = new BookingService(repo, paymentGateway);

    const eventId = newId();
    const tierId = newId();

    // Setup an event with exactly 1 seat in the tier
    await repo.saveEvent({
      id: eventId,
      organizerId: 'org-test',
      title: 'High Concurrency Concert',
      city: 'Lagos',
      venue: 'National Theatre',
      startsAt: '2026-12-31T20:00:00Z',
      status: 'published',
    });

    await repo.saveTier({
      id: tierId,
      eventId,
      name: 'Single Last Seat',
      priceCents: 10000,
      capacity: 1,
      sold: 0,
    });

    // 50 users attempt to book the single seat at the same instant
    const ATTEMPTS = 50;
    const promises = Array.from({ length: ATTEMPTS }, (_, i) => {
      return bookingService.bookTickets({
        tierId,
        userId: `attendee-${i + 1}`,
        quantity: 1,
      });
    });

    const results = await Promise.allSettled(promises);

    const successful = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly 1 winner
    assert.equal(successful.length, 1, 'Expected exactly 1 booking to succeed');

    // 49 rejected with SOLD_OUT
    assert.equal(rejected.length, 49, 'Expected exactly 49 bookings to be rejected');
    for (const r of rejected) {
      assert.equal(
        r.reason.code,
        'SOLD_OUT',
        `Expected error code to be SOLD_OUT, got ${r.reason.code}`
      );
    }

    // Verify database state: capacity and sold count
    const tier = await repo.findTierById(tierId);
    assert.equal(tier.capacity, 1);
    assert.equal(tier.sold, 1, 'Tier sold count must equal 1');

    // Verify actual saved bookings count in database
    const bookingCount = await repo.countBookingsByTierId(tierId);
    assert.equal(bookingCount, 1, 'Exactly 1 booking record should exist in the database');
  });
});
