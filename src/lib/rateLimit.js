// In-memory rate limiting engine for protecting authentication and check-in endpoints.
// Tracks request frequency per client IP using a sliding-window bucket algorithm.

import { DomainError } from '../domain/errors.js';

export class RateLimiter {
  #windowMs;
  #maxRequests;
  #requests = new Map(); // key → array of timestamps (ms)

  /**
   * @param {object} [options]
   * @param {number} [options.windowMs=60000] - Window duration in milliseconds (default: 1 min)
   * @param {number} [options.maxRequests=10] - Max requests permitted in the window
   */
  constructor({ windowMs = 60_000, maxRequests = 10 } = {}) {
    this.#windowMs = windowMs;
    this.#maxRequests = maxRequests;
  }

  /**
   * Inspects and logs a request for a given key (e.g. client IP).
   * Throws RATE_LIMITED domain error if quota is exceeded.
   *
   * @param {string} key - Identifier such as client IP address
   * @param {number} [now=Date.now()]
   */
  assert(key, now = Date.now()) {
    const cutoff = now - this.#windowMs;
    const timestamps = (this.#requests.get(key) || []).filter((t) => t > cutoff);

    if (timestamps.length >= this.#maxRequests) {
      const oldest = timestamps[0];
      const retryAfterSeconds = Math.ceil((oldest + this.#windowMs - now) / 1000);
      throw new DomainError(
        'RATE_LIMITED',
        `Too many requests. Please try again in ${retryAfterSeconds} second(s).`,
        { retryAfterSeconds }
      );
    }

    timestamps.push(now);
    this.#requests.set(key, timestamps);
  }

  /**
   * Cleans up expired IP entries to prevent memory growth.
   * @param {number} [now=Date.now()]
   */
  prune(now = Date.now()) {
    const cutoff = now - this.#windowMs;
    for (const [key, timestamps] of this.#requests.entries()) {
      const active = timestamps.filter((t) => t > cutoff);
      if (active.length === 0) {
        this.#requests.delete(key);
      } else {
        this.#requests.set(key, active);
      }
    }
  }

  /** Reset all stored rate limits (useful in tests). */
  reset() {
    this.#requests.clear();
  }
}

/**
 * Extracts client IP address from standard node:http request headers.
 * @param {import('node:http').IncomingMessage} req
 * @returns {string} Client IP address
 */
export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return ips.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}
