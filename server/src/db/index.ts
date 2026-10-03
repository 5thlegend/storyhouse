import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { config } from '../config.js';
import { SCHEMA_SQL } from './schema.js';

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (_db) return _db;

  // Ensure the data directory exists (kept out of git).
  const dir = path.dirname(config.databasePath);
  fs.mkdirSync(dir, { recursive: true });

  _db = new DatabaseSync(config.databasePath);
  _db.exec('PRAGMA journal_mode = WAL;');
  _db.exec('PRAGMA foreign_keys = ON;');
  _db.exec(SCHEMA_SQL);
  return _db;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function cryptoId(prefix = ''): string {
  return prefix ? `${prefix}_${nanoid(12)}` : nanoid(16);
}

/** Append-only audit entry. Never stores raw private conversation text. */
export function audit(
  action: string,
  targetType?: string,
  targetId?: string,
  detail?: string,
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO audit_log (id, action, target_type, target_id, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(cryptoId(), action, targetType ?? null, targetId ?? null, detail ?? null, nowIso());
}
