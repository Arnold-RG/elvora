// Retires the service worker left by the previous (Flutter) build of this app.
// Browsers that still have it installed fetch this file on their next update
// check; it clears the old Flutter caches, unregisters itself and reloads open
// tabs so they pick up the new app (which registers ./sw.js).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.startsWith('elvora-')).map((k) => caches.delete(k)));
    await self.registration.unregister();
    const tabs = await self.clients.matchAll({ type: 'window' });
    tabs.forEach((c) => c.navigate(c.url));
  })());
});
