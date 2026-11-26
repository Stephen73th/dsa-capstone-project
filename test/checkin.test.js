import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { signTicketToken, verifyTicketToken } from '../src/lib/ticketToken.js';
import { RateLimiter } from '../src/lib/rateLimit.js';
import { SECURITY_HEADERS, applySecurityHeaders } from '../src/http/securityHeaders.js';
import { CheckinService } from '../src/services/checkinService.js';
import { BookingService } from '../src/services/bookingService.js';
import { MemoryRepository } from '../src/repositories/memory.js';
import { SqliteRepository } from '../src/repositories/sqlite.js';
import { createDatabase } from '../src/db/connection.js';
import { MockPaymentGateway } from '../src/lib/mockPaymentGateway.js';
import { Clock } from '../src/lib/clock.js';
import { signToken } from '../src/lib/token.js';
import { requireRole } from '../src/http/guards.js';

describe('Build 9: Security, QR Ticket Tokens, and Staff Check-in', () => {
  describe('Ticket Token Signing & Verification (ticketToken.js)', () => {
    const testSecret = 'super-secret-key-for-test-tickets-32-bytes!';

    it('signs and verifies a valid ticket token using HMAC-SHA256', () => {
      const token = signTicketToken({ reference: 'REF12345' }, { secret: testSecret });
      assert.ok(typeof token === 'string');
      assert.equal(token.split('.').length, 2);

      const verified = verifyTicketToken(token, { secret: testSecret });
      assert.equal(verified.reference, 'REF12345');
      assert.ok(typeof verified.iat === 'number');
    });

    it('rejects a forged or made-up token with INVALID_TOKEN', () => {
      assert.throws(
        () => verifyTicketToken('invalid.token.here', { secret: testSecret }),
        (err) => err.code === 'INVALID_TOKEN'
      );
    });

    it('rejects a token signed with a different secret', () => {
      const token = signTicketToken({ reference: 'REF12345' }, { secret: testSecret });
      assert.throws(
        () => verifyTicketToken(token, { secret: 'different-secret-key-32-bytes-long!' }),
        (err) => err.code === 'INVALID_TOKEN'
      );
    });

    it('rejects a token whose payload was tampered with', () => {
      const token = signTicketToken({ reference: 'REF12345' }, { secret: testSecret });
      const [payload, sig] = token.split('.');

      // Tamper payload to change reference
      const tamperedPayload = Buffer.from(JSON.stringify({ ref: 'REF99999', iat: 1000 })).toString('base64url');
      const tamperedToken = `${tamperedPayload}.${sig}`;

      assert.throws(
        () => verifyTicketToken(tamperedToken, { secret: testSecret }),
        (err) => err.code === 'INVALID_TOKEN'
      );
    });

    it('enforces that no PII is stored inside the token payload', () => {
      const token = signTicketToken(
        { reference: 'REF12345', name: 'John Doe', email: 'john@example.com' },
        { secret: testSecret }
      );
      const [encodedPayload] = token.split('.');
      const decoded = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf-8'));

      assert.equal(decoded.ref, 'REF12345');
      assert.equal(decoded.name, undefined);
      assert.equal(decoded.email, undefined);
    });
  });

  describe('Security Headers (securityHeaders.js)', () => {
    it('sets CSP without inline scripts and standard security headers', () => {
      const headers = {};
      const mockRes = {
        setHeader(name, value) {
          headers[name] = value;
        },
      };

      applySecurityHeaders(mockRes);

      assert.ok(headers['Content-Security-Policy']);
      assert.ok(headers['Content-Security-Policy'].includes("script-src 'self'"));
      assert.ok(!headers['Content-Security-Policy'].includes("'unsafe-inline'") || !headers['Content-Security-Policy'].includes("script-src 'self' 'unsafe-inline'"));
      assert.equal(headers['X-Content-Type-Options'], 'nosniff');
      assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
      assert.equal(headers['X-Frame-Options'], 'DENY');
    });
  });

  describe('Rate Limiter (rateLimit.js)', () => {
    it('allows requests within threshold and blocks with RATE_LIMITED when exceeded', () => {
      const limiter = new RateLimiter({ windowMs: 1000, maxRequests: 3 });
      const ip = '192.168.1.100';

      limiter.assert(ip);
      limiter.assert(ip);
      limiter.assert(ip);

      assert.throws(
        () => limiter.assert(ip),
        (err) => err.code === 'RATE_LIMITED' && err.message.includes('Too many requests')
      );

      // Different IP is independent
      assert.doesNotThrow(() => limiter.assert('192.168.1.200'));
    });
  });

  describe('Role-Based Guard for Check-in', () => {
    it('allows staff role and rejects attendee role with FORBIDDEN', () => {
      const staffToken = signToken({ sub: 'u-1', email: 'staff@test.com', role: 'staff' });
      const attendeeToken = signToken({ sub: 'u-2', email: 'attendee@test.com', role: 'attendee' });

      const staffReq = { headers: { authorization: `Bearer ${staffToken}` } };
      const attendeeReq = { headers: { authorization: `Bearer ${attendeeToken}` } };

      assert.doesNotThrow(() => requireRole(staffReq, 'staff'));

      assert.throws(
        () => requireRole(attendeeReq, 'staff'),
        (err) => err.code === 'FORBIDDEN'
      );
    });
  });

  for (const repoType of ['MemoryRepository', 'SqliteRepository']) {
    describe(`CheckinService with ${repoType}`, () => {
      let repo;
      let clock;
      let checkinService;
      let bookingService;
      let validToken;
      let bookingRef;

      beforeEach(async () => {
        clock = new Clock();
        clock.set(new Date('2026-11-20T10:00:00.000Z'));

        if (repoType === 'MemoryRepository') {
          repo = new MemoryRepository();
        } else {
          const db = createDatabase(':memory:');
          repo = new SqliteRepository(db);
        }

        checkinService = new CheckinService({ repo, clock });
        const gateway = new MockPaymentGateway();
        bookingService = new BookingService(repo, gateway, { clock });

        // Seed users
        await repo.saveUser({ id: 'staff-1', name: 'Gate Staff', email: 'staff@test.com', role: 'staff' });
        await repo.saveUser({ id: 'attendee-1', name: 'Alice Attendee', email: 'alice@test.com', role: 'attendee' });

        // Seed event and tier
        await repo.saveEvent({
          id: 'event-1',
          organizerId: 'org-1',
          title: 'Lagos Music Awards',
          city: 'Lagos',
          startsAt: '2026-11-20T18:00:00.000Z',
          status: 'published',
        });

        await repo.saveTier({
          id: 'tier-1',
          eventId: 'event-1',
          name: 'VIP',
          priceCents: 25000,
          capacity: 10,
          sold: 0,
        });

        // Create and pay for a booking
        const booking = await bookingService.bookTickets({ tierId: 'tier-1', userId: 'attendee-1', quantity: 1 });
        await bookingService.payBooking(booking.reference, { userId: 'attendee-1' });

        bookingRef = booking.reference;
        validToken = signTicketToken({ reference: bookingRef });
      });

      it('successfully admits attendee with valid token and records check-in timestamp', async () => {
        const result = await checkinService.checkin({ token: validToken, eventId: 'event-1' });
        assert.equal(result.success, true);
        assert.equal(result.reference, bookingRef);
        assert.equal(result.checkedInAt, '2026-11-20T10:00:00.000Z');

        const booking = await repo.findBookingByReference(bookingRef);
        assert.equal(booking.status, 'checked_in');
        assert.equal(booking.checkedInAt, '2026-11-20T10:00:00.000Z');
      });

      it('rejects forged and tampered tokens', async () => {
        await assert.rejects(
          () => checkinService.checkin({ token: 'fake.token.here', eventId: 'event-1' }),
          (err) => err.code === 'INVALID_TOKEN'
        );
      });

      it('rejects a duplicate scan and shows when it was first used', async () => {
        // First scan succeeds
        await checkinService.checkin({ token: validToken, eventId: 'event-1' });

        // Advance clock by 10 minutes
        clock.advance(10 * 60 * 1000);

        // Second scan rejected
        await assert.rejects(
          () => checkinService.checkin({ token: validToken, eventId: 'event-1' }),
          (err) => {
            assert.equal(err.code, 'DUPLICATE_SCAN');
            assert.ok(err.message.includes('2026-11-20T10:00:00.000Z'));
            return true;
          }
        );
      });

      it('rejects ticket presented at a different event with WRONG_EVENT', async () => {
        await assert.rejects(
          () => checkinService.checkin({ token: validToken, eventId: 'event-different-999' }),
          (err) => err.code === 'WRONG_EVENT'
        );
      });

      it('rejects ticket from a cancelled booking', async () => {
        // Cancel the booking
        await bookingService.cancelBooking(bookingRef, { userId: 'attendee-1' });

        await assert.rejects(
          () => checkinService.checkin({ token: validToken, eventId: 'event-1' }),
          (err) => err.code === 'INVALID_STATE' && err.message.includes('cancelled')
        );
      });

      it('handles simultaneous scans: exactly one succeeds and second is rejected', async () => {
        // Run two simultaneous check-ins
        const [res1, res2] = await Promise.allSettled([
          checkinService.checkin({ token: validToken, eventId: 'event-1' }),
          checkinService.checkin({ token: validToken, eventId: 'event-1' }),
        ]);

        const fulfilled = [res1, res2].filter((r) => r.status === 'fulfilled');
        const rejected = [res1, res2].filter((r) => r.status === 'rejected');

        assert.equal(fulfilled.length, 1, 'Exactly one scan must be admitted');
        assert.equal(rejected.length, 1, 'Exactly one scan must be rejected');
        assert.equal(rejected[0].reason.code, 'DUPLICATE_SCAN');
      });
    });
  }
});
