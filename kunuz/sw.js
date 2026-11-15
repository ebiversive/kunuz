const CACHE_VERSION = 'v1';
const CACHE_NAME = `kunuz-${CACHE_VERSION}`;

const SHELL = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './manifest.json',
  './content.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
];

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // content.json → network-first (fresh content when online)
  if (url.pathname.endsWith('/content.json') || url.pathname.endsWith('content.json')) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Fonts → cache-first
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // App shell and same-origin assets → cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(req));
    return;
  }
});

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, res.clone());
    }
    return res;
  } catch (err) {
    if (req.mode === 'navigate') {
      const fallback = await caches.match('./index.html');
      if (fallback) return fallback;
    }
    throw err;
  }
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res && res.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, res.clone());
    }
    return res;
  } catch (err) {
    const cached = await caches.match(req);
    if (cached) return cached;
    throw err;
  }
}