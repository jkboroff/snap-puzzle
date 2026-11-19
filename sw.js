// Snap Puzzle service worker (web version only). Keeps every file of this release in a cache so the
// app opens and plays with no internet after the first visit. The build fills in the file list.
const VERSION = '0888511b434c';
const FILES = [
  "./",
  "./index.html",
  "./assets/index-I8bGEt9r.js",
  "./assets/web-BGHRUaY6.js",
  "./assets/web-CJ_5h8r_.js",
  "./assets/index-Cv-m6ed-.css",
  "./apple-touch-icon.png",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./icon.svg",
  "./manifest.webmanifest"
];
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
