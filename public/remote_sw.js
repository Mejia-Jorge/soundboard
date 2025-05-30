const CACHE_NAME = 'soundboard-remote-cache-v1';
const urlsToCache = [
  '/', // This will cache remote.html as it's served at the root
  '/remote_manifest.json', // Cache the manifest file itself
  // Add paths to icons if they are not already covered by a general fetch handler
  // For now, let's assume the browser handles manifest icon caching,
  // or we can add them explicitly if offline icon display is an issue.
  // '/logo512.png',
  // '/icon.png'
];

// Install event: opens the cache and adds core files to it
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('Opened cache for Soundboard Remote');
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch event: serves assets from cache if available, otherwise fetches from network
self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        // Cache hit - return response
        if (response) {
          return response;
        }
        // Not in cache - fetch from network
        return fetch(event.request).then(
          function(response) {
            // Check if we received a valid response
            if(!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // IMPORTANT: Clone the response. A response is a stream
            // and because we want the browser to consume the response
            // as well as the cache consuming the response, we need
            // to clone it so we have two streams.
            var responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(function(cache) {
                // We don't cache every single request here, only if needed.
                // For a minimal PWA, caching on install is primary.
                // This section could be expanded to cache new requests dynamically.
                // For now, let's not cache dynamically fetched assets in this simple version
                // unless they are part of urlsToCache.
              });

            return response;
          }
        );
      })
    );
});

// Activate event: cleans up old caches
self.addEventListener('activate', function(event) {
  var cacheWhitelist = [CACHE_NAME]; // Add new cache names here if they are created
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache for Soundboard Remote:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
