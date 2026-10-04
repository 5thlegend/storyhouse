import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { config } from './config.js';

export type Role = 'owner' | 'family';

const COOKIE = 'sh_role';

// A stateless, signed token proving a valid family session. Depends on the
// passcode, so rotating the passcode invalidates old family cookies.
export function familyToken(): string {
  return crypto
    .createHmac('sha256', config.sessionSecret)
    .update(`family:${config.familyPasscode}`)
    .digest('base64url');
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// Owner is the default (the person on the local device). A valid family cookie —
// only possible once sharing is enabled and the passcode entered — downgrades to
// the read-only family role.
export function roleFromRequest(req: Request): Role {
  if (!config.familyPasscode) return 'owner';
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(familyToken()))) {
    return 'family';
  }
  return 'owner';
}

export function setFamilyCookie(res: Response): void {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${familyToken()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 30}`,
  );
}

export function clearFamilyCookie(res: Response): void {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

// Attach role to the request.
export function roleMiddleware(req: Request, _res: Response, next: NextFunction): void {
  (req as any).role = roleFromRequest(req);
  next();
}

// Read-only gate: the family role may only use GET requests and the /family/*
// auth endpoints. Everything that writes, converses, or edits is owner-only.
export function readOnlyForFamily(req: Request, res: Response, next: NextFunction): void {
  const role: Role = (req as any).role ?? 'owner';
  if (role !== 'family') return next();
  const isAuthRoute = req.path.startsWith('/family/');
  if (req.method === 'GET' || isAuthRoute) return next();
  res
    .status(403)
    .json({ error: 'Family View is read-only. The Living Room and editing stay private to Grandma.' });
}
