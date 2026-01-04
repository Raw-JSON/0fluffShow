const CACHE_NAME = "ofluff-v1.1";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./icon.svg",
  "./manifest.json"
];

// Install Event: Cache core files
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Fetch Event: Serve from cache, fall back to network
self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => response || fetch(e.request))
  );
});
