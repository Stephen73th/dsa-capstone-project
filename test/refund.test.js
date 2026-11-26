import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { calculateRefund } from '../src/domain/refundPolicy.js';
import { Clock } from '../src/lib/clock.js';
import { MemoryRepository } from '../src/repositories/memory.js';
import { SqliteRepository } from '../src/repositories/sqlite.js';
import { createDatabase } from '../src/db/connection.js';
import { MockPaymentGateway } from '../src/lib/mockPaymentGateway.js';
import { BookingService } from '../src/services/bookingService.js';
import { WaitlistService } from '../src/services/waitlistService.js';
import { runMaintenance } from '../src/jobs/maintenance.js';

describe('Build 8: Refund Policy, Booking Expiry, and Waitlist', () => {
  describe('Pure Refund Policy (calculateRefund)', () => {
    const ONE_HOUR_MS = 60 * 60 * 1000;
    const ONE_DAY_MS = 24 * ONE_HOUR_MS;
    const eventStart = new Date('2026-12-10T12:00:00.000Z');

    it('returns 100% refund when cancelled 7 or more days prior', () => {
      // Exactly 7 days before
      const exactly7Days = new Date(eventStart.getTime() - 7 * ONE_DAY_MS);
      const res1 = calculateRefund({ amountCents: 10000, startsAt: eventStart, now: exactly7Days });
      assert.equal(res1.percentage, 100);
      assert.equal(res1.refundCents, 10000);

      // 10 days before
      const tenDays = new Date(eventStart.getTime() - 10 * ONE_DAY_MS);
      const res2 = calculateRefund({ amountCents: 15000, startsAt: eventStart, now: tenDays });
      assert.equal(res2.percentage, 100);
      assert.equal(res2.refundCents, 15000);
    });

    it('returns 50% refund when cancelled between 2 and 7 days prior', () => {
      // 6 days and 23 hours before
      const justUnder7Days = new Date(eventStart.getTime() - (7 * ONE_DAY_MS - ONE_HOUR_MS));
      const res1 = calculateRefund({ amountCents: 10000, startsAt: eventStart, now: justUnder7Days });
      assert.equal(res1.percentage, 50);
      assert.equal(res1.refundCents, 5000);

      // Exactly 2 days before (boundary belongs to higher tier)
      const exactly2Days = new Date(eventStart.getTime() - 2 * ONE_DAY_MS);
      const res2 = calculateRefund({ amountCents: 10000, startsAt: eventStart, now: exactly2Days });
      assert.equal(res2.percentage, 50);
      assert.equal(res2.refundCents, 5000);

      // Math.floor on fractional cents: 10001 cents * 0.5 = 5000 cents
      const oddCents = calculateRefund({ amountCents: 10001, startsAt: eventStart, now: exactly2Days });
      assert.equal(oddCents.refundCents, 5000);
    });

    it('returns 0% refund when cancelled less than 2 days prior', () => {
      // 1 day and 23 hours before
      const under2Days = new Date(eventStart.getTime() - (2 * ONE_DAY_MS - ONE_HOUR_MS));
      const res = calculateRefund({ amountCents: 10000, startsAt: eventStart, now: under2Days });
      assert.equal(res.percentage, 0);
      assert.equal(res.refundCents, 0);
    });

    it('throws EVENT_STARTED when the event has already started', () => {
      // Exact start time
      assert.throws(
        () => calculateRefund({ amountCents: 10000, startsAt: eventStart, now: eventStart }),
        (err) => err.code === 'EVENT_STARTED'
      );

      // 1 hour after start
      const afterStart = new Date(eventStart.getTime() + ONE_HOUR_MS);
      assert.throws(
        () => calculateRefund({ amountCents: 10000, startsAt: eventStart, now: afterStart }),
        (err) => err.code === 'EVENT_STARTED'
      );
    });

    it('throws VALIDATION on invalid arguments', () => {
      assert.throws(
        () => calculateRefund({ amountCents: -50, startsAt: eventStart }),
        (err) => err.code === 'VALIDATION'
      );
      assert.throws(
        () => calculateRefund({ amountCents: 10000, startsAt: 'invalid-date' }),
        (err) => err.code === 'VALIDATION'
      );
    });
  });

  describe('Clock Abstraction', () => {
    it('allows freezing, advancing, and resetting simulated time', () => {
      const clock = new Clock();
      const initial = new Date('2026-06-01T10:00:00.000Z');

      clock.set(initial);
      assert.equal(clock.iso(), '2026-06-01T10:00:00.000Z');
      assert.equal(clock.nowMs(), initial.getTime());

      clock.advance(60 * 1000); // advance 1 minute
      assert.equal(clock.iso(), '2026-06-01T10:01:00.000Z');

      clock.reset();
      const realNow = Date.now();
      assert.ok(Math.abs(clock.nowMs() - realNow) < 500);
    });
  });

  for (const repoType of ['MemoryRepository', 'SqliteRepository']) {
    describe(`Services & Integration with ${repoType}`, () => {
      let repo;
      let paymentGateway;
      let clock;
      let bookingService;
      let waitlistService;

      beforeEach(async () => {
        clock = new Clock();
        clock.set(new Date('2026-11-01T10:00:00.000Z'));

        if (repoType === 'MemoryRepository') {
          repo = new MemoryRepository();
        } else {
          const db = createDatabase(':memory:');
          repo = new SqliteRepository(db);
        }

        paymentGateway = new MockPaymentGateway();
        bookingService = new BookingService(repo, paymentGateway, { clock });
        waitlistService = new WaitlistService({ repo, clock });
        bookingService.setWaitlistService(waitlistService);

        // Seed test users
        for (const uid of ['user-1', 'user-2', 'user-3', 'user-4']) {
          await repo.saveUser({
            id: uid,
            name: `User ${uid}`,
            email: `${uid}@test.com`,
            role: 'attendee',
          });
        }

        // Seed test event (starts 10 days after clock time)
        await repo.saveEvent({
          id: 'event-1',
          organizerId: 'org-1',
          title: 'Afrobeats Mega Fest',
          city: 'Lagos',
          venue: 'Eko Atlantic',
          startsAt: '2026-11-11T10:00:00.000Z', // 10 days later
          status: 'published',
        });

        // Seed tier with capacity 2
        await repo.saveTier({
          id: 'tier-1',
          eventId: 'event-1',
          name: 'Regular',
          priceCents: 10000,
          capacity: 2,
          sold: 0,
        });
      });

      it('cancels paid booking with 100% refund when > 7 days before event', async () => {
        const booking = await bookingService.bookTickets({ tierId: 'tier-1', userId: 'user-1', quantity: 1 });
        await bookingService.payBooking(booking.reference, { userId: 'user-1' });

        // Tier sold should be 1
        const tierBefore = await repo.findTierById('tier-1');
        assert.equal(tierBefore.sold, 1);

        // Cancel booking
        const cancelled = await bookingService.cancelBooking(booking.reference, { userId: 'user-1' });
        assert.equal(cancelled.status, 'cancelled');
        assert.equal(cancelled.refundCents, 10000);

        // Tier seat released
        const tierAfter = await repo.findTierById('tier-1');
        assert.equal(tierAfter.sold, 0);

        // Attempting to cancel again fails with state error
        await assert.rejects(
          () => bookingService.cancelBooking(booking.reference, { userId: 'user-1' }),
          (err) => err.code === 'INVALID_STATE' || err.code === 'INVALID_TRANSITION'
        );

        // Seat is NOT released twice
        const tierFinal = await repo.findTierById('tier-1');
        assert.equal(tierFinal.sold, 0);
      });

      it('cancels paid booking with 50% refund when 4 days before event', async () => {
        const booking = await bookingService.bookTickets({ tierId: 'tier-1', userId: 'user-1', quantity: 1 });
        await bookingService.payBooking(booking.reference, { userId: 'user-1' });

        // Advance clock to 4 days before event (event is 2026-11-11, now is 2026-11-07)
        clock.set(new Date('2026-11-07T10:00:00.000Z'));

        const cancelled = await bookingService.cancelBooking(booking.reference, { userId: 'user-1' });
        assert.equal(cancelled.status, 'cancelled');
        assert.equal(cancelled.refundCents, 5000);
      });

      it('cancels paid booking with 0% refund when 1 day before event', async () => {
        const booking = await bookingService.bookTickets({ tierId: 'tier-1', userId: 'user-1', quantity: 1 });
        await bookingService.payBooking(booking.reference, { userId: 'user-1' });

        // Advance clock to 1 day before event (2026-11-10)
        clock.set(new Date('2026-11-10T10:00:00.000Z'));

        const cancelled = await bookingService.cancelBooking(booking.reference, { userId: 'user-1' });
        assert.equal(cancelled.status, 'cancelled');
        assert.equal(cancelled.refundCents, 0);

        // Seat is still released even if refund is 0%
        const tier = await repo.findTierById('tier-1');
        assert.equal(tier.sold, 0);
      });

      it('rejects payment for expired pending booking (5 min hold window)', async () => {
        const booking = await bookingService.bookTickets({ tierId: 'tier-1', userId: 'user-1', quantity: 1 });
        assert.equal(booking.status, 'pending');

        // Advance clock by 6 minutes (past 5 min hold)
        clock.advance(6 * 60 * 1000);

        await assert.rejects(
          () => bookingService.payBooking(booking.reference, { userId: 'user-1' }),
          (err) => err.code === 'BOOKING_EXPIRED'
        );
      });

      it('maintenance job cancels stale pending bookings and restores seats', async () => {
        await bookingService.bookTickets({ tierId: 'tier-1', userId: 'user-1', quantity: 2 });
        const tierFull = await repo.findTierById('tier-1');
        assert.equal(tierFull.sold, 2);

        // Advance clock past 5 minutes
        clock.advance(6 * 60 * 1000);

        // Run maintenance pass
        await runMaintenance({ repo, waitlistService, clock });

        // Seats restored
        const tierRestored = await repo.findTierById('tier-1');
        assert.equal(tierRestored.sold, 0);

        // Booking status is cancelled
        const userBookings = await repo.listBookingsByUserId('user-1');
        assert.equal(userBookings[0].status, 'cancelled');
      });

      it('manages waitlist queue and offers freed tickets upon cancellation', async () => {
        // Fill tier capacity (capacity = 2)
        const b1 = await bookingService.bookTickets({ tierId: 'tier-1', userId: 'user-1', quantity: 1 });
        const b2 = await bookingService.bookTickets({ tierId: 'tier-1', userId: 'user-2', quantity: 1 });
        await bookingService.payBooking(b1.reference, { userId: 'user-1' });
        await bookingService.payBooking(b2.reference, { userId: 'user-2' });

        // Tier is now sold out
        const tier = await repo.findTierById('tier-1');
        assert.equal(tier.sold, tier.capacity);

        // User 3 cannot book directly
        await assert.rejects(
          () => bookingService.bookTickets({ tierId: 'tier-1', userId: 'user-3', quantity: 1 }),
          (err) => err.code === 'SOLD_OUT'
        );

        // User 3 joins waitlist
        const entry3 = await waitlistService.joinWaitlist({
          tierId: 'tier-1',
          eventId: 'event-1',
          userId: 'user-3',
        });
        assert.ok(entry3.id);

        // User 3 cannot join waitlist twice
        await assert.rejects(
          () => waitlistService.joinWaitlist({ tierId: 'tier-1', eventId: 'event-1', userId: 'user-3' }),
          (err) => err.code === 'ALREADY_ON_WAITLIST'
        );

        // User 4 also joins waitlist (FIFO order)
        clock.advance(1000);
        await waitlistService.joinWaitlist({
          tierId: 'tier-1',
          eventId: 'event-1',
          userId: 'user-4',
        });

        // User 1 cancels their paid booking
        await bookingService.cancelBooking(b1.reference, { userId: 'user-1' });

        // Waitlist offer was automatically generated for User 3 (first in line)
        const offers3 = await waitlistService.listOffersForUser('user-3');
        assert.equal(offers3.length, 1);
        assert.equal(offers3[0].status, 'active');

        // User 4 does not have an offer yet
        const offers4 = await waitlistService.listOffersForUser('user-4');
        assert.equal(offers4.length, 0);

        // User 3 accepts offer -> creates pending booking
        const newBooking = await waitlistService.acceptOffer({
          offerId: offers3[0].id,
          userId: 'user-3',
          bookingService,
        });

        assert.equal(newBooking.userId, 'user-3');
        assert.equal(newBooking.status, 'pending');

        // User 3 can now pay for the booking
        const paidBooking = await bookingService.payBooking(newBooking.reference, { userId: 'user-3' });
        assert.equal(paidBooking.status, 'paid');
      });

      it('expires stale waitlist offers and rolls over to the next person', async () => {
        // Fill tier capacity
        const b1 = await bookingService.bookTickets({ tierId: 'tier-1', userId: 'user-1', quantity: 2 });
        await bookingService.payBooking(b1.reference, { userId: 'user-1' });

        // Two users queue up
        await waitlistService.joinWaitlist({ tierId: 'tier-1', eventId: 'event-1', userId: 'user-3' });
        clock.advance(1000);
        await waitlistService.joinWaitlist({ tierId: 'tier-1', eventId: 'event-1', userId: 'user-4' });

        // Cancellation generates offer for user-3
        await bookingService.cancelBooking(b1.reference, { userId: 'user-1' });
        const offer3 = (await waitlistService.listOffersForUser('user-3'))[0];
        assert.ok(offer3);

        // User 3 fails to accept within 15 minutes hold
        clock.advance(16 * 60 * 1000);

        // Trying to accept expired offer fails
        await assert.rejects(
          () => waitlistService.acceptOffer({ offerId: offer3.id, userId: 'user-3', bookingService }),
          (err) => err.code === 'OFFER_EXPIRED'
        );

        // Maintenance job runs: expires user-3's offer and passes seat to user-4
        await runMaintenance({ repo, waitlistService, clock });

        const offers4 = await waitlistService.listOffersForUser('user-4');
        assert.equal(offers4.length, 1);
        assert.equal(offers4[0].status, 'active');
      });
    });
  }
});
