// REST API route registrations.
// Parses parameters and delegating logic to the injected services.

import { sendJson } from './app.js';

export function registerRoutes(router, { eventService, bookingService }) {
  // --- Events ---

  // POST /api/events - Create new draft event
  router.post('/api/events', async ({ req, res, body }) => {
    const organizerId = req.headers['x-user-id'];
    const event = await eventService.createEvent({
      ...body,
      organizerId,
    });
    sendJson(res, 201, event);
  });

  // POST /api/events/:id/tiers - Add ticket tier to event
  router.post('/api/events/:id/tiers', async ({ res, params, body }) => {
    const tier = await eventService.addTier(params.id, body);
    sendJson(res, 201, tier);
  });

  // POST /api/events/:id/publish - Publish event
  router.post('/api/events/:id/publish', async ({ res, params }) => {
    const event = await eventService.publishEvent(params.id);
    sendJson(res, 200, event);
  });

  // GET /api/events - Search, filter, and sort public events
  router.get('/api/events', async ({ res, query }) => {
    const events = await eventService.searchPublicEvents(query);
    sendJson(res, 200, events);
  });

  // --- Bookings ---

  // POST /api/bookings - Book tickets from a tier
  router.post('/api/bookings', async ({ req, res, body }) => {
    const userId = req.headers['x-user-id'];
    const booking = await bookingService.bookTickets({
      ...body,
      userId,
    });
    sendJson(res, 201, booking);
  });

  // POST /api/bookings/:reference/pay - Pay for booking
  router.post('/api/bookings/:reference/pay', async ({ req, res, params, body }) => {
    const userId = req.headers['x-user-id'];
    const booking = await bookingService.payBooking(params.reference, {
      userId,
      shouldDecline: body.shouldDecline === true,
    });
    sendJson(res, 200, booking);
  });

  // POST /api/bookings/:reference/cancel - Cancel pending booking
  router.post('/api/bookings/:reference/cancel', async ({ req, res, params }) => {
    const userId = req.headers['x-user-id'];
    const booking = await bookingService.cancelBooking(params.reference, {
      userId,
    });
    sendJson(res, 200, booking);
  });
}
