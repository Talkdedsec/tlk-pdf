// Offline support for the hosted app: the app shell is cached on install,
// everything else (pdf.js data files, fonts) is cached the first time it is
// used. A new version gets a new cache name.
const CACHE = 'tlk-pdf-1.0.1';
const SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
  'js/app.js', 'js/i18n.js', 'js/store.js', 'js/geometry.js', 'js/pdfio.js', 'js/signature.js', 'js/version.js',
  'vendor/pdf-lib.min.js', 'vendor/fontkit.umd.min.js', 'vendor/fflate.min.js',
  'vendor/pdfjs/pdf.min.mjs', 'vendor/pdfjs/pdf.worker.min.mjs',
  'fonts/IBMPlexSans-Regular.woff', 'fonts/IBMPlexSans-Medium.woff', 'fonts/IBMPlexSans-SemiBold.woff', 'fonts/IBMPlexSans-Bold.woff',
  'demo/sample.pdf'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  })));
});
