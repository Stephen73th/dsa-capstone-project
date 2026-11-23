-- Event Ticketing Database Schema (SQLite)
-- Built-in constraints: PRIMARY KEY, FOREIGN KEY, UNIQUE, and CHECK constraints.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'attendee' CHECK (role IN ('organizer', 'attendee', 'staff'))
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  organizer_id TEXT NOT NULL,
  title TEXT NOT NULL,
  city TEXT NOT NULL,
  venue TEXT NOT NULL DEFAULT '',
  starts_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published'))
);

CREATE TABLE IF NOT EXISTS ticket_tiers (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  capacity INTEGER NOT NULL CHECK (capacity >= 1),
  sold INTEGER NOT NULL DEFAULT 0,
  CHECK (sold >= 0 AND sold <= capacity)
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  reference TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  tier_id TEXT NOT NULL REFERENCES ticket_tiers(id),
  event_id TEXT NOT NULL REFERENCES events(id),
  quantity INTEGER NOT NULL CHECK (quantity >= 1),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded', 'checked_in')),
  transaction_id TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL
);
