// Service worker de VH Smart Campus.
// Il ne met en cache QUE les fichiers de l'interface (même origine). Les données (Firebase, Firestore,
// Storage, Cloud Functions) ne passent jamais par ce cache : un passage cantine ou un emploi du temps
// n'est jamais servi depuis un cache local.
const CACHE = 'vhsc-interface-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // Pages : réseau d'abord (toujours la dernière version), cache seulement hors connexion.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((r) => { const copie = r.clone(); caches.open(CACHE).then((c) => c.put('/', copie)); return r; })
        .catch(() => caches.match('/').then((r) => r || Response.error())),
    );
    return;
  }
  // Fichiers versionnés de l'interface (noms avec empreinte) et ressources statiques.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/vendor/') || url.pathname.startsWith('/icone') || url.pathname === '/apple-touch-icon.png' || url.pathname === '/manifest.webmanifest') {
    e.respondWith(
      caches.match(req).then((enCache) => enCache || fetch(req).then((r) => {
        if (r.ok) { const copie = r.clone(); caches.open(CACHE).then((c) => c.put(req, copie)); }
        return r;
      })),
    );
  }
});
