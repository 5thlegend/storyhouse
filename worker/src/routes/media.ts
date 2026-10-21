// Photos, voices, and art from the family's R2 bucket — only past the gate.
// Range requests are honored because iPad Safari won't play audio without them.

import { Hono } from 'hono';
import { env } from '../config.js';
import { allow, type HonoEnv } from '../auth.js';

export const media = new Hono<HonoEnv>();

media.get('/*', allow('grandma', 'studio', 'family'), async (c) => {
  const key = decodeURIComponent(new URL(c.req.url).pathname.replace(/^\/media\//, ''));
  if (!/^(photos|voices|art)\/[\w.-]+$/.test(key)) return c.notFound();

  const obj = await env.MEDIA.get(key, { range: c.req.raw.headers, onlyIf: c.req.raw.headers });
  if (!obj) return c.notFound();

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('accept-ranges', 'bytes');
  // Keys are never reused, so the bytes behind a URL never change. "private"
  // keeps shared caches from holding family media.
  headers.set('cache-control', 'private, max-age=31536000, immutable');

  if (!('body' in obj)) return new Response(null, { status: 304, headers });

  const range = obj.range as { offset?: number; length?: number; suffix?: number } | undefined;
  if (range && c.req.header('range')) {
    const offset = range.suffix !== undefined ? obj.size - range.suffix : (range.offset ?? 0);
    const length = range.suffix !== undefined ? range.suffix : (range.length ?? obj.size - offset);
    headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${obj.size}`);
    headers.set('content-length', String(length));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set('content-length', String(obj.size));
  return new Response(obj.body, { headers });
});
