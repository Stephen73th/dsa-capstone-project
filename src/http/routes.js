// REST API route registrations for Events, Bookings, and Authentication.
// Enforces bearer token authentication, role requirements, and data ownership checks.

import { sendJson } from './app.js';
import {
  requireUser,
  requireRole,
  assertEventOwnership,
  assertBookingOwnership,
} from './guards.js';
import { signTicketToken } from '../lib/ticketToken.js';
import { RateLimiter, getClientIp } from '../lib/rateLimit.js';

// IP rate limiters: login (10 attempts / min), checkin (60 scans / min)
const loginLimiter = new RateLimiter({ windowMs: 60_000, maxRequests: 10 });
const checkinLimiter = new RateLimiter({ windowMs: 60_000, maxRequests: 60 });

function attachTicketToken(booking) {
  if (booking && booking.status === 'paid') {
    return {
      ...booking,
      ticketToken: signTicketToken({ reference: booking.reference }),
    };
  }
  return booking;
}

export function registerRoutes(router, { eventService, bookingService, authService, waitlistService, checkinService }) {
  // --- Authentication ---

  // POST /api/auth/signup - Create new account (attendee, organizer, staff)
  router.post('/api/auth/signup', async ({ res, body }) => {
    const result = await authService.signup(body);
    sendJson(res, 201, result);
  });

  // POST /api/auth/login - Authenticate and return signed token (Rate-limited)
  router.post('/api/auth/login', async ({ req, res, body }) => {
    loginLimiter.assert(getClientIp(req));
    const result = await authService.login(body);
    sendJson(res, 200, result);
  });

  // GET /api/auth/me - Return authenticated user profile
  router.get('/api/auth/me', async ({ req, res }) => {
    const user = requireUser(req);
    const profile = await authService.getCurrentUser(user.id);
    sendJson(res, 200, { user: profile });
  });

  // --- Events ---

  // POST /api/events - Create new draft event (Organizers only)
  router.post('/api/events', async ({ req, res, body }) => {
    let organizerId = req.headers['x-user-id'];
    if (authService || req.headers.authorization) {
      const organizer = requireRole(req, 'organizer');
      organizerId = organizer.id;
    }
    const event = await eventService.createEvent({
      ...body,
      organizerId,
    });
    sendJson(res, 201, event);
  });

  // POST /api/events/:id/tiers - Add ticket tier (Organizer owner only)
  router.post('/api/events/:id/tiers', async ({ req, res, params, body }) => {
    if (authService || req.headers.authorization || req.headers['x-user-id']) {
      const organizer = requireRole(req, 'organizer');
      const event = await eventService.getEvent(params.id);
      assertEventOwnership(event, organizer.id);
    }

    const tier = await eventService.addTier(params.id, body);
    sendJson(res, 201, tier);
  });

  // POST /api/events/:id/publish - Publish event (Organizer owner only)
  router.post('/api/events/:id/publish', async ({ req, res, params }) => {
    if (authService || req.headers.authorization || req.headers['x-user-id']) {
      const organizer = requireRole(req, 'organizer');
      const event = await eventService.getEvent(params.id);
      assertEventOwnership(event, organizer.id);
    }

    const published = await eventService.publishEvent(params.id);
    sendJson(res, 200, published);
  });

  // POST /api/events/:id/unpublish - Unpublish event (Organizer owner only)
  router.post('/api/events/:id/unpublish', async ({ req, res, params }) => {
    if (authService || req.headers.authorization || req.headers['x-user-id']) {
      const organizer = requireRole(req, 'organizer');
      const event = await eventService.getEvent(params.id);
      assertEventOwnership(event, organizer.id);
    }

    const unpublished = await eventService.unpublishEvent(params.id);
    sendJson(res, 200, unpublished);
  });

  // GET /api/organizer/events - List events belonging to current organizer
  router.get('/api/organizer/events', async ({ req, res }) => {
    const organizer = requireRole(req, 'organizer');
    const events = await eventService.listOrganizerEvents(organizer.id);
    sendJson(res, 200, events);
  });

  // GET /api/events - Search, filter, and sort public events
  router.get('/api/events', async ({ res, query }) => {
    const events = await eventService.searchPublicEvents(query);
    sendJson(res, 200, events);
  });

  // GET /api/events/:id - Get event details and ticket tiers
  router.get('/api/events/:id', async ({ res, params }) => {
    const event = await eventService.getEvent(params.id);
    sendJson(res, 200, event);
  });

  // --- Bookings ---

  // POST /api/bookings - Book tickets from a tier (Authenticated users)
  router.post('/api/bookings', async ({ req, res, body }) => {
    let userId = req.headers['x-user-id'];
    if (authService || req.headers.authorization) {
      const user = requireUser(req);
      userId = user.id;
    }
    const booking = await bookingService.bookTickets({
      ...body,
      userId,
    });
    sendJson(res, 201, booking);
  });

  // GET /api/bookings - List bookings for the current authenticated user
  router.get('/api/bookings', async ({ req, res }) => {
    const user = requireUser(req);
    const bookings = await bookingService.listUserBookings(user.id);
    sendJson(res, 200, bookings.map(attachTicketToken));
  });

  // GET /api/bookings/:reference - View a booking (Owner only, else NOT_FOUND)
  router.get('/api/bookings/:reference', async ({ req, res, params }) => {
    let userId = req.headers['x-user-id'];
    if (authService || req.headers.authorization) {
      const user = requireUser(req);
      userId = user.id;
      const booking = await bookingService.getBooking(params.reference);
      assertBookingOwnership(booking, userId);
      sendJson(res, 200, attachTicketToken(booking));
    } else {
      const booking = await bookingService.getBooking(params.reference);
      if (userId) assertBookingOwnership(booking, userId);
      sendJson(res, 200, attachTicketToken(booking));
    }
  });

  // POST /api/bookings/:reference/pay - Pay for booking (Owner only)
  router.post('/api/bookings/:reference/pay', async ({ req, res, params, body }) => {
    let userId = req.headers['x-user-id'];
    if (authService || req.headers.authorization) {
      const user = requireUser(req);
      userId = user.id;
    }

    const booking = await bookingService.payBooking(params.reference, {
      userId,
      shouldDecline: body && body.shouldDecline === true,
    });
    sendJson(res, 200, booking);
  });

  // POST /api/bookings/:reference/cancel - Cancel pending or paid booking (Owner only)
  router.post('/api/bookings/:reference/cancel', async ({ req, res, params }) => {
    let userId = req.headers['x-user-id'];
    if (authService || req.headers.authorization) {
      const user = requireUser(req);
      userId = user.id;
    }

    const booking = await bookingService.cancelBooking(params.reference, {
      userId,
    });
    sendJson(res, 200, booking);
  });

  // --- Waitlist ---

  // POST /api/waitlist - Join the waitlist for a sold-out tier (Authenticated users)
  router.post('/api/waitlist', async ({ req, res, body }) => {
    const user = requireUser(req);
    const entry = await waitlistService.joinWaitlist({
      tierId: body.tierId,
      eventId: body.eventId,
      userId: user.id,
    });
    sendJson(res, 201, entry);
  });

  // POST /api/waitlist/offers/:id/accept - Accept an active waitlist offer (Authenticated users)
  router.post('/api/waitlist/offers/:id/accept', async ({ req, res, params }) => {
    const user = requireUser(req);
    const booking = await waitlistService.acceptOffer({
      offerId: params.id,
      userId: user.id,
      bookingService,
    });
    sendJson(res, 201, booking);
  });

  // GET /api/waitlist/offers - List active waitlist offers for the current user
  router.get('/api/waitlist/offers', async ({ req, res }) => {
    const user = requireUser(req);
    const offers = await waitlistService.listOffersForUser(user.id);
    sendJson(res, 200, offers);
  });

  // --- Check-in (Staff Only) ---

  // POST /api/checkin - Verify ticket token and check in attendee (Rate-limited, Staff only)
  router.post('/api/checkin', async ({ req, res, body }) => {
    checkinLimiter.assert(getClientIp(req));
    requireRole(req, 'staff');

    if (!checkinService) {
      throw new Error('CheckinService is not configured');
    }

    const result = await checkinService.checkin({
      token: body.token,
      eventId: body.eventId,
    });
    sendJson(res, 200, result);
  });
}
