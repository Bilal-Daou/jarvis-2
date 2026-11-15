// Lets Jarvis open even without internet, and shows reminder alerts.
const CACHE = 'jarvis-v5';
const FILES = ['./', './index.html', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png', './icon-180.png', './features/brief.js', './features/habits.js', './features/finance.js', './features/receipt.js', './features/food.js'];
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
  if (!same) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; })
    .catch(() => caches.match(e.request).then(r => r || (e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(self.clients.matchAll({type:'window'}).then(cs => cs.length ? cs[0].focus() : self.clients.openWindow('./'))); });
