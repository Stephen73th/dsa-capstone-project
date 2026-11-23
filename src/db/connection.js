// Database connection manager using native Node.js SQLite (node:sqlite).
// Ensures foreign keys are active and initializes schema from schema.sql.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(__dirname, 'schema.sql');
const DEFAULT_DB_PATH = resolve(__dirname, '../../data/tickets.db');

export function createDatabase(dbPath = process.env.DB_PATH || DEFAULT_DB_PATH) {
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = new DatabaseSync(dbPath);

  // SQLite disables foreign key constraints by default
  db.exec('PRAGMA foreign_keys = ON;');

  // Run schema to create tables if they do not exist
  const schemaSql = readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schemaSql);

  // Safe migration for existing databases: ensure password_hash column exists
  try {
    db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT;');
  } catch {
    // Column already exists
  }

  return db;
}
