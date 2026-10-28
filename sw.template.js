// Snap Puzzle service worker (web version only). Keeps every file of this release in a cache so the
// app opens and plays with no internet after the first visit. The build fills in the file list.
const VERSION = '__VERSION__';
const FILES = __FILES__;
const CACHE = `snap-puzzle-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('snap-puzzle-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // Pages try the network first so an update shows up on the next visit; everything else comes from the cache
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('./index.html', { ignoreSearch: true })));
    return;
  }
  event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
