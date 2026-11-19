// Lets Jarvis open even without internet, and shows reminder alerts.
const CACHE = 'jarvis-v28';
const FILES = ['./', './index.html', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png', './icon-180.png', './features/brief.js', './features/habits.js', './features/finance.js', './features/receipt.js', './features/food.js', './features/calendar.js', './features/health.js', './features/brain.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
// Network first (so updates show up), fall back to the saved copy when offline.
// Also keeps a copy of the free scanner/reader libraries (receipts, barcodes) so they work offline after the first use.
const CDN = /^https:\/\/cdn\.jsdelivr\.net\/npm\/(tesseract\.js|tesseract\.js-core|@tesseract\.js-data|@zxing)/;
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const same = url.origin === location.origin;
  if (CDN.test(e.request.url)) {
    // pinned versions never change: serve from cache first
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; })));
    return;
  }
  // Calendar files made on the phone (features/calendar.js): ics/<name>.ics?d=<the file, base64url>.
  // iPhone only shows "Add to Calendar" for a real https link that answers text/calendar.
  if (same && /\/ics\/[^/]+\.ics$/.test(url.pathname) && url.searchParams.has('d')) {
    try {
      const b = url.searchParams.get('d').replace(/-/g, '+').replace(/_/g, '/');
      const bin = atob(b + '==='.slice((b.length + 3) % 4));
      const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
      const name = url.pathname.split('/').pop().replace(/[^A-Za-z0-9._-]/g, '') || 'jarvis.ics';
      e.respondWith(new Response(bytes, {headers: {'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="' + name + '"', 'Cache-Control': 'no-store'}}));
    } catch (err) { e.respondWith(new Response('This calendar link is damaged.', {status: 400, headers: {'Content-Type': 'text/plain'}})); }
    return;
  }
  if (!same) return;
  // cache: 'no-cache' = always ask GitHub if there's a newer file (else the phone may reuse an old one for 10 min)
  e.respondWith(fetch(e.request, {cache: 'no-cache'}).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; })
    .catch(() => caches.match(e.request).then(r => r || (e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(self.clients.matchAll({type:'window'}).then(cs => cs.length ? cs[0].focus() : self.clients.openWindow('./'))); });
