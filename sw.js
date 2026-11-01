// Service worker: cache-first for every app file and data file, so the app works offline
// after the first load. The cache name comes from data/build.json at install time.
// When build.json changes, the next visit refreshes the files into a new cache.

const PREFIX = 'cco-';
const META = 'cco-meta';

const FILES = [
  './',
  'index.html',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'app/main.js',
  'app/store.js',
  'app/ui.js',
  'app/styles.css',
  'app/screens/decide.js',
  'app/screens/toggles.js',
  'app/screens/cheatsheet.js',
  'app/screens/rules.js',
  'app/screens/settings.js',
  'app/screens/stack.js',
  'engine/index.js',
  'engine/rules.js',
  'engine/context.js',
  'engine/earn.js',
  'engine/decide.js',
  'engine/period.js',
  'engine/warnings.js',
  'data/stack.json',
  'data/rules.json',
  'data/merchants.json',
  'data/spend-profile.json',
  'data/build.json',
];

// Files whose absence must fail the install. Everything else is optional.
const REQUIRED = new Set(['index.html', 'app/main.js', 'app/store.js', 'app/ui.js', 'app/styles.css', 'data/stack.json', 'data/rules.json']);

function hash(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

async function currentBuildId() {
  try {
    const res = await fetch('data/build.json', { cache: 'no-store' });
    if (res.ok) return hash(await res.text());
  } catch (e) {
    /* offline: handled by caller */
  }
  return null;
}

async function precache(id) {
  const name = PREFIX + id;
  const cache = await caches.open(name);
  await Promise.all(
    FILES.map(async (f) => {
      try {
        const res = await fetch(f, { cache: 'reload' });
        if (res.ok) await cache.put(new Request(f), res);
        else if (REQUIRED.has(f)) throw new Error(`${f} ${res.status}`);
      } catch (e) {
        if (REQUIRED.has(f)) throw e;
      }
    }),
  );
  const meta = await caches.open(META);
  await meta.put('current', new Response(name));
  return name;
}

async function currentName() {
  try {
    const meta = await caches.open(META);
    const r = await meta.match('current');
    return r ? await r.text() : null;
  } catch (e) {
    return null;
  }
}

async function dropOld(keep) {
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== keep).map((k) => caches.delete(k)));
}

let lastCheck = 0;
async function checkForUpdate() {
  const now = Date.now();
  if (now - lastCheck < 60 * 1000) return;
  lastCheck = now;
  const id = await currentBuildId();
  if (!id) return;
  const have = await currentName();
  if (have === PREFIX + id) return;
  try {
    const name = await precache(id);
    await dropOld(name);
    const clients = await self.clients.matchAll();
    for (const c of clients) c.postMessage({ type: 'updated' });
  } catch (e) {
    /* keep serving the old cache */
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const id = (await currentBuildId()) || 'dev';
      await precache(id);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = await currentName();
      await dropOld(keep);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'check') event.waitUntil(checkForUpdate());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (req.mode === 'navigate') event.waitUntil(checkForUpdate());
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const name = await currentName();
          if (name) {
            const cache = await caches.open(name);
            cache.put(req, res.clone());
          }
        }
        return res;
      } catch (e) {
        if (req.mode === 'navigate') {
          const index = await caches.match('index.html');
          if (index) return index;
        }
        return new Response('Offline and not cached.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })(),
  );
});
