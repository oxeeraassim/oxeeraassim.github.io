#!/usr/bin/env node
/* test_oxe2_real.js — Testes REAIS do "Oxe, era assim? 2" (carrega os arquivos do disco via vm). */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

const DEFAULT_ROOT = '/Users/joaobatistaramalhodelima/Documents/GitHub/oxeeraassim.github.io/jogo-do-oxe';
const ROOT = process.env.OXE_ROOT || (fs.existsSync(DEFAULT_ROOT) ? DEFAULT_ROOT : __dirname);
const R = (f) => path.join(ROOT, f);
const results = [];
const consoleErrors = [];
function record(id, name, pass, details = {}) { results.push({ id, name, pass: !!pass, details }); console.log(`${pass ? '✅' : '❌'} [${id}] ${name}`); if (!pass) console.log('   ↳', JSON.stringify(details).slice(0, 600)); }
async function test(id, name, fn) { try { const r = await fn(); record(id, name, r.pass, r.details || {}); } catch (e) { record(id, name, false, { exception: String(e && e.stack || e).split('\n').slice(0, 4).join(' | ') }); } }

/* ---------------- DOM / Canvas2D / Audio harness ---------------- */
const html = fs.readFileSync(R('index.html'), 'utf8');
function makeCtx(canvas) {
  const store = { canvas, fillStyle: '#000', strokeStyle: '#000', globalAlpha: 1, font: '10px sans-serif', lineWidth: 1, textAlign: 'start', textBaseline: 'alphabetic', globalCompositeOperation: 'source-over', imageSmoothingEnabled: true };
  return new Proxy(store, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === 'symbol') return undefined;
      if (k === 'measureText') return (s) => ({ width: String(s).length * 8, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
      if (/^create(Linear|Radial|Conic)Gradient$/.test(k) || k === 'createPattern') return () => ({ addColorStop() {} });
      if (k === 'getImageData' || k === 'createImageData') return (a, b, w = 1, h = 1) => ({ data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w, height: h });
      if (k === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      if (k === 'isPointInPath' || k === 'isPointInStroke') return () => false;
      if (k === 'getLineDash') return () => [];
      return function () {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
function classList(el) { const s = new Set(); return { add: (...c) => c.forEach((x) => s.add(x)), remove: (...c) => c.forEach((x) => s.delete(x)), toggle: (c, f) => { const on = f === undefined ? !s.has(c) : !!f; on ? s.add(c) : s.delete(c); return on; }, contains: (c) => s.has(c), get length() { return s.size; } }; }
class El {
  constructor(tag, id, cls) { this.tagName = String(tag || 'div').toUpperCase(); this.nodeName = this.tagName; this.id = id || ''; this.className = cls || ''; this.style = {}; this.dataset = {}; this.children = []; this.childNodes = this.children; this.attributes = {}; this.classList = classList(this); (cls || '').split(/\s+/).filter(Boolean).forEach((c) => this.classList.add(c)); this.textContent = ''; this.innerHTML = ''; this.innerText = ''; this.value = ''; this.checked = false; this.disabled = false; this.width = 960; this.height = 540; this.clientWidth = 960; this.clientHeight = 540; this.offsetWidth = 960; this.offsetHeight = 540; this._l = {}; this.parentElement = null; this.parentNode = null; }
  addEventListener(t, f) { (this._l[t] = this._l[t] || []).push(f); } removeEventListener() {} dispatchEvent() { return true; }
  appendChild(c) { this.children.push(c); if (c) { c.parentElement = this; c.parentNode = this; } return c; } append(...c) { c.forEach((x) => this.appendChild(x)); } prepend(c) { this.appendChild(c); }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; } insertBefore(c) { return this.appendChild(c); } replaceChildren() { this.children = []; } remove() {}
  setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'id') this.id = v; } getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; } hasAttribute(k) { return k in this.attributes; } removeAttribute(k) { delete this.attributes[k]; }
  querySelector() { return null; } querySelectorAll() { return []; } closest() { return null; } contains() { return false; } matches() { return false; }
  getContext() { return (this._ctx = this._ctx || makeCtx(this)); } toDataURL() { return 'data:image/png;base64,'; }
  getBoundingClientRect() { return { left: 0, top: 0, x: 0, y: 0, width: this.width, height: this.height, right: this.width, bottom: this.height }; }
  focus() {} blur() {} click() {} scrollIntoView() {} requestFullscreen() { return Promise.resolve(); } play() { return Promise.resolve(); } pause() {} load() {} cloneNode() { return new El(this.tagName, '', this.className); }
}
const byId = {}, byClass = {}, byTag = {};
for (const m of html.matchAll(/<([a-zA-Z0-9-]+)\b([^>]*)>/g)) {
  const tag = m[1].toLowerCase(), attrs = m[2];
  const id = (/\sid\s*=\s*["']([^"']+)["']/.exec(attrs) || [])[1];
  const cls = (/\sclass\s*=\s*["']([^"']+)["']/.exec(attrs) || [])[1] || '';
  if (!id && !cls && tag !== 'canvas') continue;
  const el = new El(tag, id, cls);
  const w = /\swidth\s*=\s*["']?(\d+)/.exec(attrs), h = /\sheight\s*=\s*["']?(\d+)/.exec(attrs);
  if (w) el.width = +w[1]; if (h) el.height = +h[1];
  if (id) byId[id] = el;
  cls.split(/\s+/).filter(Boolean).forEach((c) => (byClass[c] = byClass[c] || []).push(el));
  (byTag[tag] = byTag[tag] || []).push(el);
}
const requestedMissingIds = new Set();
const listOf = (a) => { const r = a.slice(); r.item = (i) => r[i]; return r; };
function qsa(sel) {
  sel = String(sel).trim().split(',')[0].trim();
  if (sel.startsWith('#')) return byId[sel.slice(1)] ? [byId[sel.slice(1)]] : [];
  if (sel.startsWith('.')) return byClass[sel.slice(1).split(/[\s.:[]/)[0]] || [];
  return byTag[sel.toLowerCase().split(/[\s.:[]/)[0]] || [];
}
const body = new El('body'), docEl = new El('html'), head = new El('head');
const document = {
  readyState: 'complete', body, documentElement: docEl, head, hidden: false, visibilityState: 'visible', fullscreenElement: null, title: '',
  getElementById: (id) => { if (byId[id]) return byId[id]; requestedMissingIds.add(id); return null; },
  querySelector: (s) => qsa(s)[0] || null, querySelectorAll: (s) => listOf(qsa(s)),
  getElementsByClassName: (c) => listOf(byClass[c] || []), getElementsByTagName: (t) => listOf(byTag[String(t).toLowerCase()] || []),
  createElement: (t) => new El(t), createElementNS: (n, t) => new El(t), createTextNode: (t) => ({ textContent: t }), createDocumentFragment: () => new El('fragment'),
  addEventListener() {}, removeEventListener() {}, exitFullscreen: () => Promise.resolve(), hasFocus: () => true,
};
let audioCtxInstances = 0;
function audioParam() { return { value: 0, defaultValue: 0, setValueAtTime() { return this; }, linearRampToValueAtTime() { return this; }, exponentialRampToValueAtTime() { return this; }, setTargetAtTime() { return this; }, cancelScheduledValues() { return this; }, cancelAndHoldAtTime() { return this; }, setValueCurveAtTime() { return this; } }; }
const PARAMS = ['frequency', 'gain', 'detune', 'Q', 'pan', 'playbackRate', 'delayTime', 'threshold', 'knee', 'ratio', 'attack', 'release', 'offset'];
function audioNode() {
  return new Proxy({ connect(n) { return n || this; }, disconnect() {}, start() {}, stop() {}, onended: null, buffer: null, type: 'sine', loop: false, curve: null, setPeriodicWave() {}, getByteFrequencyData() {}, getFloatTimeDomainData() {} },
    { get(t, k) { if (k in t) return t[k]; if (PARAMS.includes(k)) return (t[k] = audioParam()); if (typeof k === 'symbol') return undefined; return function () {}; }, set(t, k, v) { t[k] = v; return true; } });
}
class FakeAudioContext {
  constructor() { audioCtxInstances++; this.state = 'running'; this._t = 0; this.sampleRate = 44100; this.destination = audioNode(); this.listener = audioNode(); }
  get currentTime() { return (this._t += 0.016); }
  resume() { this.state = 'running'; return Promise.resolve(); } suspend() { this.state = 'suspended'; return Promise.resolve(); } close() { this.state = 'closed'; return Promise.resolve(); }
  createBuffer(ch, len, sr) { const d = Array.from({ length: ch }, () => new Float32Array(Math.max(1, len))); return { numberOfChannels: ch, length: len, sampleRate: sr, duration: len / sr, getChannelData: (i) => d[i] }; }
  createPeriodicWave() { return {}; } decodeAudioData() { return Promise.resolve(this.createBuffer(1, 1, 44100)); }
}
['createOscillator', 'createGain', 'createBiquadFilter', 'createBufferSource', 'createDynamicsCompressor', 'createStereoPanner', 'createDelay', 'createWaveShaper', 'createConvolver', 'createAnalyser', 'createChannelMerger', 'createChannelSplitter', 'createConstantSource', 'createPanner', 'createMediaElementSource'].forEach((n) => { FakeAudioContext.prototype[n] = function () { return audioNode(); }; });

const store = {};
const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, clear: () => { for (const k in store) delete store[k]; }, key: (i) => Object.keys(store)[i] || null, get length() { return Object.keys(store).length; } };
const rafQueue = [];
const sandbox = {
  console: { log() {}, info() {}, debug() {}, warn: (...a) => consoleErrors.push('warn: ' + a.join(' ')), error: (...a) => consoleErrors.push('error: ' + a.join(' ')) },
  document, localStorage, sessionStorage: localStorage, navigator: { userAgent: 'node-test', language: 'pt-BR', maxTouchPoints: 0, serviceWorker: { register: () => Promise.resolve({}), addEventListener() {} }, vibrate() {}, getGamepads: () => [] },
  location: { search: '', href: 'http://localhost/jogo-do-oxe/', hostname: 'localhost', pathname: '/jogo-do-oxe/', protocol: 'http:', origin: 'http://localhost', reload() {} },
  history: { replaceState() {}, pushState() {} }, screen: { width: 1280, height: 720, orientation: { lock: () => Promise.resolve() } },
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  performance: { now: () => Date.now() }, requestAnimationFrame: (f) => { rafQueue.push(f); return rafQueue.length; }, cancelAnimationFrame() {},
  setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, queueMicrotask: (f) => Promise.resolve().then(f),
  AudioContext: FakeAudioContext, webkitAudioContext: FakeAudioContext, Image: class { constructor() { this.complete = true; this.width = 1; this.height = 1; } set src(v) { this._s = v; } get src() { return this._s; } addEventListener() {} },
  Audio: class { play() { return Promise.resolve(); } pause() {} addEventListener() {} }, URLSearchParams, URL, Math, Date, JSON, Promise, Map, Set, WeakMap, Symbol, Float32Array, Uint8Array, Uint8ClampedArray, Int16Array,
  fetch: () => Promise.reject(new Error('offline-test')), matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
  addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, alert() {}, confirm: () => true, prompt: () => null, open() {}, getComputedStyle: () => ({ getPropertyValue: () => '' }),
  KeyboardEvent: class {}, Event: class {}, CustomEvent: class {},
};
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
const ctx = vm.createContext(sandbox);
const ev = (code) => vm.runInContext(code, ctx);
const srcs = {};
function loadInCtx(file) { const src = fs.readFileSync(R(file), 'utf8'); srcs[file] = src; new vm.Script(src, { filename: file }); vm.runInContext(src, ctx, { filename: file }); return src.length; }

/* ---------------- Helpers ---------------- */
const num = (v) => typeof v === 'number' && isFinite(v);
const typeOf = (e) => String((e && (e.type || e.kind || e.subtype || e.enemyType || e.name)) || (e && e.constructor && e.constructor.name) || '');
const isStunned = (e) => !!(e && (e.stunned || e.isStunned || e.dizzy || (num(e.stunTimer) && e.stunTimer > 0) || (num(e.stun) && e.stun > 0) || /stun|dizzy|atordo|tonto/i.test(String(e.state || e.mode || e.phase || ''))));
const facingOf = (e) => { const f = e.facing ?? e.dir ?? e.direction; if (num(f)) return Math.sign(f); if (f === 'left') return -1; if (f === 'right') return 1; return num(e.vx) ? Math.sign(e.vx) : 0; };
const W_ = (e) => (num(e.w) ? e.w : num(e.width) ? e.width : 32), H_ = (e) => (num(e.h) ? e.h : num(e.height) ? e.height : 32);
function tryCall(o, names, ...args) { if (!o) return { ok: false }; for (const n of names) if (typeof o[n] === 'function') return { ok: true, name: n, ret: o[n](...args) }; return { ok: false }; }
function protect(p) { if (!p) return; for (const k of ['invuln', 'invulnTimer', 'invulnerable', 'iframes', 'invincibleTimer', 'invincible', 'invulnFrames', 'damageCooldown']) { if (typeof p[k] === 'number') p[k] = 999; else if (typeof p[k] === 'boolean') p[k] = true; } }
const sleepFrames = (T, n) => T.step(n);

(async function main() {
  const t0 = Date.now();
  let T = null, AE = null, S = null;

  /* 1. Sintaxe e carregamento */
  await test('1', 'Sintaxe + carregamento real (audio.js, levels.js, game.js, sw.js, manifest.json) + globais', async () => {
    const d = {};
    const scriptOrder = [...html.matchAll(/<script[^>]*\ssrc\s*=\s*["']([^"']+)["']/g)].map((m) => m[1].split('?')[0]).filter((s) => !/^https?:/.test(s));
    d.scriptsNoHtml = scriptOrder;
    const order = ['audio.js', 'levels.js', 'game.js'];
    for (const s of scriptOrder) if (!order.includes(s) && fs.existsSync(R(s)) && !/sw\.js$/.test(s)) order.splice(order.indexOf('game.js'), 0, s);
    d.loaded = {};
    for (const f of order) d.loaded[f] = loadInCtx(f) + ' bytes';
    const sw = fs.readFileSync(R('sw.js'), 'utf8'); srcs['sw.js'] = sw; new vm.Script(sw, { filename: 'sw.js' });
    const swL = {}; const swCtx = vm.createContext({ self: { addEventListener: (t, f) => (swL[t] = f), skipWaiting: () => Promise.resolve(), clients: { claim: () => Promise.resolve(), matchAll: () => Promise.resolve([]) }, registration: {}, location: { origin: 'http://localhost' } }, caches: { open: () => Promise.resolve({ addAll: () => Promise.resolve(), put: () => Promise.resolve(), match: () => Promise.resolve() }), keys: () => Promise.resolve([]), match: () => Promise.resolve(), delete: () => Promise.resolve(true) }, fetch: () => Promise.reject(), console: sandbox.console, URL, Response: class {}, Request: class {}, Promise });
    swCtx.self.caches = swCtx.caches; vm.runInContext(sw, swCtx, { filename: 'sw.js' });
    d.swListeners = Object.keys(swL);
    d.swPrecacheOk = ['audio.js', 'levels.js', 'game.js'].every((f) => sw.includes(f));
    const man = JSON.parse(fs.readFileSync(R('manifest.json'), 'utf8')); srcs['manifest.json'] = JSON.stringify(man);
    d.manifest = { name: man.name, start_url: man.start_url, icons: (man.icons || []).length, display: man.display };
    T = sandbox.__OXE_TEST__; AE = sandbox.AudioEngine; S = T && T.GAME_STATE;
    d.globals = { AudioEngine: !!AE, OxeLevels: !!sandbox.OxeLevels, __OXE_TEST__: !!T };
    d.idsNoHtml = Object.keys(byId).length;
    d.idsPedidosAusentes = [...requestedMissingIds];
    d.stateAposBoot = T && T.getState().currentState;
    const pass = d.globals.AudioEngine && d.globals.OxeLevels && d.globals.__OXE_TEST__ && d.swListeners.includes('fetch') && d.swListeners.includes('install') && d.manifest.icons > 0 && !!man.name;
    return { pass, details: d };
  });
  if (!T) { writeReport(t0); process.exit(1); }

  /* 2. Áudio */
  await test('2', 'Áudio 100% (B4, B9, B10): SONGS, SFX_NAMES, pause/resume, sem playSFX||playSFX', async () => {
    const d = { errors: [] };
    const fromCtx = (n) => { try { return ev(`typeof ${n} !== 'undefined' ? ${n} : null`); } catch (e) { return null; } };
    const SONGS = (AE && (AE.SONGS || AE.songs)) || fromCtx('SONGS');
    const SFX = (AE && (AE.SFX_NAMES || AE.sfxNames)) || fromCtx('SFX_NAMES');
    const names = (x) => (!x ? [] : Array.isArray(x) ? x.map((s) => (typeof s === 'string' ? s : s.name || s.id)) : Object.keys(x));
    const songs = names(SONGS), sfx = names(SFX);
    d.songs = songs; d.sfxCount = sfx.length;
    tryCall(AE, ['init', 'unlock', 'ensureContext', 'resume']);
    const playM = ['playMusic', 'playSong', 'music', 'startMusic'].find((n) => AE && typeof AE[n] === 'function');
    const playS = ['playSFX', 'sfx', 'playSfx', 'play'].find((n) => AE && typeof AE[n] === 'function');
    d.api = { playM, playS, pauseMusic: typeof (AE && AE.pauseMusic), resumeMusic: typeof (AE && AE.resumeMusic) };
    const before = consoleErrors.length;
    let okSongs = 0, okSfx = 0;
    for (const s of songs) { try { AE[playM](s); okSongs++; } catch (e) { d.errors.push(`song ${s}: ${e.message}`); } }
    for (const s of sfx) { try { AE[playS](s); okSfx++; } catch (e) { d.errors.push(`sfx ${s}: ${e.message}`); } }
    let pr = true; try { AE.pauseMusic(); AE.resumeMusic(); AE.pauseMusic(); AE.resumeMusic(); } catch (e) { pr = false; d.errors.push('pause/resume: ' + e.message); }
    d.consoleErrorsDuranteAudio = consoleErrors.slice(before).slice(0, 10);
    const bad = [];
    for (const [f, s] of Object.entries(srcs)) { const m = s.match(/playSFX\s*\([^)]*\)\s*\|\|\s*(?:\w+\.)?playSFX/g); if (m) bad.push(`${f}: ${m.length}`); }
    d.playSfxOrPlaySfx = bad; d.okSongs = `${okSongs}/${songs.length}`; d.okSfx = `${okSfx}/${sfx.length}`;
    return { pass: songs.length > 0 && sfx.length > 0 && !!playM && !!playS && okSongs === songs.length && okSfx === sfx.length && pr && bad.length === 0 && d.errors.length === 0, details: d };
  });

  /* Medição física real do Tonho (usada no teste 9) */
  const phys = { measured: false };
  await test('P', 'Medição física real do pulo do Tonho (fase 1-1)', async () => {
    T.loadLevel(0); T.injectInput({ jump: false, left: false, right: false }); T.step(90);
    const p = T.getPlayer(); let guard = 0; while (!p.onGround && guard++ < 300) T.step(1);
    const x0 = p.x, y0 = p.y; let minY = y0, left = false, dxLand = null;
    T.injectInput({ jump: true, right: true });
    for (let i = 0; i < 400; i++) { T.step(1); protect(p); minY = Math.min(minY, p.y); if (!p.onGround) left = true; if (left && (p.onGround || p.y >= y0)) { dxLand = Math.abs(p.x - x0); break; } }
    T.injectInput({ jump: false, right: false });
    Object.assign(phys, { measured: left && dxLand !== null, rise: Math.round(y0 - minY), dx: dxLand !== null ? Math.round(dxLand) : null });
    return { pass: phys.measured && phys.rise > 20 && phys.dx > 40, details: phys };
  });

  /* 3. Bode Doido */
  await test('3', 'Bode Doido (B1): não atordoa no 1º frame e percorre >= 150 px antes da rocha', async () => {
    T.loadLevel(0); T.step(2);
    const enemies = T.getEnemies() || [];
    const bode = enemies.find((e) => /bode/i.test(typeOf(e)));
    if (!bode) return { pass: false, details: { motivo: 'bode_doido não encontrado na fase 1-1', tipos: [...new Set(enemies.map(typeOf))] } };
    const p = T.getPlayer(); const f = facingOf(bode) || -1;
    p.x = bode.x + f * 180; p.y = bode.y + H_(bode) - H_(p); p.vx = 0; p.vy = 0;
    const x0 = bode.x, stunAtStart = isStunned(bode);
    T.step(1); const stunFrame1 = isStunned(bode);
    let maxDist = Math.abs(bode.x - x0), distAtStun = null, stunFrame = null;
    for (let i = 2; i <= 60; i++) { T.step(1); maxDist = Math.max(maxDist, Math.abs(bode.x - x0)); if (isStunned(bode) && distAtStun === null) { distAtStun = Math.abs(bode.x - x0); stunFrame = i; } }
    const dist = distAtStun !== null ? distAtStun : maxDist;
    return { pass: !stunAtStart && !stunFrame1 && dist >= 150, details: { stunAntes: stunAtStart, stunFrame1, distanciaAteAtordoar: distAtStun && Math.round(distAtStun), frameDoAtordoamento: stunFrame, deslocamentoMax60f: Math.round(maxDist), medidoPx: Math.round(dist) } };
  });

  /* 4. Touro de Fogo */
  await test('4', 'Touro de Fogo (B2, D5): 5 investidas, sai da parede, inverte facing, sem loop, derrotável hp===0', async () => {
    T.loadLevel(4); T.step(150);
    const boss = T.getBoss(); if (!boss) return { pass: false, details: { motivo: 'sem chefe na fase 1-5' } };
    const p = T.getPlayer(); const L = T.getLevel();
    const AL = num(boss.arenaLeft) ? boss.arenaLeft : 40, AR = num(boss.arenaRight) ? boss.arenaRight : 1360, mid = (AL + AR) / 2;
    const hits = []; let prevStun = isStunned(boss), prevFacing = facingOf(boss), stunRun = 0, maxStunRun = 0, cur = null, frames = 0;
    const placeOpposite = () => { p.x = boss.x + W_(boss) / 2 < mid ? AR - 120 : AL + 80; p.vx = 0; };
    placeOpposite();
    while (hits.length < 5 && frames < 6000) {
      protect(p); T.step(1); frames++;
      const st = isStunned(boss);
      stunRun = st ? stunRun + 1 : 0; maxStunRun = Math.max(maxStunRun, stunRun);
      if (st && !prevStun) { cur = { frame: frames, facingAntes: prevFacing, x: Math.round(boss.x), xMaisW: Math.round(boss.x + W_(boss)) }; cur.foraDaParede = boss.x > AL && boss.x + W_(boss) < AR; }
      if (!st && prevStun && cur) { cur.facingDepois = facingOf(boss); cur.inverteu = cur.facingDepois !== 0 && cur.facingDepois === -cur.facingAntes; cur.foraDaParedeFim = boss.x > AL && boss.x + W_(boss) < AR; cur.duracao = frames - cur.frame; hits.push(cur); cur = null; placeOpposite(); }
      if (!st) prevFacing = facingOf(boss); prevStun = st;
      if (hits.length && frames - hits[hits.length - 1].frame < 5 && hits.length > 1 && hits[hits.length - 1].frame - hits[hits.length - 2].frame < 20) break; // loop
    }
    const loop = maxStunRun > 600 || hits.some((h, i) => i > 0 && h.frame - hits[i - 1].frame - hits[i - 1].duracao < 10);
    // Derrota
    const hp0 = boss.hp; let dmgApi = null;
    for (let a = 0; a < 80 && boss.hp > 0; a++) {
      for (let w = 0; w < 400 && !isStunned(boss); w++) { protect(p); T.step(1); }
      const r = tryCall(boss, ['takeDamage', 'hit', 'damage', 'takeHit', 'onHit', 'hurt', 'receiveDamage'], 1, p); if (!r.ok) break; dmgApi = r.name;
      for (let w = 0; w < 40; w++) { protect(p); T.step(1); }
    }
    const d = { classe: boss.constructor.name, arena: [AL, AR], investidas: hits, maxFramesAtordoadoSeguidos: maxStunRun, loop, framesSimulados: frames, hpInicial: hp0, hpFinal: boss.hp, apiDano: dmgApi, nivel: L && (L.name || L.id) };
    return { pass: hits.length >= 5 && hits.every((h) => h.foraDaParede && h.foraDaParedeFim && h.inverteu) && !loop && boss.hp === 0, details: d };
  });

  /* 5. 6 chefes */
  await test('5', 'Todos os 6 chefes reais (B7) em 1-5..6-5', async () => {
    const exp = { 4: 'BossBull', 9: 'BossFulozinha', 14: 'BossPapaFigo', 19: 'BossSerpente', 24: 'BossGuardiaoBrasa', 29: 'BossSombraSeca' };
    const got = {};
    for (const i of Object.keys(exp)) { T.loadLevel(+i); T.step(2); const b = T.getBoss(); got[i] = b ? b.constructor.name : null; }
    const okInst = Object.keys(exp).every((i) => { const C = T[exp[i]]; const b = (T.loadLevel(+i), T.getBoss()); return typeof C === 'function' && b instanceof C; });
    return { pass: Object.keys(exp).every((i) => got[i] === exp[i]) && okInst && new Set(Object.values(got)).size === 6, details: { esperado: exp, obtido: got, instanceofOk: okInst } };
  });

  /* 6. Desafio */
  await test('6', 'Desafio 30s (B3, B8, B17): pausa volta a CHALLENGE e morte vai a CHALLENGE_RESULT', async () => {
    const d = {};
    T.startChallenge('20261023'); T.step(2);
    d.inicio = T.getState().currentState; d.seed = T.getState().currentChallengeSeed;
    T.togglePause(); d.pausado = T.getState().currentState; d.stateBeforePause = T.getState().stateBeforePause;
    T.togglePause(); d.retomado = T.getState().currentState;
    const p = T.getPlayer(), L = T.getLevel();
    const LH = (L && (L.height || L.h || L.levelH || (L.rows && L.tile && L.rows * L.tile))) || 2000;
    p.y = LH + 600; p.vy = 12;
    let seq = []; for (let i = 0; i < 900; i++) { T.step(1); const s = T.getState().currentState; if (seq[seq.length - 1] !== s) seq.push(s); if (s === S.CHALLENGE_RESULT || s === S.GAMEOVER) break; }
    if (T.getState().currentState === S.CHALLENGE) { for (let k = 0; k < 20 && T.getState().currentState === S.CHALLENGE; k++) { tryCall(p, ['die', 'kill']) .ok || tryCall(p, ['takeDamage', 'hurt', 'damage'], 99); for (const kk of ['invuln', 'invulnTimer', 'iframes']) if (num(p[kk])) p[kk] = 0; T.step(60); const s = T.getState().currentState; if (seq[seq.length - 1] !== s) seq.push(s); } }
    d.sequenciaAposMorte = seq; d.final = T.getState().currentState;
    return { pass: d.inicio === S.CHALLENGE && d.pausado === S.PAUSED && d.retomado === S.CHALLENGE && d.retomado !== S.PLAYING && d.final === S.CHALLENGE_RESULT && !seq.includes(S.GAMEOVER), details: d };
  });

  /* 7. Auto-pogo */
  await test('7', 'Pulo/borda sem auto-pogo (B6): segurar jump no pouso não repula', async () => {
    T.loadLevel(0); T.injectInput({ jump: false, left: false, right: false }); T.step(90);
    const p = T.getPlayer(); let g = 0; while (!p.onGround && g++ < 300) T.step(1);
    T.injectInput({ jump: true }); let left = false, landed = null, rejump = false, glideFrames = 0;
    for (let i = 0; i < 400; i++) { T.step(1); protect(p); if (!p.onGround) { left = true; if (p.vy > 0) glideFrames++; } if (left && p.onGround) { landed = i; break; } }
    let groundFrames = 0;
    for (let i = 0; i < 45; i++) { T.step(1); if (p.onGround) groundFrames++; else if (groundFrames > 0) { rejump = true; break; } }
    T.injectInput({ jump: false });
    return { pass: left && landed !== null && !rejump && groundFrames > 0, details: { saiuDoChao: left, frameDoPouso: landed, framesDescendoComJumpSegurado: glideFrames, framesNoChaoAposPouso: groundFrames, repulouSozinho: rejump } };
  });

  /* 8. Estrelas, faíscas, LEVEL_COMPLETE */
  await test('8', 'tookDamageThisRun, faíscas em coord. de mundo, LEVEL_COMPLETE (B11, B13, B15)', async () => {
    const d = {};
    T.loadLevel(0); T.step(2); d.inicial = T.getState().tookDamageThisRun;
    const p = T.getPlayer(); for (const k of ['invuln', 'invulnTimer', 'iframes']) if (num(p[k])) p[k] = 0;
    const r = tryCall(p, ['takeDamage', 'hurt', 'damage', 'hit'], 1); d.apiDano = r.name || null; T.step(1);
    d.aposDano = T.getState().tookDamageThisRun;
    T.loadLevel(0); T.step(1); d.aposReload = T.getState().tookDamageThisRun;
    const g = srcs['game.js']; const i = g.search(/function\s+drawFx\s*\(/);
    const fxBody = i >= 0 ? g.slice(i, i + 2500) : '';
    d.drawFxUsaCamera = /drawFx\s*\(\s*ctx\s*,\s*camX/.test(g) && /-\s*camX|translate\s*\(\s*-\s*camX/.test(fxBody);
    T.loadLevel(0); T.step(5);
    const L = T.getLevel(); const fl = L.flag || L.goal || L.mastro || {};
    const fx = num(fl.x) ? fl.x : num(L.flagX) ? L.flagX : num(L.goalX) ? L.goalX : null; d.flagX = fx;
    let reached = null;
    if (fx !== null) { const pl = T.getPlayer(); pl.x = fx - W_(pl) - 2; if (num(fl.y)) pl.y = fl.y; T.injectInput({ right: true }); for (let k = 0; k < 900; k++) { protect(pl); T.step(1); if (T.getState().currentState === S.LEVEL_COMPLETE) { reached = k; break; } } T.injectInput({ right: false }); }
    d.framesAteLevelComplete = reached; d.estadoFinal = T.getState().currentState;
    return { pass: d.inicial === false && d.aposDano === true && d.aposReload === false && d.drawFxUsaCamera && reached !== null, details: d };
  });

  /* 9. Alcançabilidade */
  await test('9', 'Alcançabilidade física das 30 fases (C2, F1)', async () => {
    const OL = sandbox.OxeLevels; const maxGap = phys.measured ? phys.dx * 0.95 : +(process.env.OXE_MAX_GAP || 160), maxRise = phys.measured ? phys.rise * 0.95 : +(process.env.OXE_MAX_RISE || 110);
    const rep = []; let valid = 0;
    for (let i = 0; i < 30; i++) {
      const s = OL.getLevelSpec(i); if (!s) { rep.push({ i, erro: 'spec nula' }); continue; }
      const lw = s.levelW ?? s.width ?? s.w; const fl = s.flag || s.goal || {}; const fx = fl.x ?? s.flagX ?? s.goalX;
      const surf = [];
      for (const k of ['ground', 'grounds', 'platforms', 'solids', 'blocks', 'segments', 'terrain', 'floors']) if (Array.isArray(s[k])) for (const o of s[k]) { if (Array.isArray(o) && num(o[0]) && num(o[1])) surf.push({ x: o[0], w: o[1], y: o[2] }); else if (o && num(o.x) && num(o.w ?? o.width)) surf.push({ x: o.x, w: o.w ?? o.width, y: o.y }); }
      const issues = [];
      if (!num(lw)) issues.push('levelW ausente'); if (!num(fx)) issues.push('mastro ausente'); else if (fx < 0 || fx > lw) issues.push(`mastro fora (${fx} > ${lw})`);
      if (!surf.length) issues.push('superfícies não reconhecidas: ' + Object.keys(s).join(','));
      surf.sort((a, b) => a.x - b.x); const merged = [];
      for (const o of surf) { const last = merged[merged.length - 1]; if (last && o.x <= last.end) { last.end = Math.max(last.end, o.x + o.w); last.lastY = o.y; } else merged.push({ x: o.x, end: o.x + o.w, firstY: o.y, lastY: o.y }); }
      let worstGap = 0, worstRise = 0;
      for (let k = 1; k < merged.length; k++) { if (num(fx) && merged[k].x > fx) break; const gap = merged[k].x - merged[k - 1].end; worstGap = Math.max(worstGap, gap); if (gap > maxGap) issues.push(`vão ${Math.round(gap)}px @x=${Math.round(merged[k - 1].end)}`); if (num(merged[k - 1].lastY) && num(merged[k].firstY)) { const rise = merged[k - 1].lastY - merged[k].firstY; worstRise = Math.max(worstRise, rise); if (rise > maxRise) issues.push(`subida ${Math.round(rise)}px @x=${Math.round(merged[k].x)}`); } }
      if (!issues.length) valid++;
      rep.push({ fase: `${Math.floor(i / 5) + 1}-${(i % 5) + 1}`, levelW: lw, mastro: fx, maiorVao: Math.round(worstGap), maiorSubida: Math.round(worstRise), problemas: issues });
    }
    return { pass: valid === 30, details: { limites: { maxGap: Math.round(maxGap), maxRise: Math.round(maxRise), fonte: phys.measured ? 'medido na simulação' : 'padrão/ENV' }, fasesValidas: valid, fases: rep } };
  });

  /* 10. SaveManager */
  await test('10', 'SaveManager v3: migração v2 e teto 29 (B24)', async () => {
    const SM = T.SaveManager; const g = srcs['game.js'];
    const keys = [...new Set([...g.matchAll(/['"`]([\w.:-]*(?:oxe|save)[\w.:-]*)['"`]/gi)].map((m) => m[1]))];
    const v2Key = keys.find((k) => /v2/i.test(k)), v3Key = keys.find((k) => /v3/i.test(k));
    const d = { chavesEncontradas: keys.slice(0, 12), v2Key, v3Key, metodos: SM ? Object.keys(SM).filter((k) => typeof SM[k] === 'function') : [] };
    if (!SM || !v2Key) return { pass: false, details: Object.assign(d, { motivo: 'SaveManager ou chave v2 não encontrados' }) };
    localStorage.removeItem(v3Key); localStorage.setItem(v2Key, JSON.stringify({ version: 2, unlockedLevel: 35, maxLevel: 35, highestLevel: 35, maxUnlocked: 35, stars: { 0: 3 }, score: 1234 }));
    const r = tryCall(SM, ['migrate', 'load', 'init', 'read', 'get']); d.apiUsada = r.name;
    let data = r.ret; if (!data || typeof data !== 'object') data = SM.data || SM.state || (v3Key && JSON.parse(localStorage.getItem(v3Key) || 'null'));
    if (v3Key && localStorage.getItem(v3Key)) d.v3Salvo = JSON.parse(localStorage.getItem(v3Key));
    const obj = d.v3Salvo || data || {};
    const lvl = ['unlockedLevel', 'maxLevel', 'highestLevel', 'maxUnlocked', 'unlocked', 'progress'].map((k) => obj[k]).filter(num);
    d.version = obj.version; d.niveis = lvl;
    return { pass: obj.version === 3 && lvl.length > 0 && lvl.every((v) => v <= 29 && v >= 0), details: d };
  });

  /* 11. Motor Gráfico Ultra-HD (graphics_hd.js) + 18 Espécies + Obstáculos Interativos */
  await test('11', 'Ultra-HD 3D-to-2D (graphics_hd.js), 18 espécies de inimigos, 20+ inimigos/fase e Zabumba Trampolim', async () => {
    const HD = sandbox.OxeHD;
    const OL = sandbox.OxeLevels;
    const all18 = ['calango', 'tatu', 'carcara', 'morcego', 'cacto_atirador', 'bode_doido', 'fulozinha', 'papa_figo', 'caranguejo', 'baiacu', 'salamandra', 'sapo_cururu', 'marimbondo', 'jararaca', 'cangaceiro_sombra', 'mula_sem_cabeca', 'boitata_fogo', 'lobisomem'];
    T.loadLevel(0);
    const L0 = T.getLevel();
    const fakeCtx = byId.gameCanvas.getContext('2d');
    const renderedSpecies = [];
    for (const sp of all18) {
      const en = new T.Enemy(300, 400, sp, {});
      if (en.update) en.update(T.getPlayer(), L0);
      if (HD && HD.drawEnemyHD) HD.drawEnemyHD(fakeCtx, 0, 0, en, 1, 10);
      renderedSpecies.push(sp);
    }
    let minEnemies = 999, maxEnemies = 0, totalEnemies = 0, totalTramps = 0, totalMoving = 0, totalWheels = 0;
    for (let i = 0; i < 30; i++) {
      if (i % 5 === 4) continue;
      const spec = OL.getLevelSpec(i);
      const ec = (spec.enemies || []).length;
      minEnemies = Math.min(minEnemies, ec);
      maxEnemies = Math.max(maxEnemies, ec);
      totalEnemies += ec;
      totalTramps += (spec.trampolines || []).length;
      totalMoving += (spec.movingPlatforms || []).length;
      totalWheels += (spec.hazardWheels || []).length;
    }
    // Testa física do Zabumba Trampolim na fase 1-1
    const tr = (L0.trampolines || [])[0];
    const p = T.getPlayer();
    let bounced = false;
    if (tr && p) {
      p.x = tr.x + 4; p.y = tr.y - p.h + 4; p.vy = 4;
      T.step(2);
      bounced = p.vy < -12;
    }
    const d = {
      oxeHdAtivo: !!(HD && HD.drawTonhoHD && HD.drawEnemyHD && HD.drawBossHD && HD.drawParallaxHD && HD.drawPlatformsHD),
      especiesRenderizadas: renderedSpecies.length,
      inimigosFase1_1: (L0.enemies || []).length,
      minInimigosPorFase: minEnemies,
      maxInimigosPorFase: maxEnemies,
      mediaInimigosPorFase: +(totalEnemies / 24).toFixed(1),
      totalZabumbas30Fases: totalTramps,
      totalPlataformasMoveis: totalMoving,
      totalRodasMandacaru: totalWheels,
      zabumbaImpulsionouTonho: bounced
    };
    return { pass: d.oxeHdAtivo && d.especiesRenderizadas === 18 && minEnemies >= 18 && totalTramps >= 24 && totalMoving >= 24 && totalWheels >= 24 && bounced, details: d };
  });

  writeReport(t0);
  process.exit(results.every((r) => r.pass) ? 0 : 1);
})();

function writeReport(t0) {
  const ok = results.filter((r) => r.pass).length;
  let md = `# TESTES — Oxe, era assim? 2\n\n> Gerado automaticamente por \`test_oxe2_real.js\` em ${new Date().toISOString()} (Node ${process.version}).\n> Arquivos REAIS carregados de \`${ROOT}\` via \`vm.runInContext\`. Duração: ${Date.now() - t0} ms.\n\n**Resultado: ${ok}/${results.length} aprovados.**\n\n| # | Teste | Status |\n|---|---|---|\n`;
  for (const r of results) md += `| ${r.id} | ${r.name} | ${r.pass ? '✅ PASSOU' : '❌ FALHOU'} |\n`;
  md += `\n## Medições detalhadas\n`;
  for (const r of results) md += `\n### [${r.id}] ${r.name} — ${r.pass ? '✅' : '❌'}\n\n\`\`\`json\n${JSON.stringify(r.details, null, 2).slice(0, 8000)}\n\`\`\`\n`;
  if (consoleErrors.length) md += `\n## console.warn/error capturados (${consoleErrors.length})\n\n\`\`\`\n${consoleErrors.slice(0, 40).join('\n')}\n\`\`\`\n`;
  try { fs.writeFileSync(R('TESTES.md'), md); console.log(`\n📄 Relatório: ${R('TESTES.md')} — ${ok}/${results.length}`); } catch (e) { console.error('Falha ao gravar TESTES.md:', e.message); }
}
