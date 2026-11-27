/* Service worker — cache-first dla powłoki aplikacji (działa offline).
   WAŻNE: przy każdej zmianie plików aplikacji zwiększ VERSION,
   wtedy użytkownicy dostaną komunikat „Dostępna nowa wersja”. */
const VERSION = 'v42';
const CACHE = `drzewko-${VERSION}`;
// Tekst Biblii (UBG, ~4 MB) ma osobny, niewersjonowany cache — nie pobiera się go ponownie przy każdej aktualizacji aplikacji.
// Przy zmianie lib/ubg.json zmień nazwę BIBLE_CACHE (np. na -v2).
const BIBLE_CACHE = 'bible-ubg-v1';
const BIBLE_URL = 'lib/ubg.json';
const ASSETS = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'lib/d3.min.js',
  'lib/markmap-view.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' — pobieraj świeże pliki z sieci, a nie z cache przeglądarki (GitHub Pages trzyma pliki do 10 min),
  // inaczej nowa wersja mogłaby zapisać stare pliki
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })));
    // Biblia: pobierz tylko jeśli jeszcze jej nie ma; błąd nie przerywa instalacji (zostanie dociągnięta przy pierwszym użyciu)
    try {
      const bible = await caches.open(BIBLE_CACHE);
      if (!(await bible.match(BIBLE_URL))) await bible.add(new Request(BIBLE_URL, { cache: 'reload' }));
    } catch (e) { /* ignoruj */ }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if ((key.startsWith('drzewko-') && key !== CACHE) || (key.startsWith('bible-ubg-') && key !== BIBLE_CACHE)) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    if (new URL(req.url).pathname.endsWith('/' + BIBLE_URL)) {
      const bible = await caches.open(BIBLE_CACHE);
      const b = await bible.match(req, { ignoreSearch: true });
      if (b) return b;
      try { const res = await fetch(req); if (res.ok) bible.put(req, res.clone()); return res; } catch (err) { return Response.error(); }
    }
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      if (req.mode === 'navigate') {
        const shell = (await cache.match('index.html')) || (await cache.match('./'));
        if (shell) return shell;
      }
      return Response.error();
    }
  })());
});
