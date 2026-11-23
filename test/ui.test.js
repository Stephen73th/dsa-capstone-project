import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatPrice } from '../public/js/ui.js';
import { listEvents, getEvent, createBooking, pay } from '../public/js/api.js';

describe('Build 6: Frontend & UI Logic', () => {
  describe('formatPrice', () => {
    it('formats whole cents to Naira (250000 -> ₦2,500)', () => {
      assert.equal(formatPrice(250000), '₦2,500');
    });

    it('formats 0 cents as Free', () => {
      assert.equal(formatPrice(0), 'Free');
    });

    it('formats large numbers with thousand separators', () => {
      assert.equal(formatPrice(1500000), '₦15,000');
    });
  });

  describe('Mock API Client (api.js)', () => {
    it('lists all published events by default sorted by date', async () => {
      const events = await listEvents();
      assert.ok(events.length >= 4);
      for (let i = 0; i < events.length - 1; i++) {
        assert.ok(new Date(events[i].startsAt) <= new Date(events[i + 1].startsAt));
      }
    });

    it('filters events by city ignoring case', async () => {
      const lagosEvents = await listEvents({ city: 'lagos' });
      assert.ok(lagosEvents.length > 0);
      assert.ok(lagosEvents.every((e) => e.city.toLowerCase() === 'lagos'));
    });

    it('filters events by text search', async () => {
      const searchResults = await listEvents({ q: 'jazz' });
      assert.equal(searchResults.length, 1);
      assert.equal(searchResults[0].title, 'Abuja Jazz & Wine Night');
    });

    it('filters events by maximum price', async () => {
      // ₦2,500 = 250000 cents
      const budgetEvents = await listEvents({ maxPriceCents: 250000 });
      assert.ok(budgetEvents.every((e) => e.minPriceCents <= 250000));
    });

    it('identifies sold-out events (seatsLeft === 0)', async () => {
      const events = await listEvents({ q: 'Sold Out' });
      assert.equal(events.length, 1);
      assert.equal(events[0].seatsLeft, 0);
    });

    it('retrieves single event with its tiers', async () => {
      const events = await listEvents();
      const firstEvent = await getEvent(events[0].id);
      assert.equal(firstEvent.id, events[0].id);
      assert.ok(Array.isArray(firstEvent.tiers));
      assert.ok(firstEvent.tiers.length > 0);
    });

    it('rejects booking a sold-out tier with SOLD_OUT', async () => {
      const soldOutEvent = (await listEvents({ q: 'Sold Out' }))[0];
      const eventDetails = await getEvent(soldOutEvent.id);
      const soldOutTier = eventDetails.tiers[0];

      await assert.rejects(
        () => createBooking({ tierId: soldOutTier.id, quantity: 1 }),
        (err) => err.code === 'SOLD_OUT'
      );
    });

    it('creates a pending booking with reference code and expiration', async () => {
      const events = await listEvents({ city: 'Abuja' });
      const event = await getEvent(events[0].id);
      const tier = event.tiers[0];

      const booking = await createBooking({ tierId: tier.id, quantity: 2 });
      assert.equal(booking.status, 'pending');
      assert.equal(booking.quantity, 2);
      assert.ok(booking.reference);
      assert.ok(booking.expiresAt);
      assert.equal(booking.amountCents, tier.priceCents * 2);

      // Decline payment
      await assert.rejects(
        () => pay(booking.reference, { shouldDecline: true }),
        (err) => err.code === 'PAYMENT_DECLINED'
      );

      // Retry payment with success
      const paid = await pay(booking.reference, { shouldDecline: false });
      assert.equal(paid.status, 'paid');
      assert.ok(paid.transactionId);
      assert.ok(paid.paidAt);

      // Paying again is rejected
      await assert.rejects(
        () => pay(booking.reference, { shouldDecline: false }),
        (err) => err.code === 'INVALID_TRANSITION'
      );
    });
  });
});
