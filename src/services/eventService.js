// Service managing event creation, ticket tiers, publishing, and search.
// Coordinates domain validation with the repository.

import { newId } from '../domain/ids.js';
import { DomainError } from '../domain/errors.js';
import { summarizeEvent, searchEvents } from '../domain/eventSearch.js';

function requireText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DomainError('VALIDATION', `${field} is required`);
  }
  return value.trim();
}

function requireWholeNumber(value, field, min) {
  if (!Number.isInteger(value) || value < min) {
    throw new DomainError('VALIDATION', `${field} must be a whole number of at least ${min}`);
  }
  return value;
}

export class EventService {
  #repo;

  constructor(repo) {
    this.#repo = repo;
  }

  async createEvent({ title, city, venue = '', startsAt, organizerId }) {
    const date = new Date(startsAt);
    if (Number.isNaN(date.getTime())) {
      throw new DomainError('VALIDATION', 'startsAt must be a valid date');
    }

    const event = {
      id: newId(),
      organizerId: organizerId || 'anonymous-organizer',
      title: requireText(title, 'Title'),
      city: requireText(city, 'City'),
      venue: String(venue || '').trim(),
      startsAt: date.toISOString(),
      status: 'draft',
      tierIds: [],
    };

    return await this.#repo.saveEvent(event);
  }

  async addTier(eventId, { name, priceCents, capacity }) {
    const event = await this.#repo.findEventById(eventId);
    if (!event) {
      throw new DomainError('NOT_FOUND', 'Event not found');
    }

    const tier = {
      id: newId(),
      eventId,
      name: requireText(name, 'Tier name'),
      // Currency is always stored as whole cents
      priceCents: requireWholeNumber(priceCents, 'priceCents', 0),
      capacity: requireWholeNumber(capacity, 'capacity', 1),
      sold: 0,
    };

    const savedTier = await this.#repo.saveTier(tier);
    event.tierIds.push(tier.id);
    await this.#repo.saveEvent(event);

    return savedTier;
  }

  async publishEvent(eventId) {
    const event = await this.#repo.findEventById(eventId);
    if (!event) throw new DomainError('NOT_FOUND', 'Event not found');

    const tiers = await this.#repo.listTiersByEventId(eventId);
    if (tiers.length === 0) {
      throw new DomainError('INVALID_STATE', 'Add at least one ticket tier before publishing');
    }

    event.status = 'published';
    return await this.#repo.saveEvent(event);
  }

  async unpublishEvent(eventId) {
    const event = await this.#repo.findEventById(eventId);
    if (!event) throw new DomainError('NOT_FOUND', 'Event not found');

    event.status = 'draft';
    return await this.#repo.saveEvent(event);
  }

  async getEvent(eventId) {
    const event = await this.#repo.findEventById(eventId);
    if (!event) throw new DomainError('NOT_FOUND', 'Event not found');
    const tiers = await this.#repo.listTiersByEventId(eventId);
    return { ...event, tiers };
  }

  async searchPublicEvents({ q, city, from, to, maxPriceCents, onlyAvailable, sort = 'date' } = {}) {
    const allEvents = await this.#repo.listEvents();
    const published = allEvents.filter((e) => e.status === 'published');

    // Attach tiers to build event summaries
    const summaries = await Promise.all(
      published.map(async (event) => {
        const tiers = await this.#repo.listTiersByEventId(event.id);
        return summarizeEvent(event, tiers);
      }),
    );

    const criteria = {
      q,
      city,
      from,
      to,
      maxPriceCents: maxPriceCents !== undefined ? Number(maxPriceCents) : undefined,
      onlyAvailable: onlyAvailable === true || onlyAvailable === 'true',
    };

    return searchEvents(summaries, criteria, sort);
  }
}
