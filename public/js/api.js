// Real HTTP API client communicating with backend endpoints.
// Automatically attaches Bearer tokens via getAuthHeaders().

import { getAuthHeaders } from './session.js';

async function request(path, options = {}) {
  const url = path.startsWith('/api') ? path : `/api${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeaders(),
    ...(options.headers || {}),
  };

  const config = {
    ...options,
    headers,
  };

  if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
    config.body = JSON.stringify(config.body);
  }

  const res = await fetch(url, config);
  let data;
  try {
    data = await res.json();
  } catch {
    data = {};
  }

  if (!res.ok) {
    const message = data.error?.message || `Request failed with status ${res.status}`;
    const error = new Error(message);
    error.code = data.error?.code || 'UNKNOWN_ERROR';
    error.status = res.status;
    throw error;
  }

  return data;
}

// --- Auth Endpoints ---

export async function signup({ email, password, name, role = 'attendee' }) {
  return request('/api/auth/signup', {
    method: 'POST',
    body: { email, password, name, role },
  });
}

export async function login({ email, password }) {
  return request('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

export async function getMe() {
  return request('/api/auth/me');
}

// --- Events Endpoints ---

export async function listEvents({ q, city, maxPriceCents, sort = 'date' } = {}) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (city) params.set('city', city);
  if (maxPriceCents !== undefined && maxPriceCents !== null && maxPriceCents !== '') {
    params.set('maxPriceCents', maxPriceCents);
  }
  if (sort) params.set('sort', sort);

  const queryString = params.toString() ? `?${params.toString()}` : '';
  return request(`/api/events${queryString}`);
}

export async function getEvent(id) {
  return request(`/api/events/${encodeURIComponent(id)}`);
}

export async function createEvent({ title, city, venue, startsAt }) {
  return request('/api/events', {
    method: 'POST',
    body: { title, city, venue, startsAt },
  });
}

export async function addTier(eventId, { name, priceCents, capacity }) {
  return request(`/api/events/${encodeURIComponent(eventId)}/tiers`, {
    method: 'POST',
    body: { name, priceCents, capacity },
  });
}

export async function publishEvent(eventId) {
  return request(`/api/events/${encodeURIComponent(eventId)}/publish`, {
    method: 'POST',
  });
}

export async function unpublishEvent(eventId) {
  return request(`/api/events/${encodeURIComponent(eventId)}/unpublish`, {
    method: 'POST',
  });
}

export async function listOrganizerEvents() {
  return request('/api/organizer/events');
}

// --- Bookings Endpoints ---

export async function createBooking({ tierId, quantity }) {
  return request('/api/bookings', {
    method: 'POST',
    body: { tierId, quantity },
  });
}

export async function listMyBookings() {
  return request('/api/bookings');
}

export async function getBooking(reference) {
  return request(`/api/bookings/${encodeURIComponent(reference)}`);
}

export async function pay(reference, { shouldDecline = false } = {}) {
  return request(`/api/bookings/${encodeURIComponent(reference)}/pay`, {
    method: 'POST',
    body: { shouldDecline },
  });
}

export async function cancelBooking(reference) {
  return request(`/api/bookings/${encodeURIComponent(reference)}/cancel`, {
    method: 'POST',
  });
}
