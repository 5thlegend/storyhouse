// Storyhouse service worker — so her photos still open when the Wi-Fi drops.
//
//   /media/*        cache-first (keys never change, so a cached copy is never stale)
//   /api/house/*    network-first, falling back to the last good copy
//   /assets/*       cache-first (Vite hashes the file names)
//   pages           network-first, falling back to the cached app shell
//   everything else straight to the network (Studio, Living Room, sign-in)
//
// Family data cached here stays on her iPad only.

const VERSION = 'storyhouse-v1';
const SHELL = '/';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

async function cacheFirst(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  // Range responses (audio scrubbing) are partial — never cache those.
  if (res.ok && res.status === 200) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req, fallbackKey) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(fallbackKey ?? req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(fallbackKey ?? req, { ignoreVary: true });
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/media/') && !req.headers.has('range')) {
    event.respondWith(cacheFirst(req));
  } else if (url.pathname === '/api/house/album' || url.pathname === '/api/session') {
    event.respondWith(networkFirst(req));
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(req));
  } else if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, SHELL));
  }
});
