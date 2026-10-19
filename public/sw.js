// Service worker minimal : Chrome exige un gestionnaire « fetch » pour proposer l'installation.
// Aucune mise en cache : les requêtes passent toujours par le réseau, donc pas de version périmée après une mise à jour.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.method === 'GET') e.respondWith(fetch(e.request));
});
