// Baron Financeiro — Service Worker (PWA)
// Cache simples dos assets estáticos pra abrir offline e instalação na home screen.
// Estrategia: stale-while-revalidate para HTML/CSS/JS, network-first para chamadas Supabase.

const CACHE_VERSION = "baron-v2";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./config.js",
  "./auth.js",
  "./remote-store.js",
  "./data.js",
  "./charts.js",
  "./ai.js",
  "./ai-ui.js",
  "./app.js",
  "./manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => null))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Nunca cacheia APIs Supabase, o proxy de IA nem CDN do SDK — sempre rede primeiro
  if (
    url.hostname.endsWith("supabase.co") ||
    url.hostname.endsWith("supabase.in") ||
    url.hostname.includes("jsdelivr.net") ||
    url.pathname.startsWith("/api/")
  ) {
    return;
  }

  // Apenas GET é cacheável
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((response) => {
          if (response && response.ok && response.type === "basic") {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached); // se rede falhar, devolve o cache
      return cached || fetchPromise;
    })
  );
});
