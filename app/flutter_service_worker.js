// Retires the service worker left by the previous (Flutter) build of this app.
// Browsers that still have it installed fetch this file on their next update
// check; it deletes only the old Flutter caches, unregisters itself and
// reloads the open tabs of this app so they pick up the new app (./sw.js).
// Cache Storage is shared by the whole origin (every project on
// arnold-rg.github.io), so never touch caches that are not Flutter's.
const FLUTTER_CACHES = new Set(['flutter-app-cache', 'flutter-temp-cache', 'flutter-app-manifest']);
const isFlutterCache = (k) => FLUTTER_CACHES.has(k) || k.startsWith('flutter-');

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(isFlutterCache).map((k) => caches.delete(k)));
    // Take control of this app's open tabs so they can be navigated, then reload each once.
    // The new page never registers this worker again, so this cannot loop.
    const scope = self.registration.scope;
    await self.clients.claim();
    const tabs = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .filter((c) => c.url.startsWith(scope));
    await self.registration.unregister();
    await Promise.all(tabs.map((c) => c.navigate(c.url).catch(() => {})));
  })());
});
