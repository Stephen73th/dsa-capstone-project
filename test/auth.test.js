import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/lib/password.js';
import { signToken, verifyToken } from '../src/lib/token.js';
import { AuthService } from '../src/services/authService.js';
import { EventService } from '../src/services/eventService.js';
import { BookingService } from '../src/services/bookingService.js';
import { MockPaymentGateway } from '../src/lib/mockPaymentGateway.js';
import { MemoryRepository } from '../src/repositories/memory.js';
import {
  requireUser,
  requireRole,
  assertEventOwnership,
  assertBookingOwnership,
} from '../src/http/guards.js';
import { DomainError } from '../src/domain/errors.js';

describe('Build 7: Authentication, Roles, and Ownership', () => {
  describe('Password Hashing (password.js)', () => {
    it('hashes passwords using scrypt with random salt', async () => {
      const hash1 = await hashPassword('password123');
      const hash2 = await hashPassword('password123');

      assert.ok(hash1.includes(':'));
      assert.ok(hash2.includes(':'));
      // Two hashes of the same password must differ due to random salt
      assert.notEqual(hash1, hash2);
    });

    it('verifies correct passwords and rejects wrong ones', async () => {
      const hash = await hashPassword('my-secret-password');
      assert.equal(await verifyPassword('my-secret-password', hash), true);
      assert.equal(await verifyPassword('wrong-password', hash), false);
      assert.equal(await verifyPassword('', hash), false);
    });
  });

  describe('JWT Tokens (token.js)', () => {
    it('signs and verifies HS256 tokens', () => {
      const token = signToken({ sub: 'user-123', role: 'organizer' });
      const payload = verifyToken(token);

      assert.equal(payload.sub, 'user-123');
      assert.equal(payload.role, 'organizer');
      assert.ok(payload.exp > Math.floor(Date.now() / 1000));
    });

    it('rejects tampered tokens with UNAUTHENTICATED', () => {
      const token = signToken({ sub: 'user-123', role: 'attendee' });
      const parts = token.split('.');
      // Tamper with payload
      const tamperedPayload = Buffer.from(
        JSON.stringify({ sub: 'user-123', role: 'organizer' })
      ).toString('base64url');
      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      assert.throws(
        () => verifyToken(tamperedToken),
        (err) => err instanceof DomainError && err.code === 'UNAUTHENTICATED'
      );
    });

    it('rejects expired tokens with UNAUTHENTICATED', () => {
      // Create a token expired 10 seconds ago
      const token = signToken({ sub: 'user-123' }, { expiresInSeconds: -10 });

      assert.throws(
        () => verifyToken(token),
        (err) => err instanceof DomainError && err.code === 'UNAUTHENTICATED' && err.message.includes('expired')
      );
    });

    it('rejects any algorithm other than HS256 with UNAUTHENTICATED', () => {
      // Construct token with alg: none
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ sub: 'user-123' })).toString('base64url');
      const fakeToken = `${header}.${payload}.invalidsig`;

      assert.throws(
        () => verifyToken(fakeToken),
        (err) => err instanceof DomainError && err.code === 'UNAUTHENTICATED'
      );
    });
  });

  describe('AuthService (authService.js)', () => {
    let repo;
    let authService;

    beforeEach(() => {
      repo = new MemoryRepository();
      authService = new AuthService(repo);
    });

    it('signs up an attendee and returns signed token without password hash', async () => {
      const result = await authService.signup({
        email: 'chidi@example.com',
        password: 'securepassword123',
        name: 'Chidi Anagonye',
        role: 'attendee',
      });

      assert.ok(result.token);
      assert.equal(result.user.email, 'chidi@example.com');
      assert.equal(result.user.name, 'Chidi Anagonye');
      assert.equal(result.user.role, 'attendee');
      assert.equal(result.user.passwordHash, undefined);
      assert.equal(result.user.password, undefined);
    });

    it('rejects passwords shorter than 8 characters with VALIDATION', async () => {
      await assert.rejects(
        () =>
          authService.signup({
            email: 'short@example.com',
            password: 'short',
            role: 'attendee',
          }),
        (err) => err instanceof DomainError && err.code === 'VALIDATION'
      );
    });

    it('rejects duplicate email with EMAIL_TAKEN', async () => {
      await authService.signup({
        email: 'duplicate@example.com',
        password: 'password123',
        role: 'attendee',
      });

      await assert.rejects(
        () =>
          authService.signup({
            email: 'duplicate@example.com',
            password: 'anotherpassword',
            role: 'organizer',
          }),
        (err) => err instanceof DomainError && err.code === 'EMAIL_TAKEN'
      );
    });

    it('authenticates valid credentials on login', async () => {
      await authService.signup({
        email: 'login@example.com',
        password: 'correctpassword',
        name: 'Login User',
        role: 'attendee',
      });

      const res = await authService.login({
        email: 'login@example.com',
        password: 'correctpassword',
      });

      assert.ok(res.token);
      assert.equal(res.user.email, 'login@example.com');
    });

    it('rejects wrong password and unknown email with identical INVALID_CREDENTIALS error', async () => {
      await authService.signup({
        email: 'existing@example.com',
        password: 'correctpassword',
        role: 'attendee',
      });

      let err1;
      let err2;

      try {
        await authService.login({ email: 'existing@example.com', password: 'wrongpassword' });
      } catch (err) {
        err1 = err;
      }

      try {
        await authService.login({ email: 'unknown@example.com', password: 'correctpassword' });
      } catch (err) {
        err2 = err;
      }

      assert.ok(err1 instanceof DomainError);
      assert.ok(err2 instanceof DomainError);
      assert.equal(err1.code, 'INVALID_CREDENTIALS');
      assert.equal(err2.code, 'INVALID_CREDENTIALS');
      assert.equal(err1.message, err2.message);
    });
  });

  describe('HTTP Guards & Ownership (guards.js)', () => {
    it('requireUser extracts valid Bearer token and rejects missing/invalid header', () => {
      const token = signToken({ sub: 'user-1', role: 'attendee', email: 'a@b.com' });

      // Valid header
      const user = requireUser({ headers: { authorization: `Bearer ${token}` } });
      assert.equal(user.id, 'user-1');

      // Missing header
      assert.throws(
        () => requireUser({ headers: {} }),
        (err) => err instanceof DomainError && err.code === 'UNAUTHENTICATED'
      );

      // Malformed header
      assert.throws(
        () => requireUser({ headers: { authorization: 'Basic 12345' } }),
        (err) => err instanceof DomainError && err.code === 'UNAUTHENTICATED'
      );
    });

    it('requireRole allows permitted role and refuses forbidden role', () => {
      const attendeeToken = signToken({ sub: 'u1', role: 'attendee' });
      const organizerToken = signToken({ sub: 'u2', role: 'organizer' });

      // Organizer permitted
      const org = requireRole({ headers: { authorization: `Bearer ${organizerToken}` } }, 'organizer');
      assert.equal(org.id, 'u2');

      // Attendee rejected with FORBIDDEN
      assert.throws(
        () => requireRole({ headers: { authorization: `Bearer ${attendeeToken}` } }, 'organizer'),
        (err) => err instanceof DomainError && err.code === 'FORBIDDEN'
      );
    });

    it('assertEventOwnership prevents organizer B from modifying organizer A event', () => {
      const event = { id: 'e1', organizerId: 'org-A', title: 'A Event' };

      // Owner A can modify
      assert.doesNotThrow(() => assertEventOwnership(event, 'org-A'));

      // Owner B is forbidden
      assert.throws(
        () => assertEventOwnership(event, 'org-B'),
        (err) => err instanceof DomainError && err.code === 'FORBIDDEN'
      );
    });

    it('assertBookingOwnership hides another attendee booking with NOT_FOUND', () => {
      const booking = { id: 'b1', reference: 'REF123', userId: 'attendee-A' };

      // Owner A can read
      assert.doesNotThrow(() => assertBookingOwnership(booking, 'attendee-A'));

      // Attendee B gets NOT_FOUND (preventing enumeration)
      assert.throws(
        () => assertBookingOwnership(booking, 'attendee-B'),
        (err) => err instanceof DomainError && err.code === 'NOT_FOUND'
      );
    });
  });
});
