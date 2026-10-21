// Storyhouse on Cloudflare: one Worker for Grandma's iPad, the Family Studio,
// and the Memory Vault API. Static assets (the React app) are served by
// Workers Assets; this code only runs for /api/* and /media/*.

import { Hono } from 'hono';
import { ZodError } from 'zod';
import { resolveRole, type HonoEnv } from './auth.js';
import { house } from './routes/house.js';
import { memories } from './routes/memories.js';
import { media } from './routes/media.js';
import { ensureDemoSeed } from './seed/run.js';

const app = new Hono<HonoEnv>();

app.use('*', async (c, next) => {
  await ensureDemoSeed();
  await next();
  // Family data must never be cached by a shared cache or framed by a stranger.
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'no-referrer');
  if (c.req.path.startsWith('/api/')) c.header('Cache-Control', 'no-store');
});

app.use('*', resolveRole);

app.route('/api', house);
app.route('/api', memories);
app.route('/media', media);

app.notFound((c) => c.json({ error: 'Not found.' }, 404));

app.onError((err, c) => {
  if (err instanceof ZodError) return c.json({ error: 'Some of that information was not valid.' }, 400);
  console.error('[api error]', err?.message ?? err);
  return c.json({ error: 'Something went wrong on our end. Your stored memories are safe.' }, 500);
});

export default app;
