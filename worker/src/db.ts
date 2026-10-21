import { env } from './config.js';

// Thin async helpers over D1. D1 rejects `undefined` binds, so they become NULL.
function bindAll(sql: string, params: unknown[]) {
  return env.DB.prepare(sql).bind(...params.map((p) => (p === undefined ? null : p)));
}

export async function all<T = any>(sql: string, ...params: unknown[]): Promise<T[]> {
  const r = await bindAll(sql, params).all<T>();
  return r.results ?? [];
}

export async function first<T = any>(sql: string, ...params: unknown[]): Promise<T | null> {
  return bindAll(sql, params).first<T>();
}

export async function run(sql: string, ...params: unknown[]): Promise<D1Result> {
  return bindAll(sql, params).run();
}

export function nowIso(): string {
  return new Date().toISOString();
}

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function randomString(len: number, alphabet = ALPHABET): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export function cryptoId(prefix = ''): string {
  return prefix ? `${prefix}_${randomString(12)}` : randomString(16);
}

/** Append-only audit entry. Never stores raw private conversation text. */
export async function audit(
  action: string,
  targetType?: string,
  targetId?: string,
  detail?: string,
): Promise<void> {
  await run(
    `INSERT INTO audit_log (id, action, target_type, target_id, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    cryptoId(),
    action,
    targetType,
    targetId,
    detail,
    nowIso(),
  );
}
