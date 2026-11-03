/* Emage FLEET — service worker: pozwala zainstalować aplikację na telefonie.
   Najpierw sieć (zawsze najnowsza wersja), kopia tylko awaryjnie bez internetu.
   Zapytania do bazy (Supabase) nigdy nie są zapisywane w pamięci. */
const CACHE = 'emage-fleet-v1';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(ca => ca.put(e.request, c)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./')))
  );
});
