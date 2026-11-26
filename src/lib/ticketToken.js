// Ticket token signing and verification using HMAC-SHA256 (node:crypto).
// Payload contains ONLY the booking reference and issued-at time (no PII: no name, no email).
// Compares signatures using timingSafeEqual to prevent timing attacks.
// Uses a dedicated secret from TICKET_SECRET with no default in production.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { DomainError } from '../domain/errors.js';

function getSecret(explicitSecret) {
  if (explicitSecret) return explicitSecret;

  const envSecret = process.env.TICKET_SECRET;
  if (!envSecret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('TICKET_SECRET environment variable is strictly required in production');
    }
    return 'dev-ticket-token-secret-do-not-use-in-production-min-32-chars';
  }
  return envSecret;
}

function base64UrlEncode(str) {
  return Buffer.from(str).toString('base64url');
}

function base64UrlDecode(str) {
  return Buffer.from(str, 'base64url').toString('utf-8');
}

/**
 * Signs a ticket token containing ONLY the booking reference and issued-at timestamp.
 *
 * @param {{ reference: string, iat?: number }} payload
 * @param {{ secret?: string }} [opts]
 * @returns {string} Signed ticket token
 */
export function signTicketToken({ reference, iat }, opts = {}) {
  if (!reference || typeof reference !== 'string') {
    throw new DomainError('VALIDATION', 'reference is required for ticket token');
  }

  // Strictly enforce that NO PII (name, email) can be passed into the token
  const cleanPayload = {
    ref: reference.trim(),
    iat: typeof iat === 'number' ? iat : Math.floor(Date.now() / 1000),
  };

  const secret = getSecret(opts.secret);
  const encodedPayload = base64UrlEncode(JSON.stringify(cleanPayload));
  const signature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');

  return `${encodedPayload}.${signature}`;
}

/**
 * Verifies and extracts the booking reference from a ticket token.
 * Performs constant-time comparison of HMAC signatures.
 *
 * @param {string} token
 * @param {{ secret?: string }} [opts]
 * @returns {{ reference: string, iat: number }}
 */
export function verifyTicketToken(token, opts = {}) {
  if (!token || typeof token !== 'string') {
    throw new DomainError('INVALID_TOKEN', 'Ticket token is required');
  }

  const parts = token.trim().split('.');
  if (parts.length !== 2) {
    throw new DomainError('INVALID_TOKEN', 'Malformed ticket token');
  }

  const [encodedPayload, signature] = parts;
  const secret = getSecret(opts.secret);

  // Compute expected signature
  const expectedSignature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
    throw new DomainError('INVALID_TOKEN', 'Invalid ticket token signature');
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    throw new DomainError('INVALID_TOKEN', 'Invalid ticket token payload');
  }

  if (!payload.ref || typeof payload.ref !== 'string') {
    throw new DomainError('INVALID_TOKEN', 'Token payload is missing booking reference');
  }

  return {
    reference: payload.ref,
    iat: payload.iat,
  };
}
