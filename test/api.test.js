import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/http/app.js';
import { MemoryRepository } from '../src/repositories/memory.js';
import { MockPaymentGateway } from '../src/lib/mockPaymentGateway.js';
import { EventService } from '../src/services/eventService.js';
import { BookingService } from '../src/services/bookingService.js';

describe('REST API (End-to-End)', () => {
  let server;
  let baseUrl;

  before(async () => {
    const repository = new MemoryRepository();
    const paymentGateway = new MockPaymentGateway();
    const eventService = new EventService(repository);
    const bookingService = new BookingService(repository, paymentGateway);

    const app = createApp({ eventService, bookingService });
    server = app.server;

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  // --- S02: Create Event ---
  describe('S02: Event Creation', () => {
    it('creates an event in draft status (201)', async () => {
      const res = await fetch(`${baseUrl}/api/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'org-1',
        },
        body: JSON.stringify({
          title: 'Lagos Tech Meetup',
          city: 'Lagos',
          venue: 'Yaba Hub',
          startsAt: '2026-12-05T17:00:00Z',
        }),
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.title, 'Lagos Tech Meetup');
      assert.equal(data.status, 'draft');
      assert.equal(data.organizerId, 'org-1');
      assert.ok(data.id);
    });

    it('rejects invalid event data with VALIDATION (400)', async () => {
      const res = await fetch(`${baseUrl}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '',
          city: 'Lagos',
          startsAt: 'not-a-date',
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error.code, 'VALIDATION');
    });
  });

  // --- S03 & S04: Tiers & Publishing ---
  describe('S03 & S04: Tiers and Publishing', () => {
    let eventId;

    before(async () => {
      const res = await fetch(`${baseUrl}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'org-1' },
        body: JSON.stringify({
          title: 'Concert Night',
          city: 'Abuja',
          venue: 'Grand Arena',
          startsAt: '2026-12-10T19:00:00Z',
        }),
      });
      const data = await res.json();
      eventId = data.id;
    });

    it('rejects publishing an event with no tiers with INVALID_STATE (409)', async () => {
      const res = await fetch(`${baseUrl}/api/events/${eventId}/publish`, {
        method: 'POST',
      });
      assert.equal(res.status, 409);
      const data = await res.json();
      assert.equal(data.error.code, 'INVALID_STATE');
    });

    it('adds a tier with price and capacity (201)', async () => {
      const res = await fetch(`${baseUrl}/api/events/${eventId}/tiers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'VIP',
          priceCents: 1500000,
          capacity: 5,
        }),
      });
      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.name, 'VIP');
      assert.equal(data.capacity, 5);
      assert.equal(data.sold, 0);
    });

    it('rejects adding a tier to nonexistent event with NOT_FOUND (404)', async () => {
      const res = await fetch(`${baseUrl}/api/events/nonexistent-id/tiers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'VIP',
          priceCents: 1000,
          capacity: 10,
        }),
      });
      assert.equal(res.status, 404);
      const data = await res.json();
      assert.equal(data.error.code, 'NOT_FOUND');
    });

    it('publishes the event successfully (200)', async () => {
      const res = await fetch(`${baseUrl}/api/events/${eventId}/publish`, {
        method: 'POST',
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, 'published');
    });
  });

  // --- S05: Search & Filter ---
  describe('S05: Public Search & Filter', () => {
    it('returns published events matching filter criteria (200)', async () => {
      const res = await fetch(`${baseUrl}/api/events?city=abuja`);
      assert.equal(res.status, 200);
      const events = await res.json();
      assert.ok(Array.isArray(events));
      assert.ok(events.some((e) => e.title === 'Concert Night'));
      // Drafts should not appear
      assert.ok(!events.some((e) => e.title === 'Lagos Tech Meetup'));
    });
  });

  // --- S06 & S07: Booking & Payment ---
  describe('S06 & S07: Booking, Payment, and Cancellation', () => {
    let tierId;

    before(async () => {
      // Create and publish an event with a limited tier
      const eventRes = await fetch(`${baseUrl}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'org-1' },
        body: JSON.stringify({
          title: 'Exclusive Workshop',
          city: 'Lagos',
          startsAt: '2026-12-15T10:00:00Z',
        }),
      });
      const eventData = await eventRes.json();

      const tierRes = await fetch(`${baseUrl}/api/events/${eventData.id}/tiers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Standard',
          priceCents: 2000,
          capacity: 2,
        }),
      });
      const tierData = await tierRes.json();
      tierId = tierData.id;

      await fetch(`${baseUrl}/api/events/${eventData.id}/publish`, { method: 'POST' });
    });

    it('books tickets successfully (201)', async () => {
      const res = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'ada' },
        body: JSON.stringify({ tierId, quantity: 1 }),
      });
      assert.equal(res.status, 201);
      const booking = await res.json();
      assert.equal(booking.userId, 'ada');
      assert.equal(booking.quantity, 1);
      assert.equal(booking.amountCents, 2000);
      assert.equal(booking.status, 'pending');
      assert.ok(booking.reference);
    });

    it('rejects overselling with SOLD_OUT (409)', async () => {
      // 1 seat left, request 2
      const res = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'bayo' },
        body: JSON.stringify({ tierId, quantity: 2 }),
      });
      assert.equal(res.status, 409);
      const data = await res.json();
      assert.equal(data.error.code, 'SOLD_OUT');
    });

    it('handles card decline: rejects with PAYMENT_DECLINED (400) and booking stays pending', async () => {
      // Book the last ticket
      const bookRes = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'chidi' },
        body: JSON.stringify({ tierId, quantity: 1 }),
      });
      const booking = await bookRes.json();

      // Pay with decline
      const payRes = await fetch(`${baseUrl}/api/bookings/${booking.reference}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'chidi' },
        body: JSON.stringify({ shouldDecline: true }),
      });
      assert.equal(payRes.status, 400);
      const errorData = await payRes.json();
      assert.equal(errorData.error.code, 'PAYMENT_DECLINED');

      // Pay with success on retry
      const retryRes = await fetch(`${baseUrl}/api/bookings/${booking.reference}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'chidi' },
        body: JSON.stringify({ shouldDecline: false }),
      });
      assert.equal(retryRes.status, 200);
      const paidData = await retryRes.json();
      assert.equal(paidData.status, 'paid');
      assert.ok(paidData.transactionId);
    });

    it('rejects paying an already paid booking with INVALID_TRANSITION (409)', async () => {
      // Create and pay for a booking
      const eRes = await fetch(`${baseUrl}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'org-1' },
        body: JSON.stringify({ title: 'Already Paid Test', city: 'Abuja', startsAt: '2026-12-22' }),
      });
      const ev = await eRes.json();
      const tRes = await fetch(`${baseUrl}/api/events/${ev.id}/tiers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Standard', priceCents: 500, capacity: 5 }),
      });
      const t = await tRes.json();
      await fetch(`${baseUrl}/api/events/${ev.id}/publish`, { method: 'POST' });

      const bRes = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'dayo' },
        body: JSON.stringify({ tierId: t.id, quantity: 1 }),
      });
      const booking = await bRes.json();

      // Pay first time
      const payRes = await fetch(`${baseUrl}/api/bookings/${booking.reference}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'dayo' },
        body: JSON.stringify({ shouldDecline: false }),
      });
      assert.equal(payRes.status, 200);

      // Attempt paying again
      const payAgainRes = await fetch(`${baseUrl}/api/bookings/${booking.reference}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'dayo' },
        body: JSON.stringify({ shouldDecline: false }),
      });
      assert.equal(payAgainRes.status, 409);
      const payAgainData = await payAgainRes.json();
      assert.equal(payAgainData.error.code, 'INVALID_TRANSITION');
    });

    it('rejects payment if user is not the booking owner with FORBIDDEN (403)', async () => {
      const eRes = await fetch(`${baseUrl}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'org-1' },
        body: JSON.stringify({ title: 'Owner Auth Test', city: 'Ibadan', startsAt: '2026-12-23' }),
      });
      const ev = await eRes.json();
      const tRes = await fetch(`${baseUrl}/api/events/${ev.id}/tiers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Regular', priceCents: 1000, capacity: 5 }),
      });
      const t = await tRes.json();
      await fetch(`${baseUrl}/api/events/${ev.id}/publish`, { method: 'POST' });

      const bRes = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'owner-user' },
        body: JSON.stringify({ tierId: t.id, quantity: 1 }),
      });
      const b = await bRes.json();

      const payRes = await fetch(`${baseUrl}/api/bookings/${b.reference}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'intruder-user' },
        body: JSON.stringify({ shouldDecline: false }),
      });
      assert.equal(payRes.status, 403);
      const errData = await payRes.json();
      assert.equal(errData.error.code, 'FORBIDDEN');
    });

    it('cancels pending booking and releases seats', async () => {
      // Create new event to test clean cancel
      const eRes = await fetch(`${baseUrl}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'org-1' },
        body: JSON.stringify({ title: 'Cancel Test', city: 'Kano', startsAt: '2026-12-20' }),
      });
      const ev = await eRes.json();
      const tRes = await fetch(`${baseUrl}/api/events/${ev.id}/tiers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Seat', priceCents: 1000, capacity: 1 }),
      });
      const t = await tRes.json();
      await fetch(`${baseUrl}/api/events/${ev.id}/publish`, { method: 'POST' });

      // Book
      const bRes = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'user-cancel' },
        body: JSON.stringify({ tierId: t.id, quantity: 1 }),
      });
      const b = await bRes.json();

      // Another user cannot cancel
      const forbiddenRes = await fetch(`${baseUrl}/api/bookings/${b.reference}/cancel`, {
        method: 'POST',
        headers: { 'x-user-id': 'intruder' },
      });
      assert.equal(forbiddenRes.status, 403);

      // Owner cancels
      const cancelRes = await fetch(`${baseUrl}/api/bookings/${b.reference}/cancel`, {
        method: 'POST',
        headers: { 'x-user-id': 'user-cancel' },
      });
      assert.equal(cancelRes.status, 200);
      const cancelled = await cancelRes.json();
      assert.equal(cancelled.status, 'cancelled');

      // Attempting to pay cancelled booking fails with INVALID_TRANSITION (409)
      const payCancelRes = await fetch(`${baseUrl}/api/bookings/${b.reference}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'user-cancel' },
        body: JSON.stringify({ shouldDecline: false }),
      });
      assert.equal(payCancelRes.status, 409);
      const payErr = await payCancelRes.json();
      assert.equal(payErr.error.code, 'INVALID_TRANSITION');
    });
  });
});
