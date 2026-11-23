// HS256 JSON Web Token (JWT) signing and verification using node:crypto.
// Strictly requires alg: 'HS256' and checks expiration.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { DomainError } from '../domain/errors.js';

const DEFAULT_SECRET = 'dev-capstone-jwt-secret-do-not-use-in-production-32-bytes!';
const SECRET = process.env.JWT_SECRET || DEFAULT_SECRET;
const DEFAULT_EXPIRATION_SECONDS = 7 * 24 * 60 * 60; // 7 days

function base64UrlEncode(data) {
  return Buffer.from(data).toString('base64url');
}

function base64UrlDecode(data) {
  return Buffer.from(data, 'base64url').toString('utf-8');
}

/**
 * Signs a payload using HMAC-SHA256 (HS256).
 * @param {object} payload
 * @param {object} options
 * @param {number} options.expiresInSeconds
 * @param {string} options.secret
 * @returns {string} Encoded JWT token
 */
export function signToken(payload, { expiresInSeconds = DEFAULT_EXPIRATION_SECONDS, secret = SECRET } = {}) {
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const signature = createHmac('sha256', secret).update(dataToSign).digest('base64url');

  return `${dataToSign}.${signature}`;
}

/**
 * Verifies and decodes an HS256 token.
 * Rejects any algorithm other than HS256 or expired tokens.
 * @param {string} token
 * @param {object} options
 * @param {string} options.secret
 * @returns {object} Decoded payload
 */
export function verifyToken(token, { secret = SECRET } = {}) {
  if (!token || typeof token !== 'string') {
    throw new DomainError('UNAUTHENTICATED', 'Authentication token is required');
  }

  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    throw new DomainError('UNAUTHENTICATED', 'Malformed token');
  }

  const [encodedHeader, encodedPayload, signature] = parts;

  // 1. Verify Header and Algorithm
  let header;
  try {
    header = JSON.parse(base64UrlDecode(encodedHeader));
  } catch {
    throw new DomainError('UNAUTHENTICATED', 'Invalid token header');
  }

  if (header.alg !== 'HS256') {
    throw new DomainError('UNAUTHENTICATED', `Invalid token algorithm: ${header.alg}`);
  }

  // 2. Verify Signature with constant-time comparison
  const dataToSign = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = createHmac('sha256', secret).update(dataToSign).digest('base64url');

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
    throw new DomainError('UNAUTHENTICATED', 'Invalid token signature');
  }

  // 3. Verify Payload and Expiry
  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    throw new DomainError('UNAUTHENTICATED', 'Invalid token payload');
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp < now) {
    throw new DomainError('UNAUTHENTICATED', 'Token has expired');
  }

  return payload;
}
