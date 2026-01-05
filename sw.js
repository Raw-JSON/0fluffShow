const CACHE_NAME = "0fluff-v7"; // Increment this version number whenever you update code!

const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./icon.svg",
  "./manifest.json"
];

// 1. INSTALL: Cache all files immediately
self.addEventListener("install", (e) => {
  console.log("[SW] Installing...");
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[SW] Caching all assets");
      return cache.addAll(ASSETS);
    })
  );
  // Forces this new Service Worker to become active immediately
  self.skipWaiting(); 
});

// 2. ACTIVATE: Clean up old caches (Robustness for updates)
self.addEventListener("activate", (e) => {
  console.log("[SW] Activating...");
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  // Takes control of any open pages immediately
  return self.clients.claim();
});

// 3. FETCH: The missing piece! (Offline capability)
self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      // Hit? Return the cached version (Offline works!)
      if (response) {
        return response;
      }
      
      // Miss? Fetch from network
      return fetch(e.request).catch(() => {
        // Optional: If network fails and not in cache, you could show a fallback page here
        // But for a single-page app, usually the cache covers it.
        console.log("Offline and file not cached:", e.request.url);
      });
    })
  );
});
