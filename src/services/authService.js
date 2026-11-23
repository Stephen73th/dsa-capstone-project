// Authentication Service: Signup, Login, and Profile management.
// Enforces password strength, role validation, and secure token issuance.

import { newId } from '../domain/ids.js';
import { DomainError } from '../domain/errors.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { signToken } from '../lib/token.js';

const ALLOWED_ROLES = ['attendee', 'organizer', 'staff'];
const MIN_PASSWORD_LENGTH = 8;

export class AuthService {
  #repo;

  constructor(repo) {
    this.#repo = repo;
  }

  async signup({ email, password, name, role = 'attendee' }) {
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      throw new DomainError('VALIDATION', 'A valid email address is required');
    }

    if (!password || typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      throw new DomainError(
        'VALIDATION',
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`
      );
    }

    if (!ALLOWED_ROLES.includes(role)) {
      throw new DomainError('VALIDATION', `Role must be one of: ${ALLOWED_ROLES.join(', ')}`);
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = await this.#repo.findUserByEmail(cleanEmail);
    if (existing) {
      throw new DomainError('EMAIL_TAKEN', 'An account with this email already exists');
    }

    const passwordHash = await hashPassword(password);
    const user = {
      id: newId(),
      name: (name && String(name).trim()) || cleanEmail.split('@')[0],
      email: cleanEmail,
      passwordHash,
      role,
    };

    await this.#repo.saveUser(user);

    const token = signToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      token,
    };
  }

  async login({ email, password }) {
    const genericError = new DomainError('INVALID_CREDENTIALS', 'Invalid email or password');

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      throw genericError;
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await this.#repo.findUserByEmail(cleanEmail);
    if (!user || !user.passwordHash) {
      throw genericError;
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      throw genericError;
    }

    const token = signToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      token,
    };
  }

  async getCurrentUser(userId) {
    const user = await this.#repo.findUserById(userId);
    if (!user) {
      throw new DomainError('NOT_FOUND', 'User not found');
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
  }
}
