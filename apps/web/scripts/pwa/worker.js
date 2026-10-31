/* AIDEV-NOTE: Only byte-verified build artifacts enter this cache; no runtime responses or write queue. */
const ENTRIES = __ENTRIES__;
const SHELL = __SHELL__;
const CACHE = 'elevateo-shell-' + __VERSION__;
const known = new Map(ENTRIES.map(entry => [entry.url, entry]));
const key = entry => entry.url + '?build=' + entry.hash;
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      await Promise.all(ENTRIES.map(async entry => {
        const response = await fetch(entry.url, { credentials: 'omit', cache: 'no-store', redirect: 'error' });
        if (!response.ok || response.type === 'opaque') throw new Error('Static asset unavailable');
        const bytes = await response.clone().arrayBuffer();
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
        if (hash !== entry.hash) throw new Error('Static asset changed during install');
        await cache.put(key(entry), response);
      }));
    } catch (error) {
      await caches.delete(CACHE);
      throw error;
    }
  })());
  // Never skipWaiting: other tabs can hold unsaved drafts or an approval with an uncertain result.
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(names => Promise.all(names
    .filter(name => name.startsWith('elevateo-shell-') && name !== CACHE)
    .map(name => caches.delete(name)))));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.search) return;
  // Hash routes never reach the worker. Auth callbacks, APIs and arbitrary paths always bypass it.
  const path = request.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/index.html')
    ? SHELL : url.pathname;
  const entry = known.get(path);
  if (!entry) return;
  event.respondWith(caches.open(CACHE).then(cache => cache.match(key(entry))).then(response =>
    response || fetch(request)));
});
