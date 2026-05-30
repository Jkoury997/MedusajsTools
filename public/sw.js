/*
 * Service worker del pickup-system (hecho a mano, sin dependencias).
 *
 * Estrategias:
 *  - Estáticos (/_next/static, íconos, fuentes): cache-first.
 *  - Navegaciones (páginas): network-first → fallback a la página cacheada →
 *    fallback a /offline. Permite reabrir páginas ya visitadas sin internet.
 *  - GET de /api/*: network-first → fallback a la última respuesta cacheada
 *    (lectura offline de la lista y datos ya cargados).
 *  - Mutaciones (POST/PUT/DELETE/PATCH): nunca se cachean; offline fallan.
 *
 * Para forzar una actualización: subir CACHE_VERSION.
 */

const CACHE_VERSION = "v2";
const STATIC_CACHE = `mk-static-${CACHE_VERSION}`;
const PAGES_CACHE = `mk-pages-${CACHE_VERSION}`;
const API_CACHE = `mk-api-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline";

const PRECACHE = [OFFLINE_URL, "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Borrar cachés de versiones anteriores.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.endsWith(CACHE_VERSION))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

// El cliente nos pide aplicar la actualización (UpdateToast) o limpiar al salir.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
  if (event.data === "CLEAR_CACHES") {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
  }
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    /\.(?:js|css|woff2?|ttf|png|jpg|jpeg|svg|ico)$/.test(url.pathname)
  );
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res && res.ok) {
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, res.clone());
  }
  return res;
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGES_CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_URL);
    return offline || Response.error();
  }
}

async function networkFirstApi(request) {
  const cache = await caches.open(API_CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      // Marcar que es data servida desde caché (offline).
      const headers = new Headers(cached.headers);
      headers.set("X-Served-From", "sw-cache");
      return new Response(cached.body, { status: cached.status, headers });
    }
    return Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo manejamos mismo origen y GET. El resto (mutaciones, cross-origin) va directo a la red.
  if (url.origin !== self.location.origin || request.method !== "GET") return;

  // El heartbeat NUNCA se cachea: debe reflejar si el server responde de verdad.
  if (url.pathname === "/api/health") return;

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirstApi(request));
    return;
  }

  // Navegaciones (documentos HTML).
  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request));
  }
});
