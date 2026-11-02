// The production build replaces these values with its complete asset manifest.
const BUILD_VERSION = '__EASYMD_VERSION__';
const ASSET_PATHS = __EASYMD_PRECACHE__;
const SCOPE = self.registration.scope;
const SCOPE_PATH = new URL(SCOPE).pathname;
const CACHE_PREFIX = `easymd-${encodeURIComponent(SCOPE_PATH)}-`;
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_VERSION}`;
const ASSETS = ASSET_PATHS.map((path) => new URL(path, SCOPE).href);
const ASSET_URLS = new Set(ASSETS);
const INDEX_URL = new URL('index.html', SCOPE).href;

self.addEventListener('install', (event) => {
  // Activate after the complete application, including lazy chunks, is cached.
  // Existing tabs keep their worker until closed to avoid mixed build versions.
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => (
      key !== CACHE_NAME && (
        key.startsWith(CACHE_PREFIX) ||
        (SCOPE_PATH === '/' && key.startsWith('easymd-cache-'))
      )
    )).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== new URL(SCOPE).origin || !url.pathname.startsWith(SCOPE_PATH)) return;
  // This editor has no client-side routes. Only its entry URLs use the shell;
  // other pages on the same origin must keep their own navigation behavior.
  const isAppNavigation = event.request.mode === 'navigate' && (
    url.pathname === SCOPE_PATH || url.pathname === new URL(INDEX_URL).pathname
  );
  if (!isAppNavigation && !ASSET_URLS.has(url.href)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Every lookup here is a build-manifest asset (or its static index.html).
    // Static hosts can send Vary: Origin: preload/crossorigin requests carry an
    // Origin header while install-time addAll requests do not. The build bytes
    // are identical; dynamic and external requests never enter this branch.
    const cached = await cache.match(isAppNavigation ? INDEX_URL : event.request, { ignoreVary: true });
    return cached || fetch(event.request);
  })());
});
