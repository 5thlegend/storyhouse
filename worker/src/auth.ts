// Who is at the door? Storyhouse runs on a public URL, so EVERY piece of family
// data sits behind one of three keys. Nothing is readable without one.
//
//   studio  — the Family Studio (passcode). Full access: upload, record, publish.
//   grandma — her paired iPad (one-time pairing code). Sees published things only.
//   family  — optional read-only Family View (a second passcode).
//   none    — the lock screen. No data at all.

import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { config } from './config.js';
import { all, first, run, nowIso, cryptoId, randomString } from './db.js';

export type Role = 'none' | 'grandma' | 'studio' | 'family';
export type HonoEnv = { Variables: { role: Role; deviceId: string | null } };

const STUDIO_COOKIE = 'sh_studio';
const FAMILY_COOKIE = 'sh_family';
const DEVICE_COOKIE = 'sh_device';

const DAY = 60 * 60 * 24;
const STUDIO_MAX_AGE = 30 * DAY;
// Her iPad should never be logged out on her. 400 days is the browser maximum;
// every visit refreshes it.
const DEVICE_MAX_AGE = 400 * DAY;

const enc = new TextEncoder();

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time string comparison (compares digests so lengths never leak). */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  return (crypto.subtle as any).timingSafeEqual(da, db);
}

// A signed, expiring session token. It is bound to the current passcode, so
// changing the passcode logs every old session out.
async function sessionToken(kind: 'studio' | 'family', passcode: string, exp: number): Promise<string> {
  const { sessionSecret } = config();
  return `${exp}.${await hmac(sessionSecret, `${kind}:${exp}:${await sha256(passcode)}`)}`;
}

async function validSession(kind: 'studio' | 'family', passcode: string, token: string | undefined): Promise<boolean> {
  if (!token || !passcode || !config().sessionSecret) return false;
  const [expStr] = token.split('.');
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  return safeEqual(token, await sessionToken(kind, passcode, exp));
}

function cookieOpts(c: Context, maxAge: number) {
  const secure = new URL(c.req.url).protocol === 'https:';
  return { httpOnly: true, secure, sameSite: 'Lax' as const, path: '/', maxAge };
}

// ---------- the gate ----------
export const resolveRole: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const cfg = config();
  let role: Role = 'none';
  let deviceId: string | null = null;

  if (await validSession('studio', cfg.studioPasscode, getCookie(c, STUDIO_COOKIE))) {
    role = 'studio';
  } else {
    const deviceToken = getCookie(c, DEVICE_COOKIE);
    if (deviceToken) {
      const dev = await first<{ id: string; last_seen_at: string | null }>(
        `SELECT id, last_seen_at FROM devices WHERE token_hash = ? AND revoked_at IS NULL`,
        await sha256(deviceToken),
      );
      if (dev) {
        role = 'grandma';
        deviceId = dev.id;
        // Touch at most hourly so her iPad doesn't write on every request.
        if (!dev.last_seen_at || Date.now() - Date.parse(dev.last_seen_at) > 3600_000) {
          await run(`UPDATE devices SET last_seen_at = ? WHERE id = ?`, nowIso(), dev.id);
          setCookie(c, DEVICE_COOKIE, deviceToken, cookieOpts(c, DEVICE_MAX_AGE));
        }
      }
    }
    if (role === 'none' && (await validSession('family', cfg.familyPasscode, getCookie(c, FAMILY_COOKIE)))) {
      role = 'family';
    }
  }

  c.set('role', role);
  c.set('deviceId', deviceId);
  await next();
};

/** Allow only the listed roles; everyone else gets a calm 401/403. */
export function allow(...roles: Role[]): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    const role = c.get('role');
    if (roles.includes(role)) return next();
    if (role === 'none') return c.json({ error: 'Please unlock Storyhouse first.' }, 401);
    return c.json({ error: 'That part of the house is private.' }, 403);
  };
}

// ---------- slowing down guessing ----------
const WINDOW_MS = 15 * 60_000;
const MAX_FAILS = 10;

function clientIp(c: Context): string {
  return c.req.header('cf-connecting-ip') ?? 'local';
}

export async function tooManyAttempts(c: Context): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const r = await first<{ n: number }>(
    `SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND created_at > ?`,
    clientIp(c),
    since,
  );
  return (r?.n ?? 0) >= MAX_FAILS;
}

export async function recordFailedAttempt(c: Context): Promise<void> {
  await run(`INSERT INTO login_attempts (id, ip, created_at) VALUES (?,?,?)`, cryptoId('la'), clientIp(c), nowIso());
  await run(`DELETE FROM login_attempts WHERE created_at < ?`, new Date(Date.now() - DAY * 1000).toISOString());
}

// ---------- logging in ----------
export async function tryPasscode(c: Context, passcode: string): Promise<Role | null> {
  const cfg = config();
  if (!cfg.sessionSecret) return null;
  const exp = Math.floor(Date.now() / 1000) + STUDIO_MAX_AGE;
  if (cfg.studioPasscode && (await safeEqual(passcode, cfg.studioPasscode))) {
    setCookie(c, STUDIO_COOKIE, await sessionToken('studio', cfg.studioPasscode, exp), cookieOpts(c, STUDIO_MAX_AGE));
    return 'studio';
  }
  if (cfg.familyPasscode && (await safeEqual(passcode, cfg.familyPasscode))) {
    setCookie(c, FAMILY_COOKIE, await sessionToken('family', cfg.familyPasscode, exp), cookieOpts(c, STUDIO_MAX_AGE));
    return 'family';
  }
  return null;
}

export function logout(c: Context): void {
  deleteCookie(c, STUDIO_COOKIE, { path: '/' });
  deleteCookie(c, FAMILY_COOKIE, { path: '/' });
  // The iPad's device cookie is deliberately NOT cleared here: her iPad is
  // un-paired only from the Studio ("Forget this iPad"), never by accident.
}

// ---------- pairing her iPad ----------
// Codes avoid look-alike characters (0/O, 1/I/L) since they're typed by hand.
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const PAIRING_TTL_MS = 24 * 60 * 60_000;

function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export async function createPairingCode(label: string): Promise<{ code: string; expires_at: string }> {
  const raw = randomString(8, CODE_ALPHABET);
  const expires_at = new Date(Date.now() + PAIRING_TTL_MS).toISOString();
  await run(
    `INSERT INTO pairing_codes (code_hash, label, expires_at, created_at) VALUES (?,?,?,?)`,
    await sha256(raw),
    label,
    expires_at,
    nowIso(),
  );
  return { code: `${raw.slice(0, 4)}-${raw.slice(4)}`, expires_at };
}

export async function redeemPairingCode(c: Context, code: string): Promise<boolean> {
  const hash = await sha256(normalizeCode(code));
  const row = await first<{ label: string; expires_at: string; used_at: string | null }>(
    `SELECT label, expires_at, used_at FROM pairing_codes WHERE code_hash = ?`,
    hash,
  );
  if (!row || row.used_at || Date.parse(row.expires_at) < Date.now()) return false;

  const token = randomString(48);
  const now = nowIso();
  await run(`UPDATE pairing_codes SET used_at = ? WHERE code_hash = ?`, now, hash);
  await run(
    `INSERT INTO devices (id, label, token_hash, created_at, last_seen_at) VALUES (?,?,?,?,?)`,
    cryptoId('dev'),
    row.label,
    await sha256(token),
    now,
    now,
  );
  setCookie(c, DEVICE_COOKIE, token, cookieOpts(c, DEVICE_MAX_AGE));
  return true;
}

export async function listDevices() {
  return all(
    `SELECT id, label, created_at, last_seen_at FROM devices WHERE revoked_at IS NULL ORDER BY created_at DESC`,
  );
}

export async function revokeDevice(id: string): Promise<void> {
  await run(`UPDATE devices SET revoked_at = ? WHERE id = ?`, nowIso(), id);
}
