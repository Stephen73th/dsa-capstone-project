// Database seed script.
// Populates the database once with initial sample events and tiers.
// Run with: npm run seed

import { createDatabase } from '../src/db/connection.js';
import { SqliteRepository } from '../src/repositories/sqlite.js';
import { hashPassword } from '../src/lib/password.js';

const db = createDatabase();
const repo = new SqliteRepository(db);

async function seed() {
  console.log('Seeding SQLite database...');

  const defaultPasswordHash = await hashPassword('password123');

  // Ensure default users exist
  db.prepare(
    `INSERT OR IGNORE INTO users (id, name, email, password_hash, role)
     VALUES (?, ?, ?, ?, ?)`
  ).run('organizer-1', 'Tech Events Nigeria', 'organizer@techevents.ng', defaultPasswordHash, 'organizer');

  db.prepare(
    `INSERT OR IGNORE INTO users (id, name, email, password_hash, role)
     VALUES (?, ?, ?, ?, ?)`
  ).run('attendee-1', 'Ada Lovelace', 'ada@example.com', defaultPasswordHash, 'attendee');

  // Check if events already exist
  const existingEvents = await repo.listEvents();
  if (existingEvents.length > 0) {
    console.log(`Database already has ${existingEvents.length} event(s). Skipping seed.`);
    return;
  }

  // Create sample published event
  const event1 = await repo.saveEvent({
    id: 'e1000000-0000-0000-0000-000000000001',
    organizerId: 'organizer-1',
    title: 'Lagos Tech Meetup',
    city: 'Lagos',
    venue: 'Yaba Innovation Hub',
    startsAt: '2026-12-05T17:00:00.000Z',
    status: 'published',
  });

  await repo.saveTier({
    id: 't1000000-0000-0000-0000-000000000001',
    eventId: event1.id,
    name: 'General Admission',
    priceCents: 500000,
    capacity: 50,
    sold: 0,
  });

  await repo.saveTier({
    id: 't1000000-0000-0000-0000-000000000002',
    eventId: event1.id,
    name: 'VIP',
    priceCents: 1500000,
    capacity: 10,
    sold: 0,
  });

  // Create a second event in Abuja
  const event2 = await repo.saveEvent({
    id: 'e1000000-0000-0000-0000-000000000002',
    organizerId: 'organizer-1',
    title: 'Abuja Jazz Night',
    city: 'Abuja',
    venue: 'Transcorp Hilton',
    startsAt: '2026-12-12T19:00:00.000Z',
    status: 'published',
  });

  await repo.saveTier({
    id: 't1000000-0000-0000-0000-000000000003',
    eventId: event2.id,
    name: 'Standard Seat',
    priceCents: 1000000,
    capacity: 100,
    sold: 0,
  });

  console.log('Database seeded successfully:');
  console.log(' - 2 users');
  console.log(' - 2 events (Lagos Tech Meetup, Abuja Jazz Night)');
  console.log(' - 3 ticket tiers');
}

seed().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
