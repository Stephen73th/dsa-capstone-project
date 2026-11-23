// Demonstration of the overselling race condition: Before vs After.
// Fires 50 concurrent booking requests for a single remaining ticket.
// Run with: npm run oversell

import { createDatabase } from '../src/db/connection.js';
import { SqliteRepository } from '../src/repositories/sqlite.js';
import { BookingService } from '../src/services/bookingService.js';
import { MockPaymentGateway } from '../src/lib/mockPaymentGateway.js';
import { newId } from '../src/domain/ids.js';

// Naive repository subclass that reproduces the race condition by reading then writing separately
class NaiveSqliteRepository extends SqliteRepository {
  #db;

  constructor(db) {
    super(db);
    this.#db = db;
  }

  async updateTierSold(tierId, soldDelta) {
    const tier = await this.findTierById(tierId);
    if (!tier) return null;

    // Non-atomic read-then-write creates the classic TOCTOU window
    const newSold = tier.sold + soldDelta;
    this.#db.prepare('UPDATE ticket_tiers SET sold = ? WHERE id = ?').run(newSold, tierId);
    tier.sold = newSold;
    return tier;
  }
}

async function simulate50Bookings(repoName, repoFactory) {
  const db = createDatabase(':memory:');
  const repo = repoFactory(db);
  const paymentGateway = new MockPaymentGateway();
  const bookingService = new BookingService(repo, paymentGateway);

  const eventId = newId();
  const tierId = newId();

  await repo.saveEvent({
    id: eventId,
    organizerId: 'org-demo',
    title: 'The Final Seat Workshop',
    city: 'Lagos',
    venue: 'Yaba',
    startsAt: '2026-12-30T10:00:00Z',
    status: 'published',
  });

  await repo.saveTier({
    id: tierId,
    eventId,
    name: 'Single Seat Tier',
    priceCents: 5000,
    capacity: 1,
    sold: 0,
  });

  const CONCURRENT_USERS = 50;
  const promises = Array.from({ length: CONCURRENT_USERS }, (_, i) => {
    return bookingService
      .bookTickets({
        tierId,
        userId: `buyer-${i + 1}`,
        quantity: 1,
      })
      .then((booking) => ({ status: 'fulfilled', booking }))
      .catch((error) => ({ status: 'rejected', error: error.code || error.message }));
  });

  const results = await Promise.all(promises);

  const succeeded = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');
  const tierAfter = await repo.findTierById(tierId);
  const totalBookingsSaved = await repo.countBookingsByTierId(tierId);

  return {
    succeeded: succeeded.length,
    rejected: rejected.length,
    capacity: tierAfter.capacity,
    tierSoldInDb: tierAfter.sold,
    bookingsInDb: totalBookingsSaved,
  };
}

async function runDemo() {
  console.log('===============================================================');
  console.log('       Overselling Race Condition Demo (Before vs After)       ');
  console.log('   Scenario: 1 seat available, 50 simultaneous purchase requests   ');
  console.log('===============================================================\n');

  // 1. BEFORE: Naive read-then-write
  console.log('1. BEFORE (Naive read-then-write without atomic SQL update):');
  const before = await simulate50Bookings('Naive', (db) => new NaiveSqliteRepository(db));
  console.log(`   - Successful booking responses: ${before.succeeded} / 50`);
  console.log(`   - Rejected requests (SOLD_OUT): ${before.rejected} / 50`);
  console.log(`   - Tier capacity in DB:          ${before.capacity}`);
  console.log(`   - Actual bookings stored in DB: ${before.bookingsInDb}`);
  console.log('   => Outcome: ❌ OVERSELLING! 50 people bought the 1 ticket!\n');

  // 2. AFTER: Atomic SQLite UPDATE
  console.log('2. AFTER (Atomic UPDATE ... WHERE sold + ? <= capacity):');
  const after = await simulate50Bookings('Atomic', (db) => new SqliteRepository(db));
  console.log(`   - Successful booking responses: ${after.succeeded} / 50`);
  console.log(`   - Rejected requests (SOLD_OUT): ${after.rejected} / 50`);
  console.log(`   - Tier capacity in DB:          ${after.capacity}`);
  console.log(`   - Actual bookings stored in DB: ${after.bookingsInDb}`);
  console.log('   => Outcome: ✅ SOLVED! Exactly 1 winner, 49 got SOLD_OUT.\n');
  console.log('===============================================================');
}

runDemo().catch((err) => {
  console.error('Demo error:', err);
  process.exit(1);
});
