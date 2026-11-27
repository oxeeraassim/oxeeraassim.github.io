/* Oxe — service worker dos jogos (um por pasta de jogo)
 * - Páginas, scripts e dados: busca na internet primeiro (sempre a versão mais nova) e guarda cópia para jogar sem internet.
 * - Arquivos pesados (modelos 3D, imagens, fontes, bibliotecas): usa a cópia guardada e atualiza por trás.
 * - VERSION muda sozinha a cada publicação (ferramentas/build_protegido.js), o que apaga o cache velho.
 */
'use strict';
const VERSION = 'pub-mwzegy9g';
const PREFIXO = 'oxe-' + new URL('./', self.location.href).pathname.replace(/[^a-z0-9]+/gi, '-') ;
const CACHE = PREFIXO + VERSION;
const BASICO = ['./', './index.html', './manifest.webmanifest'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return Promise.all(BASICO.map(function (u) { return fetch(new Request(u, { cache: 'reload' })).then(function (r) { if (r.ok) return c.put(u, r); }).catch(function () {}); })); }));
  self.skipWaiting();
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return (k.indexOf(PREFIXO) === 0 && k !== CACHE) || k.indexOf('oxe-') !== 0; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('message', function (e) { if (e.data === 'pular-espera') self.skipWaiting(); });

var PESADO = /\.(glb|gltf|png|jpe?g|webp|gif|svg|mp3|ogg|wav|woff2?|ttf)(\?|$)|\/vendor\//i;
function guarda(req, res) { if (res && res.ok && (res.type === 'basic' || res.type === 'cors')) { var cp = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, cp); }); } return res; }
self.addEventListener('fetch', function (e) {
  var req = e.request; if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin && !/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) return;
  if (/\/(api|ranking)\//.test(url.pathname)) return;
  if (PESADO.test(url.pathname) || url.origin !== location.origin) {
    e.respondWith(caches.match(req).then(function (c) { var rede = fetch(req).then(function (r) { return guarda(req, r); }).catch(function () { return c; }); return c || rede; }));
    return;
  }
  e.respondWith(fetch(req, { cache: 'no-cache' }).then(function (r) { return guarda(req, r); }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (c) { return c || (req.mode === 'navigate' ? caches.match('./index.html').then(function (i) { return i || caches.match('./'); }) : undefined); });
  }));
});
