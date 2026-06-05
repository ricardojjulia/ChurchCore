// ChurchCore Service Worker
// Provides offline support for the member portal.
// Sprint 3 — PWA offline caching.

const CACHE_VERSION = "v1";
const STATIC_CACHE = `churchcore-static-${CACHE_VERSION}`;
const PAGES_CACHE = `churchcore-pages-${CACHE_VERSION}`;
const FONTS_CACHE = `churchcore-fonts-${CACHE_VERSION}`;

// Pages cached on first visit and served offline if the network fails.
const PORTAL_ROUTES = ["/portal", "/app/member", "/app/member/directory", "/app/member/family", "/app/member/ministries"];

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES_CACHE)
      .then((cache) => cache.addAll(PORTAL_ROUTES))
      .then(() => self.skipWaiting()),
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────
// Delete caches from previous versions.
self.addEventListener("activate", (event) => {
  const keepCaches = new Set([STATIC_CACHE, PAGES_CACHE, FONTS_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("churchcore-") && !keepCaches.has(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GET requests.
  if (request.method !== "GET" || url.origin !== self.location.origin) {
    // Google Fonts — cache-first for fast repeat loads.
    if (
      url.hostname === "fonts.googleapis.com" ||
      url.hostname === "fonts.gstatic.com"
    ) {
      event.respondWith(cacheFirst(request, FONTS_CACHE));
    }
    return;
  }

  // Next.js static assets — cache-first, long-lived.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Member portal pages — network-first, fall back to cache.
  if (url.pathname === "/portal" || url.pathname.startsWith("/app/member")) {
    event.respondWith(networkFirst(request, PAGES_CACHE));
    return;
  }
});

// ── Strategies ────────────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(
      "<html><body><p>You are offline. Please reconnect to see the latest content.</p></body></html>",
      { headers: { "Content-Type": "text/html" } },
    );
  }
}

// ── Push notification handlers ────────────────────────────────

self.addEventListener("push", (event) => {
  let data = { title: "ChurchCore", body: "", url: "/" };
  if (event.data) {
    try {
      data = Object.assign(data, event.data.json());
    } catch {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const existing = clientList.find((c) => c.url.includes(self.location.origin) && "focus" in c);
      if (existing) {
        existing.focus();
        existing.navigate(url);
        return;
      }
      clients.openWindow(url);
    }),
  );
});
