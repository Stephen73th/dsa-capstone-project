// API client layer for the frontend.
// Exports listEvents, getEvent, createBooking, and pay.
// Currently reads from and updates local mock state, returning promises with the same shape as the REST API.
// Pages must never call fetch directly.

import { initialEvents } from './mockData.js';

// Deep clone mock data into memory state
let eventsStore = JSON.parse(JSON.stringify(initialEvents));
const bookingsStore = new Map();

function generateReference() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let ref = '';
  for (let i = 0; i < 8; i++) {
    ref += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return ref;
}

function generateUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * List, filter and sort public published events.
 * Matches the shape of GET /api/events
 */
export async function listEvents({ q, city, maxPriceCents, sort = 'date' } = {}) {
  // Simulate small network delay
  await new Promise((resolve) => setTimeout(resolve, 50));

  let results = eventsStore
    .filter((e) => e.status === 'published')
    .map((e) => {
      const tiers = e.tiers || [];
      const minPriceCents =
        tiers.length > 0 ? Math.min(...tiers.map((t) => t.priceCents)) : 0;
      const totalSeatsLeft = tiers.reduce(
        (sum, t) => sum + Math.max(0, t.capacity - t.sold),
        0
      );

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

  // 1. Text filter (search query)
  if (q && q.trim() !== '') {
    const query = q.trim().toLowerCase();
    results = results.filter(
      (e) =>
        e.title.toLowerCase().includes(query) ||
        (e.venue && e.venue.toLowerCase().includes(query))
    );
  }

  // 2. City filter
  if (city && city.trim() !== '') {
    const targetCity = city.trim().toLowerCase();
    results = results.filter((e) => e.city.toLowerCase() === targetCity);
  }

  // 3. Max price filter
  if (maxPriceCents !== undefined && maxPriceCents !== null && maxPriceCents !== '') {
    const max = Number(maxPriceCents);
    results = results.filter((e) => e.minPriceCents <= max);
  }

  // 4. Sorting
  if (sort === 'price') {
    results.sort((a, b) => a.minPriceCents - b.minPriceCents);
  } else if (sort === 'availability') {
    results.sort((a, b) => b.seatsLeft - a.seatsLeft);
  } else {
    // Default: date
    results.sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  }

  return results;
}

/**
 * Retrieve an event by id including its ticket tiers.
 */
export async function getEvent(id) {
  await new Promise((resolve) => setTimeout(resolve, 50));
  const event = eventsStore.find((e) => e.id === id);
  if (!event) {
    const error = new Error('Event not found');
    error.code = 'NOT_FOUND';
    throw error;
  }
  return JSON.parse(JSON.stringify(event));
}

/**
 * Create a pending booking for a given ticket tier.
 * Matches POST /api/bookings
 */
export async function createBooking({ tierId, quantity, userId = 'attendee-1' }) {
  await new Promise((resolve) => setTimeout(resolve, 60));

  let matchedEvent = null;
  let matchedTier = null;

  for (const event of eventsStore) {
    for (const tier of event.tiers) {
      if (tier.id === tierId) {
        matchedEvent = event;
        matchedTier = tier;
        break;
      }
    }
    if (matchedTier) break;
  }

  if (!matchedTier) {
    const error = new Error('Ticket tier not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  const seatsLeft = matchedTier.capacity - matchedTier.sold;
  if (seatsLeft < quantity) {
    const error = new Error(`${matchedTier.name} is sold out or has insufficient seats`);
    error.code = 'SOLD_OUT';
    throw error;
  }

  // Hold seats
  matchedTier.sold += quantity;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString(); // 5 min hold
  const reference = generateReference();

  const booking = {
    id: generateUuid(),
    reference,
    userId,
    tierId: matchedTier.id,
    eventId: matchedEvent.id,
    tierName: matchedTier.name,
    eventTitle: matchedEvent.title,
    quantity,
    amountCents: matchedTier.priceCents * quantity,
    status: 'pending',
    createdAt: now.toISOString(),
    expiresAt,
  };

  bookingsStore.set(reference, booking);
  return { ...booking };
}

/**
 * Pay for a booking (mock payment).
 * Matches POST /api/bookings/:reference/pay
 */
export async function pay(reference, { userId = 'attendee-1', shouldDecline = false } = {}) {
  await new Promise((resolve) => setTimeout(resolve, 100));

  const booking = bookingsStore.get(reference);
  if (!booking) {
    const error = new Error('Booking not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  if (booking.status === 'paid') {
    const error = new Error('Booking is already paid');
    error.code = 'INVALID_TRANSITION';
    throw error;
  }

  if (shouldDecline) {
    const error = new Error('Your card was declined. Please check the card details and try again.');
    error.code = 'PAYMENT_DECLINED';
    throw error;
  }

  booking.status = 'paid';
  booking.transactionId = generateUuid();
  booking.paidAt = new Date().toISOString();

  return { ...booking };
}
