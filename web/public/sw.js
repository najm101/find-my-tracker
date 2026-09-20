/*
 * The service worker exists so the dashboard can be installed to a home screen; it deliberately
 * caches nothing.
 *
 * This is a window onto live data — where your things are right now. A cached tile or a stale
 * API response would show a position that is not true any more, which is worse than showing
 * nothing. So every request goes to the network, and offline simply fails.
 */
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))
self.addEventListener("fetch", () => {
  // No respondWith: the browser handles it exactly as it would without a worker.
})
