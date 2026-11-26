import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { formatPrice } from '../public/js/ui.js';
import { listEvents, getEvent, createBooking, pay } from '../public/js/api.js';
import { initialEvents } from '../public/js/mockData.js';

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
    let eventsStore;
    const bookingsStore = new Map();

    before(() => {
      eventsStore = JSON.parse(JSON.stringify(initialEvents));

      globalThis.fetch = async (urlStr, options = {}) => {
        const url = new URL(urlStr, 'http://localhost');
        const pathname = url.pathname;
        const method = options.method || 'GET';
        const body = options.body ? (typeof options.body === 'string' ? JSON.parse(options.body) : options.body) : {};

        function jsonRes(status, data) {
          return {
            ok: status >= 200 && status < 300,
            status,
            json: async () => data,
          };
        }

        // GET /api/events
        if (method === 'GET' && pathname === '/api/events') {
          const q = url.searchParams.get('q');
          const city = url.searchParams.get('city');
          const maxPriceCents = url.searchParams.get('maxPriceCents');
          const sort = url.searchParams.get('sort') || 'date';

          let results = eventsStore
            .filter((e) => e.status === 'published')
            .map((e) => {
              const tiers = e.tiers || [];
              const minPriceCents = tiers.length > 0 ? Math.min(...tiers.map((t) => t.priceCents)) : 0;
              const totalSeatsLeft = tiers.reduce((sum, t) => sum + Math.max(0, t.capacity - t.sold), 0);
              return {
                id: e.id,
                title: e.title,
                city: e.city,
                venue: e.venue,
                startsAt: e.startsAt,
                status: e.status,
                tierCount: tiers.length,
                minPriceCents,
                seatsLeft: totalSeatsLeft,
              };
            });

          if (q && q.trim()) {
            const query = q.trim().toLowerCase();
            results = results.filter((e) => e.title.toLowerCase().includes(query) || (e.venue && e.venue.toLowerCase().includes(query)));
          }

          if (city && city.trim()) {
            results = results.filter((e) => e.city.toLowerCase() === city.trim().toLowerCase());
          }

          if (maxPriceCents !== null && maxPriceCents !== undefined && maxPriceCents !== '') {
            results = results.filter((e) => e.minPriceCents <= Number(maxPriceCents));
          }

          if (sort === 'price') {
            results.sort((a, b) => a.minPriceCents - b.minPriceCents);
          } else if (sort === 'availability') {
            results.sort((a, b) => b.seatsLeft - a.seatsLeft);
          } else {
            results.sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
          }

          return jsonRes(200, results);
        }

        // GET /api/events/:id
        const eventMatch = pathname.match(/^\/api\/events\/([^/]+)$/);
        if (method === 'GET' && eventMatch) {
          const id = decodeURIComponent(eventMatch[1]);
          const event = eventsStore.find((e) => e.id === id);
          if (!event) return jsonRes(404, { error: { code: 'NOT_FOUND', message: 'Event not found' } });
          return jsonRes(200, JSON.parse(JSON.stringify(event)));
        }

        // POST /api/bookings
        if (method === 'POST' && pathname === '/api/bookings') {
          const { tierId, quantity = 1 } = body;
          let matchedEvent = null;
          let matchedTier = null;
          for (const ev of eventsStore) {
            for (const t of ev.tiers || []) {
              if (t.id === tierId) {
                matchedEvent = ev;
                matchedTier = t;
                break;
              }
            }
            if (matchedTier) break;
          }

          if (!matchedTier) return jsonRes(404, { error: { code: 'NOT_FOUND', message: 'Tier not found' } });
          const seatsLeft = matchedTier.capacity - matchedTier.sold;
          if (seatsLeft < quantity) {
            return jsonRes(409, { error: { code: 'SOLD_OUT', message: 'Sold out' } });
          }

          matchedTier.sold += quantity;
          const ref = 'REF' + Math.random().toString(36).substring(2, 8).toUpperCase();
          const booking = {
            id: 'b-' + Date.now(),
            reference: ref,
            tierId: matchedTier.id,
            eventId: matchedEvent.id,
            quantity,
            amountCents: matchedTier.priceCents * quantity,
            status: 'pending',
            expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            createdAt: new Date().toISOString(),
          };
          bookingsStore.set(ref, booking);
          return jsonRes(201, booking);
        }

        // POST /api/bookings/:reference/pay
        const payMatch = pathname.match(/^\/api\/bookings\/([^/]+)\/pay$/);
        if (method === 'POST' && payMatch) {
          const ref = decodeURIComponent(payMatch[1]);
          const booking = bookingsStore.get(ref);
          if (!booking) return jsonRes(404, { error: { code: 'NOT_FOUND', message: 'Booking not found' } });
          if (booking.status === 'paid') {
            return jsonRes(409, { error: { code: 'INVALID_TRANSITION', message: 'Already paid' } });
          }
          if (body.shouldDecline) {
            return jsonRes(400, { error: { code: 'PAYMENT_DECLINED', message: 'Card declined' } });
          }
          booking.status = 'paid';
          booking.transactionId = 'tx-' + Date.now();
          booking.paidAt = new Date().toISOString();
          return jsonRes(200, booking);
        }

        return jsonRes(404, { error: { code: 'NOT_FOUND', message: 'Not found' } });
      };
    });

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
