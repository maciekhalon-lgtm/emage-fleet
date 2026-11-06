/* Emage FLEET — service worker: pozwala zainstalować aplikację na telefonie.
   Najpierw sieć (zawsze najnowsza wersja), kopia tylko awaryjnie bez internetu.
   Zapytania do bazy (Supabase) nigdy nie są zapisywane w pamięci. */
const CACHE = 'emage-fleet-v60';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
/* Powiadomienia push z funkcji „powiadomienia” w Supabase */
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (_) { d = {body: e.data && e.data.text()}; }
  e.waitUntil(self.registration.showNotification(d.title || 'Emage FLEET', {
    body: d.body || '', icon: 'ikona-192.png', badge: 'ikona-192.png', tag: d.tag || 'emage-fleet', data: {url: d.url || './'},
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({type:'window', includeUncontrolled:true}).then(cs => {
    const c = cs.find(x => x.url.startsWith(self.registration.scope));
    return c ? c.focus() : self.clients.openWindow(url);
  }));
});

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  // własne pliki i biblioteka z jsDelivr (wersja przypięta) – żeby aplikacja otwierała się bez zasięgu
  const lib = u.origin === 'https://cdn.jsdelivr.net' || u.origin === 'https://fonts.googleapis.com' || u.origin === 'https://fonts.gstatic.com';
  if (e.request.method !== 'GET' || (u.origin !== location.origin && !lib)) return;
  e.respondWith(
    fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(ca => ca.put(e.request, c)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./')))
  );
});
