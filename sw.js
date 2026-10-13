// Service worker for the static (GitHub Pages) build. Registered only when VITE_DATA_MODE=static.
// HTML and data/*.json: network first, cache as fallback (offline shows the last digest).
// Hashed assets, icons and images: cache first.
// main.tsx registers sw.js?v=<entry bundle name>, so every build installs a new worker with a new shell cache.
const BUILD = new URL(self.location.href).searchParams.get("v") || "v1";
const SHELL = `dtd-shell-${BUILD}`;
const IMAGES = "dtd-images-v1";
const MAX_IMAGES = 400;
const scope = new URL(self.registration.scope);
const at = (p) => new URL(p, scope).href;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll([at("./"), at("manifest.webmanifest"), at("icons/icon-192.png")])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL && k !== IMAGES).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function networkFirst(req, key) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(req, { cache: "no-cache" });
    if (res.ok) await cache.put(key || req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(key || req);
    if (hit) return hit;
    throw new Error("offline");
  }
}

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    await cache.put(req, res.clone());
    if (name === IMAGES) {
      const keys = await cache.keys();
      for (const k of keys.slice(0, Math.max(0, keys.length - MAX_IMAGES))) await cache.delete(k);
    }
  }
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const rel = url.pathname.slice(scope.pathname.length);
  if (req.mode === "navigate" || rel === "" || rel === "index.html") e.respondWith(networkFirst(req, at("./")));
  else if (rel.startsWith("data/")) e.respondWith(networkFirst(new Request(url.origin + url.pathname)));
  else if (rel.startsWith("images/")) e.respondWith(cacheFirst(req, IMAGES));
  else e.respondWith(cacheFirst(req, SHELL));
});
