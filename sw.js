const CACHE_NAME = "0fluff-v4"; 

const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./icon.svg",
  "./manifest.json"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  // This line is crucial: it forces the new SW to take over immediately
  self.skipWaiting(); 
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
});
