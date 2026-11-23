// Password hashing and verification using node:crypto scrypt.
// Uses random salt per password and timingSafeEqual for constant-time comparison.

import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

/**
 * Hashes a plaintext password with a random 16-byte salt using scrypt.
 * @param {string} password
 * @returns {Promise<string>} Stored in format "saltHex:hashHex"
 */
export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Password must be a non-empty string');
  }

  const salt = randomBytes(16);
  const derivedKey = await scryptAsync(password, salt, KEY_LENGTH);
  return `${salt.toString('hex')}:${derivedKey.toString('hex')}`;
}

/**
 * Verifies a plaintext password against a stored "saltHex:hashHex" string.
 * Uses constant-time comparison to protect against timing attacks.
 * @param {string} password
 * @param {string} storedHash
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, storedHash) {
  if (!password || !storedHash || typeof storedHash !== 'string') {
    return false;
  }

  const parts = storedHash.split(':');
  if (parts.length !== 2) {
    return false;
  }

  const [saltHex, expectedKeyHex] = parts;
  try {
    const salt = Buffer.from(saltHex, 'hex');
    const expectedKey = Buffer.from(expectedKeyHex, 'hex');

    const candidateKey = await scryptAsync(password, salt, expectedKey.length);

    if (candidateKey.length !== expectedKey.length) {
      return false;
    }

    return timingSafeEqual(candidateKey, expectedKey);
  } catch {
    return false;
  }
}
