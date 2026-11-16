// Offline cache: serve from cache first, refresh in the background.
const CACHE = 'crumb-v4';
const DATA = 'crumb-data'; // reminder plan written by the app; must survive updates
const FILES = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== DATA).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  // Only the app's own files are cached. Calls to AI providers go straight to the network.
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
// Best-effort reminders while the app is closed. The browser decides how often this runs.
self.addEventListener('periodicsync', e => {
  if (e.tag === 'crumb-reminders') e.waitUntil(checkReminders());
});
async function checkReminders() {
  if (self.Notification && Notification.permission !== 'granted') return;
  const c = await caches.open(DATA);
  const plan = await c.match('schedule.json');
  if (!plan) return;
  const items = await plan.json();
  const seen = await c.match('shown.json');
  const shown = seen ? await seen.json() : {};
  const now = Date.now();
  let changed = false;
  for (const it of items) {
    if (it.t > now || now - it.t > 12 * 3600e3 || shown[it.id]) continue;
    shown[it.id] = now;
    changed = true;
    await self.registration.showNotification(it.title, { body: it.body, icon: 'icon-192.png', badge: 'icon-192.png', tag: it.id, data: { url: it.url } });
  }
  if (changed) await c.put('shown.json', new Response(JSON.stringify(shown)));
}
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '';
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(cs => {
    if (cs[0]) { cs[0].postMessage({ url }); return cs[0].focus(); }
    return self.clients.openWindow('./' + url);
  }));
});
