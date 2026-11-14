/* Oxe! Metrópole 3D — Service Worker standalone
 * Escopo: a pasta onde este arquivo está (/…/cidade-do-oxe/).
 * Não interfere em /jogo-do-oxe/sw.js: o escopo é próprio e os caches
 * usam prefixo exclusivo (o Cache Storage é compartilhado por origem).
 */
'use strict';

const VERSION = 'pub-mwgfav4w'; // Altere a cada deploy para invalidar o cache antigo
const CACHE_PREFIX = 'cidade-do-oxe-';
const CACHE_NAME = CACHE_PREFIX + VERSION;

const SCOPE_URL = new URL('./', self.location.href);
const INDEX_URL = new URL('./index.html', SCOPE_URL).href;

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles/oxe_ui.css',
  './styles/oxe_hd.css',
  './vendor/three.min.js',
  './js/textures_oxe.js',
  './js/herois_oxe_3d.js',
  './js/visual_oxe_hd.js',
  './js/collision_oxe.js',
  './map_data.js',
  './game_data.js',
  './js/sim_engine.js',
  './js/world_3d.js',
  './js/roads_vehicles_3d.js',
  './js/structures_ext_3d.js',
  './js/audio_oxe.js',
  './js/street_mode.js',
  './js/ui_campanha.js',
  './js/oxe_bridge.js',
  './js/fable_melhorias_40.js',
  './js/oxe_recursos.js'
];

const OFFLINE_HTML = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Oxe! Metrópole 3D — offline</title>
<style>
  html,body{height:100%;margin:0}
  body{display:flex;align-items:center;justify-content:center;
       background:#F2E8D5;color:#1B1714;
       font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
       text-align:center;padding:24px;box-sizing:border-box}
  h1{font-size:1.6rem;margin:0 0 .5rem}
  p{margin:0 0 1.25rem;opacity:.8}
  button{background:#1B1714;color:#F2E8D5;border:0;border-radius:8px;
         padding:.75rem 1.5rem;font-size:1rem;cursor:pointer}
</style>
</head>
<body>
  <main>
    <h1>Oxe! Você está offline</h1>
    <p>Não foi possível carregar a Metrópole 3D agora. Verifique a conexão e tente de novo.</p>
    <button onclick="location.reload()">Tentar novamente</button>
  </main>
</body>
</html>`;

/* ---------- install: pré-cache ---------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) =>
        // cache: 'reload' ignora o cache HTTP e garante arquivos frescos
        cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))
      )
      .then(() => self.skipWaiting())
  );
});

/* ---------- activate: remove versões antigas (somente as deste app) ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

/* ---------- fetch: cache-first + fallback offline ---------- */
self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;
  if (request.headers.has('range')) return;

  const url = new URL(request.url);

  // Só trata requisições da mesma origem e dentro de /cidade-do-oxe/
  if (url.origin !== SCOPE_URL.origin) return;
  if (!url.pathname.startsWith(SCOPE_URL.pathname)) return;

  // UPGRADE: página e código sempre frescos quando há internet (rede primeiro, cache se offline);
  // texturas e biblioteca 3D continuam cache-first (rápido). Acaba o "recarregar duas vezes".
  const fresco = request.mode === 'navigate' || /\.(html?|js|css|json|webmanifest)$/i.test(url.pathname) && !/\/vendor\//.test(url.pathname);
  event.respondWith(fresco ? networkFirst(request) : cacheFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const isNavigation = request.mode === 'navigate';
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
    const response = await fetch(request, { cache: 'no-cache', signal: ctl.signal });
    clearTimeout(t);
    if (response && response.ok && response.type === 'basic' && !response.redirected) cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: isNavigation });
    if (cached) return cached;
    return cacheFirst(request);
  }
}

async function cacheFirst(request) {
  // Usa apenas o cache deste app (nunca caches.match global)
  const cache = await caches.open(CACHE_NAME);
  const isNavigation = request.mode === 'navigate';

  const cached = await cache.match(request, { ignoreSearch: isNavigation });
  if (cached) return cached;

  try {
    const response = await fetch(request);

    if (response && response.ok && response.type === 'basic' && !response.redirected) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (err) {
    if (isNavigation) {
      const shell = (await cache.match(INDEX_URL)) || (await cache.match(SCOPE_URL.href));
      if (shell) return shell;

      return new Response(OFFLINE_HTML, {
        status: 503,
        statusText: 'Offline',
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
      });
    }

    return new Response('', {
      status: 503,
      statusText: 'Offline',
      headers: { 'Cache-Control': 'no-store' }
    });
  }
}

/* ---------- permite que a página force a atualização ---------- */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING' || (event.data && event.data.type === 'SKIP_WAITING')) {
    self.skipWaiting();
  }
});
