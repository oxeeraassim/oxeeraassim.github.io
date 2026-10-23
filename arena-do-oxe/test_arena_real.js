#!/usr/bin/env node
// Testes reais da Arena do Oxe: sintaxe + sandbox vm + melhorias M1..M10
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

const HTML = '/Users/joaobatistaramalhodelima/Documents/GitHub/oxeeraassim.github.io/arena-do-oxe/index.html';
const OUT = path.join(path.dirname(HTML), 'TESTES_ARENA.md');
const html = fs.readFileSync(HTML, 'utf8');

// ---------- 1. Extrai scripts inline e valida sintaxe ----------
const scripts = [];
html.replace(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi, (_, code) => {
  if (code.trim()) scripts.push(code);
});
const results = [];
const add = (grp, name, ok, info) => results.push({ grp, name, ok: !!ok, info: info || '' });
scripts.forEach((code, i) => {
  try { new vm.Script(code, { filename: 'inline_' + i + '.js' }); add('SINTAXE', 'script inline #' + i, true); }
  catch (e) { add('SINTAXE', 'script inline #' + i, false, e.message); }
});

// ---------- 2. DOM falso leve ----------
const noop = () => {};
const ctx2d = new Proxy({}, {
  get: (t, k) => k in t ? t[k] : (k === 'measureText' ? () => ({ width: 10 }) :
    k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: noop }) : noop),
  set: (t, k, v) => (t[k] = v, true)
});
function makeEl(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(), style: {}, dataset: {}, children: [], childNodes: [],
    innerHTML: '', textContent: '', value: '', className: '', id: '', disabled: false, hidden: false,
    width: 300, height: 150, offsetWidth: 300, offsetHeight: 150, parentNode: null,
    classList: { _s: new Set(), add(...c) { c.forEach(x => this._s.add(x)); }, remove(...c) { c.forEach(x => this._s.delete(x)); },
      toggle(c, f) { const on = f === undefined ? !this._s.has(c) : f; on ? this._s.add(c) : this._s.delete(c); return on; },
      contains(c) { return this._s.has(c); } },
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    insertBefore(c) { return this.appendChild(c); }, prepend(c) { this.appendChild(c); }, append(...c) { c.forEach(x => this.appendChild(x)); },
    removeChild(c) { this.children = this.children.filter(x => x !== c); return c; }, remove: noop,
    setAttribute(k, v) { this[k] = v; }, getAttribute(k) { return this[k] ?? null; }, removeAttribute: noop,
    addEventListener: noop, removeEventListener: noop, dispatchEvent: noop, focus: noop, blur: noop, click: noop,
    querySelector: () => makeEl('div'), querySelectorAll: () => [], closest: () => null, contains: () => false,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 150, right: 300, bottom: 150 }),
    getContext: () => ctx2d, toDataURL: () => 'data:image/png;base64,AA', toBlob: cb => cb && cb({ size: 1 }),
    scrollIntoView: noop, animate: () => ({ onfinish: null })
  };
  return el;
}
const byId = {};
const document = {
  readyState: 'complete', body: makeEl('body'), head: makeEl('head'), documentElement: makeEl('html'),
  getElementById: id => byId[id] || (byId[id] = Object.assign(makeEl('div'), { id })),
  querySelector: () => makeEl('div'), querySelectorAll: () => [], createElement: makeEl,
  createTextNode: t => ({ textContent: t }), addEventListener: noop, removeEventListener: noop,
  execCommand: () => true, hidden: false, visibilityState: 'visible', cookie: ''
};
const store = {};
const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }, clear: () => Object.keys(store).forEach(k => delete store[k]) };
const shared = [];
const navigator = { userAgent: 'node', language: 'pt-BR', vibrate: noop,
  clipboard: { writeText: t => { shared.push(t); return Promise.resolve(); } },
  share: d => { shared.push(d); return Promise.resolve(); }, canShare: () => true };
const location = { href: 'https://oxeeraassim.github.io/arena-do-oxe/', origin: 'https://oxeeraassim.github.io',
  pathname: '/arena-do-oxe/', search: '', hash: '', host: 'oxeeraassim.github.io', reload: noop, replace: noop };

const W = {
  document, localStorage, sessionStorage: localStorage, navigator, location, console, Math, Date, JSON, Promise,
  setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
  requestAnimationFrame: () => 0, cancelAnimationFrame: noop, alert: noop, confirm: () => true, prompt: () => '',
  open: noop, scrollTo: noop, addEventListener: noop, removeEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop }),
  innerWidth: 400, innerHeight: 800, devicePixelRatio: 1, history: { replaceState: noop, pushState: noop },
  URL, URLSearchParams, Image: function () { return makeEl('img'); }, Audio: function () { return { play: () => Promise.resolve(), pause: noop }; },
  CanvasRenderingContext2D: function () {},
  AudioContext: undefined, fetch: () => Promise.reject(new Error('offline')), screen: { width: 400, height: 800 },
  performance: { now: () => Date.now() }, btoa: s => Buffer.from(s, 'binary').toString('base64'),
  atob: s => Buffer.from(s, 'base64').toString('binary'), encodeURIComponent, decodeURIComponent
};
W.window = W; W.self = W; W.globalThis = W; W.top = W; W.parent = W;
vm.createContext(W);
scripts.forEach((code, i) => {
  try { vm.runInContext(code, W, { filename: 'inline_' + i + '.js', timeout: 5000 }); add('EXEC', 'executa script #' + i, true); }
  catch (e) { add('EXEC', 'executa script #' + i, false, e.message); }
});

// ---------- 3. Testes M1..M10 ----------
const T = W.__ARENA_TEST__;
add('API', 'window.__ARENA_TEST__ exposto', !!T);
const t = (grp, name, fn) => {
  try { const r = fn(); add(grp, name, r !== false, r === false ? 'retornou false' : ''); }
  catch (e) { add(grp, name, false, e.message); }
};
if (T) {
  const S = T.S, day = 864e5;
  T.reset();
  t('M1 Streak', 'ymd formata AAAA-MM-DD', () => /^\d{4}-\d{2}-\d{2}$/.test(T.ymd(new Date())));
  t('M1 Streak', 'dayDiff entre dias consecutivos = 1', () => Math.abs(T.dayDiff(T.ymd(new Date(Date.now() - day)), T.ymd(new Date()))) === 1);
  t('M1 Streak', 'primeiro dia inicia streak >= 1', () => { T.updateStreak(); return S.streak >= 1; });
  t('M1 Streak', 'dia seguido incrementa', () => { S.streak = 3; S.lastStreakDate = T.ymd(new Date(Date.now() - day)); T.updateStreak(); return S.streak === 4; });
  t('M1 Streak', 'mesmo dia não duplica', () => { const s = S.streak; T.updateStreak(); return S.streak === s; });
  t('M1 Streak', 'abre modal de streak', () => { T.openStreakModal(); });
  t('M2 Bônus', 'bônus pendente após reset', () => { T.reset(); T.updateStreak(); return T.bonusPending() === true; });
  t('M2 Bônus', 'valor do bônus > 0', () => T.dailyBonusValue() > 0);
  t('M2 Bônus', 'resgate zera pendência', () => { T.claimDailyBonus(); return T.bonusPending() === false && S.lastBonusDate === T.ymd(new Date()); });
  t('M3 Medalhas', 'catálogo de medalhas', () => Array.isArray(T.MEDALHAS) ? T.MEDALHAS.length > 0 : Object.keys(T.MEDALHAS).length > 0);
  t('M3 Medalhas', 'checkMedals mantém lista', () => { T.checkMedals(); return Array.isArray(S.medals); });
  t('M3 Medalhas', 'abre painel de medalhas', () => { T.openMedals(); });
  const items = Array.isArray(T.BODEGA_ITEMS) ? T.BODEGA_ITEMS : Object.values(T.BODEGA_ITEMS || {});
  t('M4 Bodega', 'itens da bodega', () => items.length > 0);
  t('M4 Bodega', 'abre bodega', () => { T.openBodega(); });
  t('M4 Bodega', 'compra item sem erro', () => {
    ['coins', 'moedas', 'oxes', 'xp', 'pontos'].forEach(k => { if (typeof S[k] === 'number') S[k] = 99999; });
    const it = items[0]; T.buyBodegaItem(it && it.id !== undefined ? it.id : 0);
  });
  let link = '';
  t('M5 Compartilhar', 'shareResult sem erro', () => { T.shareResult(); });
  t('M5 Compartilhar', 'buildShareLink gera URL', () => { link = T.buildShareLink(); return typeof link === 'string' && link.length > 0; });
  t('M6 Revanche', 'checkUrlChallenge lê desafio', () => {
    location.search = link.includes('?') ? link.slice(link.indexOf('?')) : ''; location.href = link || location.href;
    T.checkUrlChallenge();
  });
  t('M6 Revanche', 'acceptRevanche sem erro', () => { T.getPendingRevanche(); T.acceptRevanche(); });
  t('M7 Passa Celular', 'inicia modo passa-celular', () => { T.startPassaCelular(); });
  t('M7 Passa Celular', 'encerra modo passa-celular', () => { T.endPassa(); });
  t('M8 Oxedle', 'msToMidnight no intervalo do dia', () => { const m = T.msToMidnight(); return m > 0 && m <= day; });
  t('M8 Oxedle', 'fmtHMS formata horas', () => /\d{1,2}\D\d{2}\D\d{2}/.test(String(T.fmtHMS(3661000))));
  t('M8 Oxedle', 'grade e botão do Oxedle', () => { T.updateOxedleBtn(); T.shareOxedleGrid(); });
  t('M9 Álbum', 'drawAlbum sem erro', () => { T.drawAlbum(); });
  t('M9 Álbum', 'albFiltered retorna lista', () => { const r = T.albFiltered(); return Array.isArray(r) || (r && typeof r.length === 'number'); });
  t('M9 Álbum', 'renderAlbGrid + shareFig', () => {
    T.renderAlbGrid();
    const f = (T.albFiltered() || [])[0]; T.shareFig(f && f.id !== undefined ? f.id : f);
  });
  t('M10 Extras', 'refreshExtras e chip de streak', () => { T.refreshExtras(); T.injectStreakChip(); });
  t('M10 Extras', 'banco de perguntas Q', () => (Array.isArray(T.Q) ? T.Q : Object.values(T.Q || {})).length > 0);
  t('M10 Extras', 'answer + endBattle sem erro', () => { T.answer(0); T.endBattle(); });
}

// ---------- 4. Relatório ----------
const pass = results.filter(r => r.ok).length, total = results.length, pct = total ? (100 * pass / total).toFixed(1) : '0';
const md = ['# Testes Arena do Oxe', '', `Gerado em ${new Date().toISOString()}`, '',
  `**Resultado: ${pass}/${total} (${pct}%)**`, '', '| Grupo | Teste | Status | Detalhe |', '|---|---|---|---|',
  ...results.map(r => `| ${r.grp} | ${r.name} | ${r.ok ? '✅' : '❌'} | ${String(r.info).replace(/\|/g, '\\|')} |`)].join('\n');
fs.writeFileSync(OUT, md + '\n');
results.forEach(r => console.log(`${r.ok ? '✔' : '✘'} [${r.grp}] ${r.name}${r.info ? ' — ' + r.info : ''}`));
console.log(`\n${pass}/${total} (${pct}%) — relatório em ${OUT}`);
process.exit(pass === total && total > 0 ? 0 : 1);
