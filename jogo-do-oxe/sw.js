/**
 * SERVICE WORKER — OXE! 2.0: A Grande Jornada dos Nove Sóis
 * Estratégia:
 *  - HTML / JS / JSON / navegação  -> NETWORK-FIRST (corrige B16: nunca servir código velho)
 *  - Imagens / ícones / demais      -> STALE-WHILE-REVALIDATE
 *  - Offline                        -> fallback para o cache (e index.html em navegação)
 */

const CACHE_NAME = 'oxe-jogo-v15';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './game.js',
  './levels.js',
  './graphics_hd.js',
  './art_v3.js',
  './audio.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon.svg'
];

const NETWORK_TIMEOUT_MS = 4000;

// ===================== INSTALL =====================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // cache: 'reload' ignora o cache HTTP do navegador -> garante arquivos frescos
      return Promise.all(
        ASSETS_TO_CACHE.map((url) =>
          fetch(new Request(url, { cache: 'reload' }))
            .then((res) => {
              if (res && res.ok) return cache.put(url, res);
              return null;
            })
            .catch((err) => {
              console.warn('[SW] Falha ao pré-cachear', url, err);
              return null;
            })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ===================== ACTIVATE =====================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : null))
      ))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then((clients) => {
        clients.forEach((client) => {
          try {
            client.postMessage({ type: 'SW_UPDATED', version: CACHE_NAME });
          } catch (e) {}
        });
      })
  );
});

// ===================== MENSAGENS =====================
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (data.type === 'GET_VERSION' && event.source) {
    try { event.source.postMessage({ type: 'SW_VERSION', version: CACHE_NAME }); } catch (e) {}
  }
});

// ===================== HELPERS =====================
function isCodeRequest(request, url) {
  if (request.mode === 'navigate') return true;
  const dest = request.destination;
  if (dest === 'document' || dest === 'script' || dest === 'manifest') return true;
  return /\.(html?|js|mjs|json|webmanifest)$/i.test(url.pathname) || url.pathname.endsWith('/');
}

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(request, { cache: 'no-store' }).then((res) => {
      clearTimeout(timer);
      resolve(res);
    }).catch((err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function putInCache(request, response) {
  if (!response || !response.ok || response.type === 'opaque') return Promise.resolve();
  const copy = response.clone();
  return caches.open(CACHE_NAME)
    .then((cache) => cache.put(request, copy))
    .catch(() => {});
}

async function networkFirst(event) {
  const request = event.request;
  try {
    const response = await fetchWithTimeout(request, NETWORK_TIMEOUT_MS);
    if (response && response.ok) {
      event.waitUntil(putInCache(request, response));
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const fallback = (await caches.match('./index.html')) || (await caches.match('./'));
      if (fallback) return fallback;
    }
    return new Response('Offline — recurso indisponível.', {
      status: 503,
      statusText: 'Offline',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

async function staleWhileRevalidate(event) {
  const request = event.request;
  const cached = await caches.match(request);
  const networkPromise = fetch(request).then((response) => {
    if (response && response.ok) {
      event.waitUntil(putInCache(request, response));
    }
    return response;
  }).catch(() => null);

  if (cached) {
    event.waitUntil(networkPromise);
    return cached;
  }
  const net = await networkPromise;
  if (net) return net;
  return new Response('', { status: 504, statusText: 'Offline' });
}

// ===================== FETCH =====================
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch (e) { return; }

  // Ignora extensões, data:, blob: e origens externas
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (url.origin !== self.location.origin) return;

  if (isCodeRequest(request, url)) {
    event.respondWith(networkFirst(event));
  } else {
    event.respondWith(staleWhileRevalidate(event));
  }
});
