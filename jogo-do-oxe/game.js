(() => { 'use strict';

// ==================== CONFIG & UTILS ====================
const CANVAS_W = 960; const CANVAS_H = 540; const FIXED_DELTA = 1000 / 60; const GRAVITY = 0.52; const MAX_FALL_SPEED = 12.0;
const canvas = document.getElementById('gameCanvas'); const ctx = canvas.getContext('2d');

if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.max(0, Math.min(typeof r === 'number' ? r : (Array.isArray(r) ? r[0] : 0), w / 2, h / 2));
    this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath(); return this;
  };
}

// v2.2: em celular deitado (tela larga) a área de jogo se alarga em vez de deixar faixas pretas
let VIEW_W = CANVAS_W;
function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, window.OXE_LOW_QUALITY ? 1.25 : 2);
  const iw = window.innerWidth || CANVAS_W, ih = window.innerHeight || CANVAS_H;
  VIEW_W = Math.round(Math.max(CANVAS_W, Math.min(1280, CANVAS_H * (iw / ih))));
  canvas.width = Math.round(VIEW_W * dpr); canvas.height = Math.round(CANVAS_H * dpr);
  if (canvas.dataset) canvas.dataset.dpr = String(dpr);
  const s = Math.min(iw / VIEW_W, ih / CANVAS_H);
  canvas.style.width = Math.floor(VIEW_W * s) + 'px'; canvas.style.height = Math.floor(CANVAS_H * s) + 'px';
  if (ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
}
window.addEventListener('resize', resizeCanvas); window.addEventListener('orientationchange', resizeCanvas); resizeCanvas();

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function checkAABB(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const SFX_ALIAS = { thud: "bonk", clank: "metal", bosshit: "bossRoar", bossdefeat: "checkpoint", charge: "bossRoar", teleport: "whistle", select: "coin", powerup: "checkpoint", hurt: "hit", win: "checkpoint", fire: "spine" };
function sfx(name) { const k = SFX_ALIAS[name] || name; try { if (typeof AudioEngine !== "undefined" && AudioEngine.playSFX) AudioEngine.playSFX(k); } catch (e) {} }
function callHook(name, ...args) { try { const fn = eval(name); if (typeof fn === 'function') return fn(...args); } catch (e) { /* hook ausente */ } }
function getPlatforms() { return (currentLevel && currentLevel.platforms) ? currentLevel.platforms : []; }

// ==================== SAVE MANAGER v3 ====================
const SaveManager = {
  KEY: 'oxe_save_v3', LEGACY_KEY: 'oxe_save_v2', TOTAL_LEVELS: 30,
  data: { version: 3, unlockedLevels: 0, levelData: {}, challengeHighScore: 0, dailyScores: {}, soundEnabled: true,
    settings: { touchSize: 'md', touchOpacity: 85, leftHanded: false, vibration: true, assistMode: false, reduceShake: false } },
  defaults() { return JSON.parse(JSON.stringify(this.data)); },
  init() {
    const base = this.defaults();
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) { this.data = this.merge(base, JSON.parse(raw)); }
      else {
        const legacy = localStorage.getItem(this.LEGACY_KEY);
        if (legacy) { this.data = this.migrateV2(base, JSON.parse(legacy)); this.save(); }
        else this.data = base;
      }
    } catch (e) { this.data = base; }
    this.data.unlockedLevels = clamp(this.data.unlockedLevels | 0, 0, this.TOTAL_LEVELS - 1);
    this.data.unlockedLevel = this.data.unlockedLevels;
  },
  merge(base, src) {
    const out = Object.assign(base, src || {});
    out.settings = Object.assign(this.defaults().settings, (src && src.settings) || {});
    out.levelData = out.levelData || {}; out.dailyScores = out.dailyScores || {}; out.version = 3; return out;
  },
  migrateV2(base, old) {
    const out = this.merge(base, {});
    const rawLvl = old.unlockedLevels ?? old.unlockedLevel ?? old.maxLevel ?? old.highestLevel ?? old.maxUnlocked ?? 0;
    out.unlockedLevels = clamp((rawLvl | 0), 0, this.TOTAL_LEVELS - 1);
    out.unlockedLevel = out.unlockedLevels;
    const ld = old.levelData || {};
    Object.keys(ld).forEach(k => { const d = ld[k] || {}; out.levelData[k] = { stars: d.stars | 0, cajus: Array.isArray(d.cajus) ? d.cajus.slice(0, 3) : [false, false, false], bestTime: d.bestTime || null, cleared: d.cleared !== undefined ? !!d.cleared : (d.stars | 0) > 0 }; });
    out.challengeHighScore = old.challengeHighScore | 0; out.dailyScores = old.dailyScores || {};
    out.soundEnabled = old.soundEnabled !== undefined ? !!old.soundEnabled : true;
    if (old.settings) out.settings = Object.assign(out.settings, old.settings);
    return out;
  },
  save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) {} },
  unlockNext(levelIdx) { const n = Math.min(this.TOTAL_LEVELS - 1, levelIdx + 1); if (n > this.data.unlockedLevels) this.data.unlockedLevels = n; this.save(); },
  recordClear(idx, stars, cajus, timeSec) {
    const prev = this.data.levelData[idx] || { stars: 0, cajus: [false, false, false], bestTime: null, cleared: false };
    prev.stars = Math.max(prev.stars | 0, stars | 0); prev.cleared = true;
    prev.cajus = [0, 1, 2].map(i => !!(prev.cajus[i] || (cajus && cajus[i])));
    if (prev.bestTime === null || timeSec < prev.bestTime) prev.bestTime = timeSec;
    this.data.levelData[idx] = prev; this.unlockNext(idx); this.save();
  }
};
SaveManager.init();

// ==================== ESTADO GLOBAL ====================
const GAME_STATE = { TITLE: 0, MAP: 1, PLAYING: 2, PAUSED: 3, VICTORY: 4, GAMEOVER: 5, GAME_OVER: 5, CHALLENGE: 6, CHALLENGE_RESULT: 7, LEVEL_COMPLETE: 8 };
let currentState = GAME_STATE.TITLE; let stateBeforePause = GAME_STATE.PLAYING;
let currentLevelIdx = 0; let currentWorldTab = 0; let score = 0; let rapaduras = 0; let lives = 3; let health = 3; let maxHealth = 3;
let tookDamageThisRun = false;
let collectedCajus = [false, false, false]; let stageTimerSeconds = 0; let stageTimerFrames = 0;
let hitstopFrames = 0; let screenShake = 0; let bossIntroTimer = 0; let renderAlpha = 1;
let challengeTimeLeft = 30.0; let challengeScore = 0; let challengeRapaduras = 0; let currentChallengeSeed = '';
let currentLevel = null; let player = null;

function liveSettings() { try { if (window.OxeSettings && window.OxeSettings.get) return window.OxeSettings.get(); } catch (e) {} return SaveManager.data.settings || {}; }
function triggerHaptic(ms = 20) { if (liveSettings().vibration !== false && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} } }
// v2.2: tremor curto e com decaimento (antes nunca zerava e a tela tremia para sempre)
function addScreenShake(amount) { const a = Math.min(9, liveSettings().reduceShake ? amount * 0.25 : amount * 0.6); screenShake = Math.max(screenShake, a); }

// ==================== INPUT ====================
const keys = { left: false, right: false, up: false, down: false, jump: false, jumpJustPressed: false, whip: false, whipJustPressed: false, glide: false };
function setJump(down) {
  if (down && !keys.jump) keys.jumpJustPressed = true;
  keys.jump = down; keys.glide = down;
}
function setWhip(down) { if (down && !keys.whip) keys.whipJustPressed = true; keys.whip = down; }
function consumeEdgeInputs() { keys.jumpJustPressed = false; keys.whipJustPressed = false; }

const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', Space: 'jump', KeyZ: 'jump', KeyK: 'jump', KeyX: 'whip', KeyJ: 'whip' };
window.addEventListener('keydown', e => {
  const k = KEYMAP[e.code]; if (!k) return; e.preventDefault();
  if (k === 'jump') { if (!e.repeat) setJump(true); }
  else if (k === 'whip') { if (!e.repeat) setWhip(true); }
  else keys[k] = true;
  if (k === 'up' && !e.repeat && !keys.jump) { /* cima também serve como pulo em teclado */ }
});
window.addEventListener('keyup', e => {
  const k = KEYMAP[e.code]; if (!k) return; e.preventDefault();
  if (k === 'jump') setJump(false); else if (k === 'whip') setWhip(false); else keys[k] = false;
});
window.addEventListener('blur', () => { keys.left = keys.right = keys.up = keys.down = false; setJump(false); setWhip(false); });

const TouchController = {
  dpadPointer: null,
  init() {
    const zone = document.getElementById('dpadZone') || (document.getElementById('dpadLeft') && document.getElementById('dpadLeft').parentElement);
    if (zone) {
      zone.style.touchAction = 'none';
      zone.addEventListener('pointerdown', e => { e.preventDefault(); this.dpadPointer = e.pointerId; try { zone.setPointerCapture(e.pointerId); } catch (_) {} this.updateDpad(e); });
      zone.addEventListener('pointermove', e => { if (e.pointerId === this.dpadPointer) { e.preventDefault(); this.updateDpad(e); } });
      const end = e => { if (e.pointerId !== this.dpadPointer) return; this.dpadPointer = null; keys.left = keys.right = keys.down = false; this.highlight(); };
      zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end); zone.addEventListener('lostpointercapture', end);
    }
    this.bindButton('btnJump', setJump); this.bindButton('btnWhip', setWhip);
  },
  rectOf(id) { const el = document.getElementById(id); return el ? el.getBoundingClientRect() : null; },
  updateDpad(e) {
    const L = this.rectOf('dpadLeft'), R = this.rectOf('dpadRight'), D = this.rectOf('dpadDown');
    const x = e.clientX, y = e.clientY;
    let left = false, right = false, down = false;
    if (L && R) {
      const midX = (L.right + R.left) / 2;
      const downTop = D ? D.top : Infinity;
      if (D && y >= downTop - 6 && x > L.right - 10 && x < R.left + 10) down = true;
      else if (x < midX) left = true; else right = true;
      if (D && y >= downTop + D.height * 0.3) down = true;
    }
    keys.left = left; keys.right = right; keys.down = down; this.highlight();
  },
  highlight() {
    [['dpadLeft', keys.left], ['dpadRight', keys.right], ['dpadDown', keys.down]].forEach(([id, on]) => { const el = document.getElementById(id); if (el) el.classList.toggle('active', on); });
  },
  bindButton(id, setter) {
    const el = document.getElementById(id); if (!el) return; let pid = null; el.style.touchAction = 'none';
    el.addEventListener('pointerdown', e => { e.preventDefault(); if (pid !== null) return; pid = e.pointerId; try { el.setPointerCapture(pid); } catch (_) {} setter(true); el.classList.add('active'); triggerHaptic(10); });
    const end = e => { if (e.pointerId !== pid) return; pid = null; setter(false); el.classList.remove('active'); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('lostpointercapture', end);
  }
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => TouchController.init()); else TouchController.init();

function applySettingsToDOM() {
  const s = SaveManager.data.settings; const tc = document.getElementById('touchControls');
  if (tc) {
    tc.classList.remove('size-sm', 'size-md', 'size-lg'); tc.classList.add('size-' + (s.touchSize || 'md'));
    tc.style.opacity = clamp(s.touchOpacity, 20, 100) / 100; tc.classList.toggle('left-handed', !!s.leftHanded);
  }
  maxHealth = s.assistMode ? 5 : 3; if (health > maxHealth) health = maxHealth;
}

// ==================== PARTÍCULAS & TEXTOS ====================
const particles = [];
class Particle {
  constructor(x, y, vx, vy, color, life, size, grav = 0.15) { this.x = x; this.y = y; this.prevX = x; this.prevY = y; this.vx = vx; this.vy = vy; this.color = color; this.life = life; this.maxLife = life; this.size = size; this.grav = grav; }
  update() { this.prevX = this.x; this.prevY = this.y; this.x += this.vx; this.y += this.vy; this.vy += this.grav; this.vx *= 0.97; this.life--; }
  draw(ctx, camX, camY) {
    const x = lerp(this.prevX, this.x, renderAlpha) - camX, y = lerp(this.prevY, this.y, renderAlpha) - camY;
    ctx.globalAlpha = clamp(this.life / this.maxLife, 0, 1); ctx.fillStyle = this.color; ctx.fillRect(x - this.size / 2, y - this.size / 2, this.size, this.size); ctx.globalAlpha = 1;
  }
}
function spawnSparks(x, y, n = 8, color = '#FFD43B') { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * 3.5; particles.push(new Particle(x, y, Math.cos(a) * s, Math.sin(a) * s - 1, color, 18 + Math.random() * 14, 2 + Math.random() * 3, 0.12)); } }
function spawnDust(x, y, n = 6, color = '#C9A27A') { for (let i = 0; i < n; i++) particles.push(new Particle(x + (Math.random() - 0.5) * 16, y, (Math.random() - 0.5) * 2.4, -Math.random() * 1.6, color, 20 + Math.random() * 10, 3 + Math.random() * 3, 0.05)); }
function spawnLeaves(x, y, n = 6) { for (let i = 0; i < n; i++) particles.push(new Particle(x, y, (Math.random() - 0.5) * 3, -Math.random() * 3, Math.random() < 0.5 ? '#51CF66' : '#2F9E44', 40 + Math.random() * 20, 4, 0.06)); }

const floatTexts = [];
function spawnFloatingText(text, x, y, color = '#FFF') { floatTexts.push({ text, x, y, color, life: 50, maxLife: 50,
  update() { this.y -= 0.8; this.life--; },
  draw(ctx, camX, camY) { ctx.globalAlpha = clamp(this.life / 25, 0, 1); ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#1A1A1A'; ctx.strokeText(this.text, this.x - camX, this.y - camY); ctx.fillStyle = this.color; ctx.fillText(this.text, this.x - camX, this.y - camY); ctx.globalAlpha = 1; } }); }

// ==================== PROJÉTEIS ====================
const projectiles = [];
const PROJ_STYLE = { spine: ['#E9D8A6', 6, 6], leaf: ['#51CF66', 12, 8], miasma: ['#9C36B5', 16, 16], fire: ['#FF6B1A', 14, 14], water: ['#4DABF7', 14, 10], ember: ['#FFA94D', 10, 10], shockwave: ['#FFD8A8', 28, 18] };
class Projectile {
  constructor(x, y, vx, vy, type = 'spine', opts = {}) {
    const st = PROJ_STYLE[type] || PROJ_STYLE.spine;
    this.type = type; this.color = st[0]; this.w = opts.w || st[1]; this.h = opts.h || st[2];
    this.x = x - this.w / 2; this.y = y - this.h / 2; this.prevX = this.x; this.prevY = this.y; this.vx = vx; this.vy = vy;
    this.gravity = opts.gravity || 0; this.life = opts.life || 240; this.hostile = opts.hostile !== false; this.damage = opts.damage || 1; this.dead = false; this.t = 0;
    if (type === 'shockwave') { this.groundY = opts.groundY !== undefined ? opts.groundY : y + this.h / 2; this.y = this.groundY - this.h; this.prevY = this.y; }
  }
  update() {
    this.prevX = this.x; this.prevY = this.y; this.t++;
    if (this.type === 'leaf') this.vy += Math.sin(this.t * 0.2) * 0.08;
    if (this.type === 'miasma') { this.vx *= 0.995; this.vy += Math.sin(this.t * 0.1) * 0.05; }
    this.vy += this.gravity; this.x += this.vx; this.y += this.vy;
    if (this.type === 'shockwave') { this.y = this.groundY - this.h; if (this.t % 4 === 0) spawnDust(this.x + this.w / 2, this.groundY, 1); }
    if (this.type === 'ember' || this.type === 'fire') if (this.t % 3 === 0) particles.push(new Particle(this.x + this.w / 2, this.y + this.h / 2, 0, -0.5, '#FFD43B', 12, 2, 0));
    if (--this.life <= 0) this.dead = true;
    if (this.type !== 'shockwave' && (this.type === 'fire' || this.type === 'spine' || this.type === 'ember') && this.gravity > 0) {
      for (const p of getPlatforms()) if (checkAABB(this, p)) { this.dead = true; spawnSparks(this.x + this.w / 2, this.y + this.h, 5, this.color); break; }
    }
    if (currentLevel && (this.y > (currentLevel.height || 2000) + 100 || this.x < -200 || this.x > (currentLevel.width || 5000) + 200)) this.dead = true;
  }
  draw(ctx, camX, camY) {
    const x = lerp(this.prevX, this.x, renderAlpha) - camX, y = lerp(this.prevY, this.y, renderAlpha) - camY;
    ctx.save(); ctx.translate(x + this.w / 2, y + this.h / 2);
    ctx.strokeStyle = '#1A1A1A'; ctx.lineWidth = 2; ctx.fillStyle = this.color;
    switch (this.type) {
      case 'leaf': ctx.rotate(this.t * 0.3); ctx.beginPath(); ctx.ellipse(0, 0, this.w / 2, this.h / 2 - 1, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); break;
      case 'miasma': ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(0, 0, this.w / 2 + Math.sin(this.t * 0.3) * 1.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#E599F7'; ctx.beginPath(); ctx.arc(-2, -2, 3, 0, Math.PI * 2); ctx.fill(); break;
      case 'shockwave': ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.moveTo(-this.w / 2, this.h / 2); ctx.quadraticCurveTo(0, -this.h, this.w / 2, this.h / 2); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
      case 'water': ctx.beginPath(); ctx.ellipse(0, 0, this.w / 2, this.h / 2, Math.atan2(this.vy, this.vx), 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#D0EBFF'; ctx.fillRect(-2, -3, 4, 2); break;
      case 'fire': case 'ember': ctx.beginPath(); ctx.arc(0, 0, this.w / 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#FFE066'; ctx.beginPath(); ctx.arc(0, 0, this.w / 4, 0, Math.PI * 2); ctx.fill(); break;
      default: ctx.rotate(Math.atan2(this.vy, this.vx)); ctx.beginPath(); ctx.moveTo(this.w, 0); ctx.lineTo(-this.w / 2, -3); ctx.lineTo(-this.w / 2, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
}

// ==================== CÂMERA ====================
const camera = {
  x: 0, y: 0, prevX: 0, prevY: 0, levelW: CANVAS_W, levelH: CANVAS_H, lookahead: 0,
  reset(p) { this.lookahead = 0; this.x = clamp(p.x - CANVAS_W / 2, 0, Math.max(0, this.levelW - CANVAS_W)); this.y = clamp(p.y - CANVAS_H * 0.55, 0, Math.max(0, this.levelH - CANVAS_H)); this.prevX = this.x; this.prevY = this.y; },
  update(p) {
    this.prevX = this.x; this.prevY = this.y; if (!p) return;
    this.lookahead = lerp(this.lookahead, p.facing * 70 + p.vx * 6, 0.05);
    const tx = clamp(p.x + p.w / 2 - CANVAS_W / 2 + this.lookahead, 0, Math.max(0, this.levelW - CANVAS_W));
    const ty = clamp(p.y + p.h / 2 - CANVAS_H * 0.55, 0, Math.max(0, this.levelH - CANVAS_H));
    this.x = lerp(this.x, tx, 0.12); this.y = lerp(this.y, ty, p.onGround ? 0.1 : 0.06);
  },
  getRenderX(alpha) { return Math.round(lerp(this.prevX, this.x, alpha)); },
  getRenderY(alpha) { return Math.round(lerp(this.prevY, this.y, alpha)); }
};

// ==================== HERÓI TONHO ====================
class Tonho {
  constructor(x, y) {
    this.x = x; this.y = y; this.prevX = x; this.prevY = y; this.w = 28; this.h = 44; this.vx = 0; this.vy = 0;
    this.facing = 1; this.onGround = false; this.coyote = 0; this.jumpBuffer = 0; this.invuln = 0; this.dead = false;
    this.whipTimer = 0; this.whipCooldown = 0; this.whipHitSet = new Set(); this.gliding = false;
    this.onVine = null; this.vineCooldown = 0; this.runFrame = 0; this.runTick = 0; this.blinkTimer = 120; this.hatTilt = 0;
    this.spawnX = x; this.spawnY = y; this.landSquash = 0;
  }
  getWhipBox() { const reach = 56; return { x: this.facing > 0 ? this.x + this.w : this.x - reach, y: this.y + 8, w: reach, h: 22 }; }
  update() {
    // v2.2: desconta o arrasto da plataforma móvel para a interpolação não tremer
    this.prevX = this.x - (this._carryDX || 0); this.prevY = this.y - (this._carryDY || 0); this._carryDX = 0; this._carryDY = 0;
    if (this.dead) { this.updateDeath(); return; }
    if (this.asaBrancaTimer > 0) this.asaBrancaTimer--;
    if (keys.jumpJustPressed) { this.jumpBuffer = 10; } else if (this.jumpBuffer > 0) { this.jumpBuffer--; }
    if (this.invuln > 0) this.invuln--; if (this.whipCooldown > 0) this.whipCooldown--; if (this.vineCooldown > 0) this.vineCooldown--;
    if (keys.whipJustPressed && this.whipCooldown <= 0) this.performWhipAttack();
    if (this.whipTimer > 0) this.whipTimer--;

    // ----- Cipó -----
    if (this.onVine) { this.vx = 0; this.vy = 0; this.coyote = 0; this.updateAnim(); return; } // posição controlada em updateBiome

    const accel = this.onGround ? 0.8 : 0.55, maxSpd = 4.6, fric = this.onGround ? 0.78 : 0.92;
    if (keys.left && !keys.right) { this.vx -= accel; this.facing = -1; }
    else if (keys.right && !keys.left) { this.vx += accel; this.facing = 1; }
    else this.vx *= fric;
    this.vx = clamp(this.vx, -maxSpd, maxSpd); if (Math.abs(this.vx) < 0.05) this.vx = 0;

    if (this.onGround) this.coyote = 7; else if (this.coyote > 0) this.coyote--;
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.vy = -12.3; this.onGround = false; this.coyote = 0; this.jumpBuffer = 0;
      sfx('jump'); spawnDust(this.x + this.w / 2, this.y + this.h, 5);
    }
    if (this.trampolineTimer > 0) this.trampolineTimer--;
    if (!keys.jump && this.vy < -3 && !(this.trampolineTimer > 0)) this.vy *= 0.6; // pulo variável

    this.vy += GRAVITY;
    this.gliding = keys.glide && keys.jump && this.vy > 0 && !this.onGround;
    const fallCap = this.gliding ? 1.35 : MAX_FALL_SPEED;
    if (this.vy > fallCap) this.vy = this.gliding ? lerp(this.vy, fallCap, 0.35) : fallCap;

    this.applyEnvironment();
    this.moveAndCollide();
    this.checkHazards();
    this.updateAnim();
  }
  applyEnvironment() {
    const L = currentLevel; if (!L) return;
    for (const u of (L.updrafts || [])) if (checkAABB(this, u)) { this.vy -= this.gliding ? 1.05 : 0.35; if (this.vy < -7) this.vy = -7; if (Math.random() < 0.2) particles.push(new Particle(this.x + Math.random() * this.w, this.y + this.h, 0, -2, 'rgba(255,255,255,0.6)', 20, 2, 0)); }
    for (const g of (L.geysers || [])) {
      const active = g.active !== undefined ? g.active : ((Math.floor(((g.timer || 0) + stageTimerFrames) / (g.period || 120)) % 2) === 0);
      if (active && checkAABB(this, g)) { if (!this._inGeyser) sfx('geyser'); this._inGeyser = true; this.vy = Math.min(this.vy, -(g.power || 11) * 0.72); this.onGround = false; spawnSparks(this.x + this.w / 2, this.y + this.h, 2, '#D0EBFF'); }
    }
    this._inGeyser = (L.geysers || []).some(g => checkAABB(this, g)) && this._inGeyser;
    // v2.2: vento usa a força real da fase (fx) e é aplicado uma vez só
    for (const wz of (L.windZones || [])) if (checkAABB(this, wz)) { const f = wz.fx != null ? wz.fx * 3 : (wz.force || 1.5) * (wz.dir || 1); this.x += f * (this.onGround ? 0.5 : 1); }
    for (const t of (L.tideWater || [])) {
      const surfY = t.getY ? t.getY(stageTimerFrames) : t.y;
      if (this.x + this.w > t.x && this.x < t.x + t.w && this.y + this.h > surfY) {
        sfx('splash'); for (let i = 0; i < 10; i++) particles.push(new Particle(this.x + this.w / 2, surfY, (Math.random() - 0.5) * 4, -Math.random() * 4, '#74C0FC', 30, 3, 0.2));
        this.vy = -11.5; this.y = surfY - this.h - 1; this.onGround = false;
        if (this.invuln <= 0) this.takeDamage(1);
      }
    }
  }
  updateVine() {
    const v = this.onVine; v.angVel = (v.angVel || 0) - Math.sin(v.angle || 0) * 0.004;
    if (keys.left) v.angVel -= 0.0018; if (keys.right) v.angVel += 0.0018;
    v.angVel *= 0.995; v.angle = (v.angle || 0) + v.angVel;
    const tipX = v.x + Math.sin(v.angle) * v.length, tipY = v.y + Math.cos(v.angle) * v.length;
    this.x = tipX - this.w / 2; this.y = tipY - 8; this.facing = v.angVel >= 0 ? 1 : -1;
    if (this.jumpBuffer > 0) {
      const tang = v.angVel * v.length; this.vx = clamp(tang * 1.15, -7, 7); this.vy = -9 - Math.abs(tang) * 0.25;
      this.onVine = null; this.vineCooldown = 20; this.jumpBuffer = 0; sfx('jump'); spawnLeaves(tipX, tipY, 6);
    }
  }
  moveAndCollide() {
    const plats = getPlatforms();
    this.x += this.vx;
    for (const p of plats) { if (p.oneWay || !checkAABB(this, p)) continue; if (this.vx > 0) this.x = p.x - this.w; else if (this.vx < 0) this.x = p.x + p.w; this.vx = 0; }
    const wasGround = this.onGround; this.onGround = false; this.y += this.vy;
    for (const p of plats) {
      if (!checkAABB(this, p)) continue;
      if (p.oneWay) { if (this.vy >= 0 && this.prevY + this.h <= p.y + 4 + Math.abs(p.vy || 0) && !keys.down) { this.y = p.y - this.h; this.vy = 0; this.onGround = true; } continue; }
      if (this.vy > 0) { this.y = p.y - this.h; this.vy = 0; this.onGround = true; }
      else if (this.vy < 0) { this.y = p.y + p.h; this.vy = 0; }
    }
    if (this.onGround && !wasGround) { this.landSquash = 6; spawnDust(this.x + this.w / 2, this.y + this.h, 4); }
    if (this.x < 0) { this.x = 0; this.vx = 0; }
    if (currentLevel && currentLevel.width && this.x + this.w > currentLevel.width) { this.x = currentLevel.width - this.w; this.vx = 0; }
  }
  checkHazards() {
    const L = currentLevel; if (!L) return;
    for (const h of (L.hazards || [])) if (checkAABB(this, h)) this.takeDamage(1);
    if (this.y > (L.height || CANVAS_H) + 80) { health = 0; this.die(); }
  }
  updateAnim() {
    if (this.onGround && Math.abs(this.vx) > 0.4) { this.runTick += Math.abs(this.vx) * 0.2; if (this.runTick >= 1) { this.runTick = 0; this.runFrame = (this.runFrame + 1) % 6; } } else this.runFrame = 0;
    if (--this.blinkTimer < -6) this.blinkTimer = 140 + Math.floor(Math.random() * 120);
    this.hatTilt = lerp(this.hatTilt, clamp(-this.vx * 0.06, -0.3, 0.3) + (this.vy < -2 ? -0.08 : 0), 0.2);
    if (this.landSquash > 0) this.landSquash--;
  }
  performWhipAttack() {
    this.whipTimer = 14; this.whipCooldown = 22; this.whipHitSet.clear(); sfx('whip');
    spawnSparks(this.x + this.w / 2 + this.facing * 52, this.y + 18, 8, '#FFD43B');
  }
  bounce(power = -8.5) { this.vy = keys.jump ? power * 1.3 : power; this.onGround = false; this.coyote = 0; }
  takeDamage(amount = 1, srcX) {
    if (currentState === GAME_STATE.LEVEL_COMPLETE) return;
    if (this.invuln > 0 || this.dead || this.asaBrancaTimer > 0) return;
    tookDamageThisRun = true; health -= amount; this.invuln = 100; hitstopFrames = 5; addScreenShake(6); triggerHaptic(60); sfx('hurt');
    const away = srcX != null ? (this.x + this.w / 2 < srcX ? -1 : 1) : -this.facing;
    this.vy = -6; this.vx = away * 4; this.onVine = null;
    spawnSparks(this.x + this.w / 2, this.y + this.h / 2, 10, '#FA5252');
    if (health <= 0) this.die();
  }
  die() {
    if (this.dead) return; this.dead = true; health = 0; sfx('death'); triggerHaptic(150); addScreenShake(8);
    spawnSparks(this.x + this.w / 2, this.y + this.h / 2, 20, '#FFF');
    // v2.2: pequena animação de queda antes de reaparecer (antes era instantâneo e confuso)
    this.deathTimer = 55; this.vx = 0; this.vy = this.y > (currentLevel ? currentLevel.levelH : CANVAS_H) ? 0 : -9; this.onVine = null; this.invuln = 0;
  }
  updateDeath() {
    this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED); this.y += this.vy;
    if (--this.deathTimer > 0) return;
    this.deathTimer = 1e9;
    if (currentState === GAME_STATE.CHALLENGE) { callHook('finishChallenge'); return; }
    callHook('handlePlayerDeath');
  }
  draw(ctx, camX, camY) {
    if (this.invuln > 0 && !this.dead && Math.floor(this.invuln / 5) % 2 === 0) return;
    if (this.asaBrancaTimer > 0) {
      const gx = lerp(this.prevX, this.x, renderAlpha) - camX + this.w / 2, gy = lerp(this.prevY, this.y, renderAlpha) - camY + this.h / 2;
      const rg = ctx.createRadialGradient(gx, gy, 6, gx, gy, 46); rg.addColorStop(0, 'rgba(255,255,255,0.55)'); rg.addColorStop(1, 'rgba(191,233,255,0)');
      ctx.fillStyle = rg; ctx.fillRect(gx - 46, gy - 46, 92, 92);
    }
    if (typeof window !== 'undefined' && window.OxeHD && window.OxeHD.drawTonhoHD) {
      if (this.dead) {
        const cx = lerp(this.prevX, this.x, renderAlpha) - camX + this.w / 2, cy = lerp(this.prevY, this.y, renderAlpha) - camY + this.h / 2;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI); ctx.translate(-cx, -cy);
        window.OxeHD.drawTonhoHD(ctx, camX, camY, this, renderAlpha, frameCount); ctx.restore(); return;
      }
      window.OxeHD.drawTonhoHD(ctx, camX, camY, this, renderAlpha, frameCount);
      return;
    }
    if (this.dead) return;
    const rx = lerp(this.prevX, this.x, renderAlpha) - camX, ry = lerp(this.prevY, this.y, renderAlpha) - camY;
    const cx = rx + this.w / 2, feet = ry + this.h;
    // sombra
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(cx, this.onGround ? feet : feet + 8, 14 * (this.onGround ? 1 : 0.7), 4, 0, 0, Math.PI * 2); ctx.fill();
    // cipó
    if (this.onVine) { const v = this.onVine; ctx.strokeStyle = '#2B8A3E'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(v.x - camX, v.y - camY); ctx.lineTo(cx, ry + 8); ctx.stroke(); }
    ctx.save(); ctx.translate(cx, feet);
    const sq = this.landSquash > 0 ? 1 + this.landSquash * 0.03 : 1; ctx.scale(this.facing * sq, 1 / sq);
    const OUT = '#1A1A1A'; ctx.lineWidth = 2.5; ctx.strokeStyle = OUT; ctx.lineJoin = 'round';
    const fr = this.runFrame, phase = (fr / 6) * Math.PI * 2, moving = this.onGround && Math.abs(this.vx) > 0.4;
    const legA = moving ? Math.sin(phase) * 9 : (this.onGround ? 0 : 5), legB = moving ? -Math.sin(phase) * 9 : (this.onGround ? 0 : -4);
    const bob = moving ? Math.abs(Math.sin(phase)) * -2 : 0;
    // pernas
    ctx.fillStyle = '#5C3D2E';
    [[legB, -4], [legA, 4]].forEach(([o, bx]) => { ctx.beginPath(); ctx.roundRect(bx - 4 + o * 0.3, -16, 7, 16 - Math.abs(o) * 0.2, 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#3B2414'; ctx.fillRect(bx - 4 + o * 0.45, -4, 9, 4); ctx.fillStyle = '#5C3D2E'; });
    ctx.translate(0, bob);
    // braço traseiro
    ctx.fillStyle = '#C68B59'; ctx.beginPath(); ctx.roundRect(-11 - legA * 0.25, -32, 6, 14, 3); ctx.fill(); ctx.stroke();
    // corpo (gibão de couro)
    ctx.fillStyle = '#A0522D'; ctx.beginPath(); ctx.roundRect(-10, -34, 20, 20, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#E8C07D'; ctx.fillRect(-2, -33, 4, 18);
    // cabeça
    ctx.fillStyle = '#E0A872'; ctx.beginPath(); ctx.arc(1, -42, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // olho (piscar)
    ctx.fillStyle = OUT; if (this.blinkTimer < 0) ctx.fillRect(3, -43, 5, 1.5); else { ctx.beginPath(); ctx.arc(5, -43, 1.8, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#3B2414'; ctx.fillRect(3, -38, 5, 1.5);
    // chapéu de couro inclinado
    ctx.save(); ctx.translate(1, -49); ctx.rotate(this.hatTilt * this.facing);
    ctx.fillStyle = '#8B5A2B'; ctx.beginPath(); ctx.ellipse(0, 0, 15, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-8, 0); ctx.quadraticCurveTo(-7, -11, 0, -11); ctx.quadraticCurveTo(7, -11, 8, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#FFD43B'; for (let i = -5; i <= 5; i += 5) { ctx.beginPath(); ctx.arc(i, -4, 1.4, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    // braço da frente + chicote
    const armSwing = this.whipTimer > 0 ? -1.2 + (14 - this.whipTimer) * 0.18 : (moving ? Math.sin(phase + Math.PI) * 0.5 : 0.1);
    ctx.save(); ctx.translate(5, -30); ctx.rotate(armSwing);
    ctx.fillStyle = '#E0A872'; ctx.beginPath(); ctx.roundRect(-3, 0, 6, 14, 3); ctx.fill(); ctx.stroke(); ctx.restore();
    if (this.whipTimer > 0) {
      const t = 1 - this.whipTimer / 14, len = 52 * Math.min(1, t * 2.2);
      ctx.strokeStyle = '#6B3E1E'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(9, -22); ctx.quadraticCurveTo(9 + len * 0.5, -34 + t * 18, 9 + len, -22 + Math.sin(t * 6) * 3); ctx.stroke();
    }
    if (this.gliding) { ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(0, -36, 22, 5, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
}

// ==================== INIMIGOS ====================
const ENEMY_DEF = Object.assign({
  calango: { w: 32, h: 20, hp: 1, spd: 1.2, color: '#82C91E' }, tatu: { w: 32, h: 24, hp: 2, spd: 0.9, color: '#A68A64' },
  carcara: { w: 36, h: 24, hp: 1, spd: 1.6, color: '#5C4033', fly: true }, morcego: { w: 26, h: 18, hp: 1, spd: 1.4, color: '#5F3DC4', fly: true },
  cacto_atirador: { w: 28, h: 40, hp: 2, spd: 0, color: '#2B8A3E' }, bode_doido: { w: 40, h: 32, hp: 3, spd: 0.8, color: '#DEE2E6' },
  fulozinha: { w: 24, h: 30, hp: 2, spd: 1.2, color: '#20C997', fly: true }, papa_figo: { w: 32, h: 42, hp: 3, spd: 0.9, color: '#495057' },
  caranguejo: { w: 34, h: 22, hp: 2, spd: 1.1, color: '#FA5252' }, baiacu: { w: 30, h: 30, hp: 2, spd: 0.6, color: '#FAB005', fly: true },
  salamandra: { w: 34, h: 18, hp: 2, spd: 1.5, color: '#FD7E14' },
  sapo_cururu: { w: 38, h: 32, hp: 2, spd: 1.0, color: '#40C057' },
  marimbondo: { w: 32, h: 28, hp: 1, spd: 1.8, color: '#FAB005', fly: true },
  jararaca: { w: 36, h: 28, hp: 2, spd: 1.3, color: '#E03131' },
  cangaceiro_sombra: { w: 36, h: 44, hp: 3, spd: 1.1, color: '#845EF7' },
  mula_sem_cabeca: { w: 46, h: 40, hp: 3, spd: 2.2, color: '#FF6B6B' },
  boitata_fogo: { w: 40, h: 26, hp: 2, spd: 1.6, color: '#FFD43B', fly: true },
  lobisomem: { w: 40, h: 44, hp: 3, spd: 1.9, color: '#495057' }
}, (typeof window !== 'undefined' && window.OxeHD && window.OxeHD.ENEMY_DEF_HD) || {});
class Enemy {
  constructor(a, b, c = "calango", opts = {}) {
    const type = typeof a === "number" ? c : a;
    const x = typeof a === "number" ? a : b;
    const y = typeof a === "number" ? b : c;
    const d = ENEMY_DEF[type] || ENEMY_DEF.calango;
    this.type = type; this.x = x; this.y = y; this.prevX = x; this.prevY = y; this.w = d.w; this.h = d.h; this.hp = d.hp; this.speed = d.spd; this.color = d.color; this.fly = !!d.fly;
    this.vx = -d.spd; this.vy = 0; this.facing = -1; this.dead = false; this.timer = Math.floor(Math.random() * 60); this.hitFlashTimer = 0;
    this.baseX = x; this.baseY = y; this.range = opts.range || 120; this.state = 'patrol'; this.chargeDistance = 0; this.onGround = false; this.t = Math.random() * 100;
    this.rolling = false; this.puffed = false;
  }
  groundAhead(dir) {
    const probe = { x: dir > 0 ? this.x + this.w + 2 : this.x - 4, y: this.y + this.h + 2, w: 2, h: 6 };
    return getPlatforms().some(p => checkAABB(probe, p));
  }
  physics() {
    this.vy += GRAVITY; if (this.vy > MAX_FALL_SPEED) this.vy = MAX_FALL_SPEED; this.y += this.vy; this.onGround = false;
    for (const p of getPlatforms()) {
      if (!checkAABB(this, p)) continue;
      if (this.vy >= 0 && this.y + this.h - this.vy <= p.y + 14) { this.y = p.y - this.h; this.vy = 0; this.onGround = true; }
    }
    if (currentLevel && this.y > (currentLevel.height || 2000) + 100) this.dead = true;
  }
  walk(spd) {
    this.x += this.vx;
    let blocked = false;
    for (const p of getPlatforms()) if (!p.oneWay && checkAABB(this, p) && p.y < this.y + this.h - 10) { this.x = this.vx > 0 ? p.x - this.w - 1 : p.x + p.w + 1; blocked = true; }
    if (blocked || (this.onGround && !this.groundAhead(Math.sign(this.vx)))) { this.vx = -this.vx; }
    this.vx = Math.sign(this.vx || -1) * spd; this.facing = Math.sign(this.vx);
  }
  update() {
    this.prevX = this.x; this.prevY = this.y; if (this.dead) return;
    this.t++; this.timer++; if (this.hitFlashTimer > 0) this.hitFlashTimer--;
    const p = player, dx = p ? (p.x + p.w / 2) - (this.x + this.w / 2) : 999, dy = p ? (p.y + p.h / 2) - (this.y + this.h / 2) : 999;
    switch (this.type) {
      case 'calango': this.physics(); this.walk(this.speed + (Math.sin(this.t * 0.05) > 0.7 ? 1.5 : 0)); break;
      case 'tatu': this.physics(); this.rolling = Math.abs(dx) < 160 && Math.abs(dy) < 40; this.walk(this.rolling ? 3 : this.speed); break;
      case 'caranguejo': this.physics(); this.walk(this.speed * (Math.sin(this.t * 0.04) > 0 ? 1 : 1.8)); break;
      case 'salamandra': this.physics(); this.walk(this.speed);
        if (this.timer % 140 === 0 && Math.abs(dx) < 380) { sfx('fire'); projectiles.push(new Projectile(this.x + this.w / 2, this.y + 4, Math.sign(dx) * 2.5, -5, 'ember', { gravity: 0.2 })); } break;
      case 'papa_figo': this.physics(); this.walk(Math.abs(dx) < 220 ? 1.8 : this.speed); if (Math.abs(dx) < 220) { this.vx = Math.sign(dx) * 1.8; this.facing = Math.sign(dx); } break;
      case 'carcara':
        if (this.state === 'patrol') { this.x = this.baseX + Math.sin(this.t * 0.02) * this.range; this.y = this.baseY + Math.sin(this.t * 0.05) * 10; this.facing = Math.cos(this.t * 0.02) > 0 ? 1 : -1; if (Math.abs(dx) < 60 && dy > 0 && dy < 260) { this.state = 'dive'; this.vy = 5; this.vx = Math.sign(dx) * 2; } }
        else if (this.state === 'dive') { this.x += this.vx; this.y += this.vy; this.vy -= 0.12; if (this.y <= this.baseY) { this.y = this.baseY; this.state = 'patrol'; } } break;
      case 'morcego': this.x += Math.sign(dx) * (Math.abs(dx) < 260 ? this.speed : 0); this.y = this.baseY + Math.sin(this.t * 0.08) * 30 + (Math.abs(dx) < 260 ? clamp(dy, -40, 40) * 0.5 : 0); this.facing = Math.sign(dx) || 1; break;
      case 'fulozinha': this.x = this.baseX + Math.sin(this.t * 0.03) * this.range; this.y = this.baseY + Math.cos(this.t * 0.06) * 20; this.facing = Math.sign(dx) || 1;
        if (this.timer % 160 === 0 && Math.abs(dx) < 400) { sfx('leaf'); for (let i = -1; i <= 1; i++) { const a = Math.atan2(dy, dx) + i * 0.25; projectiles.push(new Projectile(this.x + this.w / 2, this.y + this.h / 2, Math.cos(a) * 3, Math.sin(a) * 3, 'leaf')); } } break;
      case 'baiacu': this.y = this.baseY + Math.sin(this.t * 0.03) * 24; this.puffed = Math.hypot(dx, dy) < 110; this.w = this.h = this.puffed ? 44 : 30;
        if (this.puffed && this.timer % 90 === 0) for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; projectiles.push(new Projectile(this.x + this.w / 2, this.y + this.h / 2, Math.cos(a) * 2.5, Math.sin(a) * 2.5, 'spine', { life: 70 })); } break;
      case 'cacto_atirador': this.physics(); this.facing = Math.sign(dx) || -1;
        if (this.timer % 120 === 0 && Math.abs(dx) < 420 && Math.abs(dy) < 200) { sfx('spine'); for (let i = -1; i <= 1; i++) projectiles.push(new Projectile(this.x + this.w / 2, this.y + 10, Math.sign(dx) * 3.4, -2.4 + i * 1.2, 'spine', { gravity: 0.08 })); } break;
      case 'bode_doido': this.updateBode(dx, dy); break;
      default:
        if (typeof window !== 'undefined' && window.OxeHD && window.OxeHD.updateNewEnemy) {
          window.OxeHD.updateNewEnemy(this, player, currentLevel, { GRAVITY, MAX_FALL_SPEED, getPlatforms, checkAABB, clamp, sfx, spawnDust, spawnSparks, Projectile, projectiles });
        } else { this.physics(); this.walk(this.speed); }
        break;
    }
  }
  updateBode(dx, dy) {
    // B1: física vertical
    this.vy += GRAVITY; if (this.vy > MAX_FALL_SPEED) this.vy = MAX_FALL_SPEED; this.y += this.vy; this.onGround = false;
    for (const p of getPlatforms()) { if (checkAABB(this, p) && this.vy >= 0 && this.y + this.h - this.vy <= p.y + 14) { this.y = p.y - this.h; this.vy = 0; this.onGround = true; } }
    if (this.state === 'patrol') {
      this.walk(this.speed);
      if (this.onGround && Math.abs(dx) < 300 && Math.abs(dy) < 50 && Math.sign(dx) === this.facing) { this.state = 'windup'; this.timer = 0; this.vx = 0; }
    } else if (this.state === 'windup') {
      if (this.timer % 6 === 0) spawnDust(this.x + this.w / 2 - this.facing * 14, this.y + this.h, 2);
      if (this.timer > 14) { this.state = 'charge'; this.vx = this.facing * 5.8; this.chargeDistance = 0; sfx('charge'); }
    } else if (this.state === 'charge') {
      this.x += this.vx; this.chargeDistance += Math.abs(this.vx);
      if (this.timer % 4 === 0) spawnDust(this.x + this.w / 2, this.y + this.h, 1);
      let hitWall = false;
      for (const p of getPlatforms()) {
        if (p.oneWay || !checkAABB(this, p)) continue;
        if (p.y < this.y + this.h - 10) { this.x = this.vx > 0 ? p.x - this.w - 1 : p.x + p.w + 1; hitWall = true; break; }
      }
      if (hitWall) { this.state = 'stunned'; this.timer = 0; this.stunTime = 120; this.vx = 0; sfx('thud'); addScreenShake(5); spawnSparks(this.x + (this.facing > 0 ? this.w : 0), this.y + 10, 10, '#FFF'); }
      else if (this.onGround && !this.groundAhead(this.facing)) { this.vx = 0; this.state = 'brake'; this.timer = 0; }
      else if (this.chargeDistance > 520) { this.state = 'brake'; this.timer = 0; }
    } else if (this.state === 'brake') {
      this.vx *= 0.8; if (this.onGround && this.groundAhead(this.facing)) this.x += this.vx;
      if (this.timer > 30) { this.vx = 0; this.state = 'patrol'; this.facing *= -1; this.vx = this.facing * this.speed; }
    } else if (this.state === 'stunned') {
      this.vx = 0; if (this.timer > (this.stunTime || 120)) { this.state = 'patrol'; this.facing *= -1; this.vx = this.facing * this.speed; }
    }
  }
  canBeStomped() { return !(this.type === 'cacto_atirador' || (this.type === 'baiacu' && this.puffed) || (this.type === 'tatu' && this.rolling)); }
  takeHit(dmg = 1, dir = 1) { return this.hit(dmg, this.x - dir * 10); }
  hit(dmg = 1, fromX) {
    if (this.dead) return false;
    if (this.type === 'tatu' && this.rolling && dmg < 2) { spawnSparks(this.x + this.w / 2, this.y, 4, '#ADB5BD'); sfx('clank'); return false; }
    this.hp -= dmg; this.hitFlashTimer = 8; sfx('hit'); hitstopFrames = Math.max(hitstopFrames, 3);
    if (fromX !== undefined) this.x += Math.sign(this.x + this.w / 2 - fromX) * 6;
    if (this.hp <= 0) { this.dead = true; score += 100; spawnSparks(this.x + this.w / 2, this.y + this.h / 2, 12, this.color); spawnFloatingText('+100', this.x + this.w / 2, this.y, '#FFD43B'); }
    return true;
  }
  draw(ctx, camX, camY) {
    if (this.dead) return;
    if (typeof window !== 'undefined' && window.OxeHD && window.OxeHD.drawEnemyHD) {
      window.OxeHD.drawEnemyHD(ctx, camX, camY, this, renderAlpha, frameCount);
      return;
    }
    const x = lerp(this.prevX, this.x, renderAlpha) - camX, y = lerp(this.prevY, this.y, renderAlpha) - camY, w = this.w, h = this.h;
    if (x + w < -50 || x > VIEW_W + 50) return;
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(x + w / 2, this.fly ? y + h + 22 : y + h, w * 0.45, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.scale(this.facing >= 0 ? 1 : -1, 1);
    if (this.state === 'stunned') ctx.rotate(Math.sin(this.t * 0.6) * 0.06);
    ctx.lineWidth = 2; ctx.strokeStyle = '#1A1A1A'; ctx.fillStyle = this.hitFlashTimer > 0 ? '#FFFFFF' : this.color;
    const eye = (ex, ey, r = 2.2) => { ctx.save(); ctx.fillStyle = '#FFF'; ctx.beginPath(); ctx.arc(ex, ey, r + 1, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#1A1A1A'; ctx.beginPath(); ctx.arc(ex + 0.6, ey, r * 0.6, 0, Math.PI * 2); ctx.fill(); ctx.restore(); };
    const leg = Math.sin(this.t * 0.3) * 3;
    switch (this.type) {
      case 'calango': case 'salamandra':
        ctx.beginPath(); ctx.ellipse(0, 2, w / 2 - 2, h / 2 - 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-w / 2 + 3, 2); ctx.lineTo(-w / 2 - 10, 6 + leg); ctx.stroke(); ctx.beginPath(); ctx.arc(w / 2 - 4, -2, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); eye(w / 2 - 2, -4, 1.8);
        if (this.type === 'salamandra') { ctx.fillStyle = '#FFD43B'; for (let i = -8; i < 8; i += 6) ctx.fillRect(i, -h / 2 + 2, 3, 3); } break;
      case 'tatu':
        if (this.rolling) { ctx.rotate(this.t * 0.3); ctx.beginPath(); ctx.arc(0, 0, h / 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-h / 2, 0); ctx.lineTo(h / 2, 0); ctx.stroke(); }
        else { ctx.beginPath(); ctx.ellipse(0, 2, w / 2, h / 2 - 2, 0, Math.PI, 0); ctx.lineTo(w / 2, h / 2 - 2); ctx.lineTo(-w / 2, h / 2 - 2); ctx.closePath(); ctx.fill(); ctx.stroke(); for (let i = -8; i <= 8; i += 6) { ctx.beginPath(); ctx.moveTo(i, -h / 2 + 4); ctx.lineTo(i, h / 2 - 3); ctx.stroke(); } eye(w / 2 - 3, 2, 1.6); } break;
      case 'carcara': case 'morcego': {
        const fl = Math.sin(this.t * 0.4) * 8; ctx.beginPath(); ctx.ellipse(0, 0, w / 4, h / 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-3, -2); ctx.lineTo(-w / 2, -fl); ctx.lineTo(-w / 4, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(3, -2); ctx.lineTo(w / 2, -fl); ctx.lineTo(w / 4, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
        if (this.type === 'carcara') { ctx.fillStyle = '#FAB005'; ctx.beginPath(); ctx.moveTo(w / 4, -2); ctx.lineTo(w / 4 + 7, 0); ctx.lineTo(w / 4, 3); ctx.fill(); }
        eye(4, -3, 1.6); break; }
      case 'cacto_atirador':
        ctx.beginPath(); ctx.roundRect(-8, -h / 2, 16, h, 8); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.roundRect(-16, -4, 8, 12, 4); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.roundRect(8, -10, 8, 12, 4); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#E9D8A6'; for (let i = -14; i < 16; i += 7) ctx.fillRect(-9, i, 2, 2); eye(3, -10, 2); break;
      case 'bode_doido':
        ctx.beginPath(); ctx.roundRect(-w / 2 + 2, -h / 2 + 6, w - 10, h - 14, 6); ctx.fill(); ctx.stroke();
        ctx.fillRect(-w / 2 + 6, h / 2 - 9 + (this.state === 'charge' ? leg : 0), 5, 9); ctx.fillRect(w / 2 - 16, h / 2 - 9 - (this.state === 'charge' ? leg : 0), 5, 9);
        ctx.beginPath(); ctx.roundRect(w / 2 - 14, -h / 2, 14, 14, 4); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#868E96'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(w / 2 - 8, -h / 2 + 2, 7, Math.PI, Math.PI * 1.9); ctx.stroke();
        eye(w / 2 - 5, -h / 2 + 6, 1.8); if (this.state === 'windup') { ctx.fillStyle = '#FA5252'; ctx.fillRect(w / 2 - 6, -h / 2 + 5, 3, 2); }
        if (this.state === 'stunned') { ctx.fillStyle = '#FFD43B'; for (let i = 0; i < 3; i++) { const a = this.t * 0.15 + i * 2.1; ctx.beginPath(); ctx.arc(w / 2 - 8 + Math.cos(a) * 10, -h / 2 - 6 + Math.sin(a) * 3, 2.5, 0, Math.PI * 2); ctx.fill(); } } break;
      case 'fulozinha':
        ctx.beginPath(); ctx.moveTo(0, -h / 2); ctx.lineTo(w / 2, h / 2); ctx.lineTo(-w / 2, h / 2); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#E0A872'; ctx.beginPath(); ctx.arc(0, -h / 2 + 4, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); eye(2, -h / 2 + 4, 1.4);
        ctx.fillStyle = '#1A1A1A'; ctx.fillRect(-7, -h / 2 - 3, 14, 4); break;
      case 'papa_figo':
        ctx.beginPath(); ctx.roundRect(-w / 2 + 4, -h / 2 + 10, w - 8, h - 14, 5); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#A68A64'; ctx.beginPath(); ctx.ellipse(-w / 2 + 2, 4, 9, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#868E96'; ctx.beginPath(); ctx.arc(2, -h / 2 + 7, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); eye(5, -h / 2 + 6, 1.6); break;
      case 'caranguejo':
        ctx.beginPath(); ctx.ellipse(0, 2, w / 2 - 4, h / 2 - 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        [-1, 1].forEach(s => { ctx.beginPath(); ctx.arc(s * (w / 2 - 1), -3 + (s > 0 ? leg : -leg) * 0.5, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }); eye(-4, -h / 2 + 2, 1.6); eye(4, -h / 2 + 2, 1.6); break;
      case 'baiacu':
        ctx.beginPath(); ctx.arc(0, 0, w / 2 - 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        if (this.puffed) { ctx.strokeStyle = '#E9D8A6'; for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * (w / 2 - 2), Math.sin(a) * (w / 2 - 2)); ctx.lineTo(Math.cos(a) * (w / 2 + 5), Math.sin(a) * (w / 2 + 5)); ctx.stroke(); } }
        eye(w / 4, -3, 2); break;
    }
    ctx.restore();
  }
}

// ==================== CHEFÕES ====================
const ARENA = { left: 40, right: 1360, width: 1400 };
class BossBase {
  constructor(x, y, opts) {
    this.x = x; this.y = y; this.prevX = x; this.prevY = y; this.w = opts.w; this.h = opts.h; this.maxHp = opts.hp; this.hp = opts.hp; this.name = opts.name; this.hint = opts.hint || '';
    this.vx = 0; this.vy = 0; this.facing = -1; this.state = 'idle'; this.timer = 90; this.onGround = false; this.dead = false; this.invuln = 0; this.hitFlashTimer = 0; this.t = 0;
    this.gravityOn = true; this.deathTimer = 0; this.isBoss = true; this.attackCount = 0;
  }
  get phase() { const r = this.hp / this.maxHp; return r > 0.67 ? 1 : (r > 0.34 ? 2 : 3); }
  get groundY() { let gy = CANVAS_H - 40; for (const p of getPlatforms()) if (p.w > 300 && p.y > 300) gy = Math.min(gy, p.y); return gy; }
  playerDX() { return player ? (player.x + player.w / 2) - (this.x + this.w / 2) : 0; }
  // Colisão vertical separada
  physicsY() {
    if (!this.gravityOn) return;
    this.vy += GRAVITY; if (this.vy > MAX_FALL_SPEED) this.vy = MAX_FALL_SPEED; this.y += this.vy; this.onGround = false;
    for (const p of getPlatforms()) { if (p.oneWay || !checkAABB(this, p)) continue; if (this.vy >= 0 && this.y + this.h - this.vy <= p.y + 16) { this.y = p.y - this.h; this.vy = 0; this.onGround = true; } }
  }
  // Colisão horizontal separada — retorna true se bateu em parede real (B2)
  moveX() {
    this.x += this.vx; let hit = false;
    for (const p of getPlatforms()) {
      if (p.oneWay || !checkAABB(this, p)) continue;
      if (p.y < this.y + this.h - 12) { this.x = this.vx > 0 ? p.x - this.w - 2 : p.x + p.w + 2; hit = true; break; }
    }
    if (!hit && this.x < ARENA.left) { this.x = ARENA.left + 2; hit = this.vx < 0; }
    if (!hit && this.x + this.w > ARENA.right) { this.x = ARENA.right - this.w - 2; hit = this.vx > 0; }
    return hit;
  }
  wallStun(time = 170) {
    this.vx = 0; this.facing *= -1; this.state = 'stunned'; this.timer = time;
    sfx('thud'); addScreenShake(10); hitstopFrames = Math.max(hitstopFrames, 4); triggerHaptic(40);
    spawnSparks(this.facing < 0 ? this.x + this.w : this.x, this.y + this.h / 2, 14, '#FFF');
  }
  stun(time = 170) { this.vx = 0; this.state = 'stunned'; this.timer = time; }
  isVulnerable() { return this.state === 'stunned' && this.invuln <= 0 && !this.dead; }
  takeDamage(dmg = 1) { return this.takeHit(dmg); }
  takeHit(dmg = 1) {
    if (!this.isVulnerable()) { if (this.invuln <= 0) { spawnSparks(this.x + this.w / 2, this.y + 10, 4, '#ADB5BD'); sfx('clank'); } return false; }
    this.hp -= dmg; this.invuln = 50; this.hitFlashTimer = 10; hitstopFrames = 8; addScreenShake(12); triggerHaptic(70); sfx('bosshit');
    spawnSparks(this.x + this.w / 2, this.y + this.h / 3, 18, '#FFD43B'); score += 500; spawnFloatingText('+500', this.x + this.w / 2, this.y - 10, '#FFD43B');
    if (this.hp <= 0) { this.hp = 0; this.dead = true; this.deathTimer = 120; sfx('bossdefeat'); addScreenShake(20); }
    else { this.state = 'recover'; this.timer = 50; this.vx = 0; this.vy = -5; }
    return true;
  }
  update() {
    this.prevX = this.x; this.prevY = this.y; this.t++;
    if (this.invuln > 0) this.invuln--; if (this.hitFlashTimer > 0) this.hitFlashTimer--;
    if (this.dead) { if (this.deathTimer > 0) { this.deathTimer--; if (this.deathTimer % 8 === 0) spawnSparks(this.x + Math.random() * this.w, this.y + Math.random() * this.h, 8, '#FFD43B'); } return; }
    if (bossIntroTimer > 0) { this.physicsY(); return; }
    this.timer--;
    if (this.state === 'stunned') { this.vx = 0; if (this.t % 20 === 0) spawnSparks(this.x + this.w / 2, this.y - 6, 2, '#FFE066'); if (this.timer <= 0) { this.state = 'idle'; this.timer = 60; } }
    else if (this.state === 'recover') { if (this.timer <= 0) { this.state = 'idle'; this.timer = 40; } }
    else this.ai();
    this.physicsY();
  }
  ai() {}
  drawShadow(ctx, x, y) { ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(x + this.w / 2, this.groundY - camera.getRenderY(renderAlpha) + 2, this.w * 0.5, 7, 0, 0, Math.PI * 2); ctx.fill(); }
  drawStunStars(ctx, cx, cy) { if (this.state !== 'stunned') return; ctx.fillStyle = '#FFD43B'; ctx.strokeStyle = '#1A1A1A'; ctx.lineWidth = 1.5; for (let i = 0; i < 4; i++) { const a = this.t * 0.12 + i * Math.PI / 2; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 22, cy + Math.sin(a) * 6, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); } }
  draw(ctx, camX, camY) {
    if (this.dead && this.deathTimer <= 0) return;
    if (this.invuln > 0 && Math.floor(this.invuln / 3) % 2 === 0 && !this.dead) return;
    if (typeof window !== 'undefined' && window.OxeHD && window.OxeHD.drawBossHD) {
      window.OxeHD.drawBossHD(ctx, camX, camY, this, renderAlpha, frameCount);
      return;
    }
    const x = lerp(this.prevX, this.x, renderAlpha) - camX, y = lerp(this.prevY, this.y, renderAlpha) - camY;
    this.drawShadow(ctx, x, y);
    ctx.save(); if (this.dead) ctx.globalAlpha = this.deathTimer / 120;
    ctx.translate(x + this.w / 2, y + this.h); ctx.scale(this.facing >= 0 ? 1 : -1, 1); ctx.lineWidth = 3; ctx.strokeStyle = '#1A1A1A'; ctx.lineJoin = 'round';
    this.drawBody(ctx, this.hitFlashTimer > 0);
    ctx.restore();
    this.drawStunStars(ctx, x + this.w / 2, y - 10);
  }
  drawBody() {}
}

// ----- Mundo 1: Boi Bumbá de Fogo -----
class BossBull extends BossBase {
  constructor(x, y) { super(x, y, { w: 96, h: 72, hp: 6, name: 'Boi Brabo de Fogo', hint: 'Desvie da investida: ele se atordoa ao bater na parede!' }); this.jumpPhase = 0; }
  hornColor() { const p = this.phase; return p === 1 ? '#FF922B' : (p === 2 ? '#FA5252' : (Math.floor(this.t / 6) % 2 ? '#339AF0' : '#FFD43B')); }
  ai() {
    const dx = this.playerDX();
    switch (this.state) {
      case 'idle': this.vx *= 0.8; this.facing = Math.sign(dx) || this.facing;
        if (this.timer <= 0) { if (this.phase === 3 && this.attackCount % 2 === 0) { this.state = 'leap'; this.timer = 0; this.vy = -13; this.leapTarget = ARENA.width / 2 - this.w / 2; sfx('jump'); } else { this.state = 'windup'; this.timer = this.phase === 1 ? 50 : 36; } this.attackCount++; } break;
      case 'windup': if (this.timer % 5 === 0) spawnDust(this.x + this.w / 2 - this.facing * 40, this.y + this.h, 3); this.facing = Math.sign(dx) || this.facing;
        if (this.timer <= 0) { this.state = 'charge'; this.vx = this.facing * (this.phase === 1 ? 6.5 : 8.5); sfx('charge'); } break;
      case 'charge': if (this.t % 3 === 0) spawnDust(this.x + this.w / 2, this.y + this.h, 2);
        if (this.moveX()) {
          this.wallStun(170);
          if (this.phase >= 2) for (let i = 0; i < 3; i++) { const px = clamp((player ? player.x : this.x) + (i - 1) * 140 + (Math.random() - 0.5) * 40, ARENA.left + 20, ARENA.right - 20); projectiles.push(new Projectile(px, -20 - i * 60, 0, 2, this.phase === 2 ? 'spine' : 'fire', { gravity: 0.25, w: 16, h: 16 })); }
        } break;
      case 'leap':
        this.x += (this.leapTarget - this.x) * 0.06; this.facing = Math.sign(dx) || this.facing;
        if (this.onGround && this.vy === 0 && this.timer < -10) { sfx('quake'); addScreenShake(14); const gy = this.y + this.h;
          projectiles.push(new Projectile(this.x - 10, gy, -5, 0, 'shockwave', { groundY: gy, life: 200 })); projectiles.push(new Projectile(this.x + this.w + 10, gy, 5, 0, 'shockwave', { groundY: gy, life: 200 }));
          this.state = 'windup'; this.timer = 45; } break;
    }
  }
  drawBody(ctx, flash) {
    const W = this.w, H = this.h, run = this.state === 'charge' ? Math.sin(this.t * 0.6) * 6 : 0;
    ctx.fillStyle = flash ? '#FFF' : '#5C2E1A';
    [-W / 2 + 12, -W / 2 + 26, W / 2 - 30, W / 2 - 16].forEach((lx, i) => { ctx.fillRect(lx, -22 + (i % 2 ? run : -run) * 0.3, 9, 22); ctx.strokeRect(lx, -22, 9, 22); });
    ctx.beginPath(); ctx.roundRect(-W / 2 + 6, -H + 10, W - 24, H - 28, 16); ctx.fill(); ctx.stroke();
    ctx.fillStyle = flash ? '#FFF' : '#E03131'; ctx.fillRect(-W / 2 + 18, -H + 20, W - 48, 10); // manto de boi-bumbá
    ctx.fillStyle = flash ? '#FFF' : '#6E3B22'; ctx.beginPath(); ctx.roundRect(W / 2 - 34, -H + 4, 34, 32, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#FFF'; ctx.beginPath(); ctx.arc(W / 2 - 12, -H + 16, 4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = this.state === 'windup' || this.state === 'charge' ? '#FA5252' : '#1A1A1A'; ctx.beginPath(); ctx.arc(W / 2 - 11, -H + 16, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#F1F3F5'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(W / 2 - 28, -H + 6); ctx.quadraticCurveTo(W / 2 - 22, -H - 14, W / 2 - 6, -H - 18); ctx.stroke();
    const hc = this.hornColor(); for (let i = 0; i < 3; i++) particles.length < 400 && this.t % 4 === 0 && i === 0 && particles.push(new Particle(this.x + (this.facing > 0 ? this.w - 6 : 6), this.y - 16, (Math.random() - 0.5), -1.2, hc, 18, 4, -0.02));
    ctx.fillStyle = hc; ctx.beginPath(); ctx.arc(W / 2 - 6, -H - 20, 6 + Math.sin(this.t * 0.4) * 2, 0, Math.PI * 2); ctx.fill();
  }
}

// ----- Mundo 2: Comadre Fulozinha -----
class BossFulozinha extends BossBase {
  constructor(x, y) { super(x, y, { w: 52, h: 76, hp: 6, name: 'Comadre Fulozinha', hint: 'Depois dos leques de folhas ela cansa no chão — ataque!' }); this.points = [[200, 300], [700, 220], [1150, 300], [450, 260], [950, 260]]; this.volleys = 0; this.alpha = 1; }
  ai() {
    const dx = this.playerDX(); this.facing = Math.sign(dx) || this.facing;
    switch (this.state) {
      case 'idle': this.gravityOn = false; this.vy = 0; this.y += Math.sin(this.t * 0.08) * 0.6; if (this.timer <= 0) { this.state = 'vanish'; this.timer = 30; sfx('teleport'); } break;
      case 'vanish': this.alpha = this.timer / 30; if (this.timer <= 0) { const pt = this.points[Math.floor(Math.random() * this.points.length)]; this.x = pt[0]; this.y = pt[1]; spawnLeaves(this.x + this.w / 2, this.y + this.h / 2, 14); this.state = 'appear'; this.timer = 20; } break;
      case 'appear': this.alpha = 1 - this.timer / 20; if (this.timer <= 0) { this.alpha = 1; this.state = 'attack'; this.timer = 30; } break;
      case 'attack': if (this.timer <= 0) {
          sfx('leaf'); const n = 3 + this.phase * 2, spread = 0.18 + this.phase * 0.04, a0 = player ? Math.atan2((player.y + player.h / 2) - (this.y + this.h / 2), dx) : Math.PI / 2;
          for (let i = 0; i < n; i++) { const a = a0 + (i - (n - 1) / 2) * spread; projectiles.push(new Projectile(this.x + this.w / 2, this.y + this.h / 2, Math.cos(a) * (3 + this.phase * 0.5), Math.sin(a) * (3 + this.phase * 0.5), 'leaf')); }
          this.volleys++; if (this.volleys >= 1 + this.phase) { this.volleys = 0; this.state = 'tired'; this.gravityOn = true; this.timer = 999; } else { this.state = 'vanish'; this.timer = 24; }
        } break;
      case 'tired': if (this.onGround) { spawnLeaves(this.x + this.w / 2, this.y + this.h, 8); sfx('thud'); this.stun(170); } break;
    }
  }
  update() { super.update(); if (this.state === 'stunned' && this.timer === 1) { this.gravityOn = false; this.vy = -4; } }
  drawBody(ctx, flash) {
    ctx.globalAlpha *= this.alpha; const W = this.w, H = this.h, sway = Math.sin(this.t * 0.1) * 3;
    ctx.fillStyle = flash ? '#FFF' : '#0CA678'; ctx.beginPath(); ctx.moveTo(sway, -H + 22); ctx.lineTo(W / 2 + 4, 0); ctx.lineTo(-W / 2 - 4, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = flash ? '#FFF' : '#2B8A3E'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(-W / 2 + i * 13, -4, 7, 4, i, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = flash ? '#FFF' : '#C68B59'; ctx.beginPath(); ctx.arc(sway, -H + 14, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1A1A1A'; ctx.beginPath(); ctx.moveTo(-14 + sway, -H + 10); ctx.quadraticCurveTo(sway, -H - 16, 16 + sway, -H + 14); ctx.lineTo(18 + sway, -H + 36); ctx.lineTo(10 + sway, -H + 8); ctx.closePath(); ctx.fill();
    if (this.state === 'stunned') { ctx.fillStyle = '#1A1A1A'; ctx.fillRect(2 + sway, -H + 12, 7, 2); } else { ctx.fillStyle = '#FFF'; ctx.beginPath(); ctx.arc(5 + sway, -H + 13, 3, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#12B886'; ctx.beginPath(); ctx.arc(6 + sway, -H + 13, 1.6, 0, Math.PI * 2); ctx.fill(); }
  }
}

// ----- Mundo 3: Papa-Figo -----
class BossPapaFigo extends BossBase {
  constructor(x, y) { super(x, y, { w: 70, h: 96, hp: 6, name: 'Papa-Figo', hint: 'Após o pulo pesado o saco fica preso — hora de bater!' }); }
  ai() {
    const dx = this.playerDX();
    switch (this.state) {
      case 'idle': this.facing = Math.sign(dx) || this.facing; this.vx = this.facing * (0.8 + this.phase * 0.4); if (this.moveX()) this.vx = 0;
        if (this.timer <= 0) { this.attackCount++; if (this.attackCount % 2) { this.state = 'miasma'; this.timer = 20; this.shots = 2 + this.phase; } else { this.state = 'leap_smash'; this.vy = -12 - this.phase; this.vx = clamp(dx / 50, -6, 6); this.leaping = true; } } break;
      case 'miasma': this.vx = 0; if (this.timer <= 0) { sfx('miasma'); const a = player ? Math.atan2(player.y - this.y, dx) : 0; projectiles.push(new Projectile(this.x + this.w / 2, this.y + 30, Math.cos(a) * 2.6, Math.sin(a) * 2.6 - 0.6, 'miasma', { life: 260 })); this.shots--; this.timer = 26; if (this.shots <= 0) { this.state = 'idle'; this.timer = 70; } } break;
      case 'leap_smash': if (this.moveX()) this.vx = 0;
        if (this.onGround && this.vy === 0 && this.timer < -8) { sfx('quake'); addScreenShake(14); const gy = this.y + this.h;
          if (this.phase >= 2) { projectiles.push(new Projectile(this.x - 10, gy, -4.5, 0, 'shockwave', { groundY: gy })); projectiles.push(new Projectile(this.x + this.w + 10, gy, 4.5, 0, 'shockwave', { groundY: gy })); }
          spawnDust(this.x + this.w / 2, gy, 16); this.stun(170); } break;
    }
  }
  drawBody(ctx, flash) {
    const W = this.w, H = this.h, step = Math.sin(this.t * 0.2) * (Math.abs(this.vx) > 0.2 ? 4 : 0);
    ctx.fillStyle = flash ? '#FFF' : '#343A40'; ctx.fillRect(-16, -24 + step, 12, 24); ctx.fillRect(4, -24 - step, 12, 24); ctx.strokeRect(-16, -24, 12, 24); ctx.strokeRect(4, -24, 12, 24);
    ctx.fillStyle = flash ? '#FFF' : '#495057'; ctx.beginPath(); ctx.roundRect(-W / 2 + 10, -H + 26, W - 20, H - 46, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = flash ? '#FFF' : '#A68A64'; ctx.beginPath(); ctx.ellipse(-W / 2 + 4, -H / 2 + (this.state === 'stunned' ? 18 : 0), 18, 24, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#9C36B5'; ctx.globalAlpha *= 0.6; ctx.beginPath(); ctx.arc(-W / 2 + 4, -H / 2 - 26, 6 + Math.sin(this.t * 0.2) * 2, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = this.dead ? this.deathTimer / 120 : 1;
    ctx.fillStyle = flash ? '#FFF' : '#868E96'; ctx.beginPath(); ctx.arc(6, -H + 18, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#E599F7'; ctx.beginPath(); ctx.arc(12, -H + 16, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1A1A1A'; ctx.fillRect(-12, -H + 2, 34, 6); ctx.fillRect(-4, -H - 6, 18, 9);
  }
}

// ----- Mundo 4: Serpente da Maré -----
class BossSerpente extends BossBase {
  constructor(x, y) {
    super(x, y, { w: 110, h: 70, hp: 6, name: 'Serpente da Maré', hint: 'Faça a Serpente dar o bote contra a parede!' }); this.world = 4;
    this.state = 'idle'; this.timer = 90; this.shots = 0; this.dir = -1;
    this.guideText = 'Faça a Serpente dar o bote contra a parede e chicoteie a cabeça tonta!';
  }
  updateAI(player, L) {
    const px = player.x + player.w / 2, cx = this.x + this.w / 2;
    this.phase = this.hp <= 3 ? 2 : 1;
    switch (this.state) {
      case 'idle':
        this.vx *= 0.85; this.moveX(); this.dir = px < cx ? -1 : 1;
        if (--this.timer <= 0) {
          if (Math.random() < 0.5) { this.state = 'spit'; this.shots = this.phase >= 2 ? 4 : 3; this.timer = 20; }
          else { this.state = 'windup'; this.timer = 45; sfx('bossRoar'); }
        } break;
      case 'spit':
        this.vx = 0;
        if (--this.timer <= 0) {
          const hx = this.dir < 0 ? this.x : this.x + this.w, hy = this.y + 18;
          const dx = px - hx, dy = (player.y + player.h / 2) - hy, d = Math.hypot(dx, dy) || 1;
          projectiles.push(new Projectile(hx, hy, (dx / d) * 4.2, (dy / d) * 4.2 - 1.5, 'water', { gravity: 0.12 }));
          sfx('splash'); this.shots--; this.timer = 26;
          if (this.shots <= 0) { this.state = 'idle'; this.timer = 70; }
        } break;
      case 'windup':
        this.vx = 0;
        if (--this.timer <= 0) { this.state = 'charge'; this.vx = this.dir * (this.phase >= 2 ? 7 : 5.5); this.timer = 240; }
        break;
      case 'charge':
      case 'lunge':
        if (this.moveX()) { sfx('splash'); addScreenShake(10); spawnDust(cx, this.y + this.h, 12); this.wallStun(170); break; }
        if (--this.timer <= 0) { this.state = 'idle'; this.timer = 60; this.vx = 0; }
        break;
    }
  }
  ai() { if (player) this.updateAI(player, currentLevel); }
  drawBody(ctx, flash) {
    const W = this.w, H = this.h, t = this.t || 0;
    ctx.fillStyle = flash ? '#FFF' : '#2B8A3E';
    for (let i = 0; i < 6; i++) {
      const sx = -W / 2 + 10 + i * 16, sy = -18 + Math.sin(t * 0.15 + i) * 6;
      ctx.beginPath(); ctx.arc(sx, sy, 14 - i, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    const hy = -H + 22 + (this.state === 'stunned' ? 18 : 0);
    ctx.fillStyle = flash ? '#FFF' : '#37B24D'; ctx.beginPath(); ctx.ellipse(-W / 2 + 4, hy, 24, 18, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#FFE066'; ctx.beginPath(); ctx.arc(-W / 2 - 4, hy - 6, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#C92A2A'; ctx.fillRect(-W / 2 - 24, hy + 4, 10, 2);
    ctx.fillStyle = '#74C0FC'; ctx.globalAlpha *= 0.5; ctx.fillRect(-W / 2, -6, W, 6); ctx.globalAlpha = this.dead ? this.deathTimer / 120 : 1;
  }
}

// ----- Mundo 5: Guardião da Brasa -----
class BossGuardiaoBrasa extends BossBase {
  constructor(x, y) {
    super(x, y, { w: 96, h: 110, hp: 6, name: 'Guardião de Brasa', hint: 'Pule as ondas e faça o Guardião bater na parede!' }); this.world = 5;
    this.state = 'idle'; this.timer = 90; this.shots = 0; this.dir = -1;
    this.guideText = 'Pule as ondas do pisão! Desvie da investida e chicoteie quando ele bater na parede!';
  }
  updateAI(player, L) {
    const px = player.x + player.w / 2, cx = this.x + this.w / 2;
    this.phase = this.hp <= 3 ? 2 : 1;
    switch (this.state) {
      case 'idle':
        this.vx *= 0.85; this.moveX(); this.dir = px < cx ? -1 : 1;
        if (--this.timer <= 0) {
          const r = Math.random();
          if (r < 0.35) { this.state = 'stomp'; this.timer = 40; }
          else if (r < 0.65) { this.state = 'ember'; this.shots = this.phase >= 2 ? 5 : 3; this.timer = 18; }
          else { this.state = 'windup'; this.timer = 40; sfx('bossRoar'); }
        } break;
      case 'stomp':
        this.vx = 0;
        if (--this.timer <= 0) {
          const gy = this.y + this.h; sfx('quake'); addScreenShake(12);
          projectiles.push(new Projectile(this.x - 10, gy, -4, 0, 'shockwave', { groundY: gy }));
          projectiles.push(new Projectile(this.x + this.w + 10, gy, 4, 0, 'shockwave', { groundY: gy }));
          spawnDust(cx, gy, 14); this.state = 'idle'; this.timer = 70;
        } break;
      case 'ember':
        this.vx = 0;
        if (--this.timer <= 0) {
          const vx = (Math.random() * 4 - 2) + this.dir * 1.5;
          projectiles.push(new Projectile(cx, this.y + 10, vx, -6 - Math.random() * 2, 'ember', { gravity: 0.2 }));
          sfx('spine'); this.shots--; this.timer = 22;
          if (this.shots <= 0) { this.state = 'idle'; this.timer = 60; }
        } break;
      case 'windup':
        this.vx = 0;
        if (--this.timer <= 0) { this.state = 'charge'; this.vx = this.dir * (this.phase >= 2 ? 6.5 : 5); this.timer = 240; }
        break;
      case 'charge':
        if (this.frameEmber = ((this.frameEmber || 0) + 1) % 10, this.frameEmber === 0 && this.phase >= 2)
          projectiles.push(new Projectile(cx, this.y + this.h - 6, 0, -1, 'ember', { gravity: 0.15 }));
        if (this.moveX()) { sfx('quake'); addScreenShake(12); spawnDust(cx, this.y + this.h, 14); this.wallStun(170); break; }
        if (--this.timer <= 0) { this.state = 'idle'; this.timer = 60; this.vx = 0; }
        break;
    }
  }
  ai() { if (player) this.updateAI(player, currentLevel); }
  drawBody(ctx, flash) {
    const W = this.w, H = this.h, t = this.t || 0, step = Math.sin(t * 0.2) * (Math.abs(this.vx) > 0.2 ? 4 : 0);
    ctx.fillStyle = flash ? '#FFF' : '#5C3D2E'; ctx.fillRect(-26, -26 + step, 18, 26); ctx.fillRect(8, -26 - step, 18, 26);
    ctx.fillStyle = flash ? '#FFF' : '#7F4F24'; ctx.beginPath(); ctx.roundRect(-W / 2 + 6, -H + 30, W - 12, H - 54, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#FF922B'; ctx.globalAlpha *= 0.7 + Math.sin(t * 0.3) * 0.2;
    ctx.beginPath(); ctx.arc(0, -H / 2 - 4, 14, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = this.dead ? this.deathTimer / 120 : 1;
    const hy = -H + 20 + (this.state === 'stunned' ? 14 : 0);
    ctx.fillStyle = flash ? '#FFF' : '#6F4518'; ctx.beginPath(); ctx.arc(0, hy, 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#FFD43B'; ctx.fillRect(-12, hy - 4, 8, 4); ctx.fillRect(4, hy - 4, 8, 4);
    ctx.fillStyle = '#FA5252'; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 10 - 5, hy - 18); ctx.lineTo(i * 10, hy - 30 - Math.sin(t * 0.4 + i) * 4); ctx.lineTo(i * 10 + 5, hy - 18); ctx.fill(); }
  }
}

// ----- Mundo 6: Sombra Seca (Chefe Final, 3 Atos) -----
class BossSombraSeca extends BossBase {
  constructor(x, y) {
    super(x, y, { w: 90, h: 120, hp: 9, name: 'A Sombra da Seca', hint: 'Desvie dos ataques solares e golpeie quando ela tontear!' }); this.world = 6;
    this.state = 'idle'; this.timer = 100; this.shots = 0; this.dir = -1; this.act = 1;
    this.guideText = 'ATO I: Desvie dos raios de sol e faça a Sombra bater na parede!';
  }
  updateAI(player, L) {
    const px = player.x + player.w / 2, cx = this.x + this.w / 2;
    const newAct = this.hp > 6 ? 1 : this.hp > 3 ? 2 : 3;
    if (newAct !== this.act) {
      this.act = newAct; sfx('bossRoar'); addScreenShake(16);
      this.guideText = newAct === 2 ? 'ATO II: Os sóis caem do céu! Fuja das sombras no chão e chicoteie quando ela tontear!'
        : 'ATO III: A Sombra está furiosa! Pule as ondas e use a investida dela contra ela mesma!';
    }
    this.phase = this.act;
    switch (this.state) {
      case 'idle':
        this.vx *= 0.85; this.moveX(); this.dir = px < cx ? -1 : 1;
        if (--this.timer <= 0) {
          const r = Math.random();
          if (r < 0.3) { this.state = 'sunbeam'; this.shots = 2 + this.act; this.timer = 20; }
          else if (r < 0.55 && this.act >= 2) { this.state = 'sunrain'; this.shots = 3 + this.act * 2; this.timer = 15; sfx('miasma'); }
          else if (r < 0.7 && this.act >= 3) { this.state = 'stomp'; this.timer = 35; }
          else { this.state = 'windup'; this.timer = 50 - this.act * 6; sfx('bossRoar'); }
        } break;
      case 'sunbeam':
        this.vx = 0;
        if (--this.timer <= 0) {
          const hx = cx, hy = this.y + 24, dx = px - hx, dy = (player.y + player.h / 2) - hy, d = Math.hypot(dx, dy) || 1, sp = 3.5 + this.act * 0.6;
          projectiles.push(new Projectile(hx, hy, (dx / d) * sp, (dy / d) * sp, 'ember', {}));
          sfx('spine'); this.shots--; this.timer = 24;
          if (this.shots <= 0) { this.state = 'idle'; this.timer = 70; }
        } break;
      case 'sunrain':
        this.vx = 0;
        if (--this.timer <= 0) {
          const rx = player.x + (Math.random() * 300 - 150);
          projectiles.push(new Projectile(rx, (L && typeof view !== 'undefined' ? view.y : this.y - 300) - 20, 0, 3 + this.act * 0.5, 'ember', { gravity: 0.05 }));
          this.shots--; this.timer = 18;
          if (this.shots <= 0) { this.state = 'idle'; this.timer = 60; }
        } break;
      case 'stomp':
        this.vx = 0;
        if (--this.timer <= 0) {
          const gy = this.y + this.h; sfx('quake'); addScreenShake(14);
          projectiles.push(new Projectile(this.x - 10, gy, -5, 0, 'shockwave', { groundY: gy }));
          projectiles.push(new Projectile(this.x + this.w + 10, gy, 5, 0, 'shockwave', { groundY: gy }));
          spawnDust(cx, gy, 16); this.state = 'idle'; this.timer = 60;
        } break;
      case 'windup':
        this.vx = 0;
        if (--this.timer <= 0) { this.state = 'charge'; this.vx = this.dir * (4.5 + this.act * 1.1); this.timer = 240; }
        break;
      case 'charge':
        if (this.moveX()) { sfx('quake'); addScreenShake(14); spawnDust(cx, this.y + this.h, 16); this.wallStun(170); break; }
        if (--this.timer <= 0) { this.state = 'idle'; this.timer = 60; this.vx = 0; }
        break;
    }
  }
  ai() { if (player) this.updateAI(player, currentLevel); }
  drawBody(ctx, flash) {
    const W = this.w, H = this.h, t = this.t || 0;
    ctx.fillStyle = '#FFD43B'; ctx.globalAlpha *= 0.25 + this.act * 0.1;
    ctx.beginPath(); ctx.arc(0, -H / 2, 60 + Math.sin(t * 0.1) * 6, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = this.dead ? this.deathTimer / 120 : 1;
    ctx.fillStyle = flash ? '#FFF' : '#212529';
    ctx.beginPath(); ctx.moveTo(-W / 2, 0); ctx.quadraticCurveTo(-W / 2 + 6, -H + 30, 0, -H + 20); ctx.quadraticCurveTo(W / 2 - 6, -H + 30, W / 2, 0);
    for (let i = 4; i >= 0; i--) ctx.lineTo(-W / 2 + i * (W / 5) + Math.sin(t * 0.2 + i) * 4, -8 + (i % 2) * 8);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    const hy = -H + 22 + (this.state === 'stunned' ? 16 : 0);
    ctx.fillStyle = flash ? '#FFF' : '#343A40'; ctx.beginPath(); ctx.arc(0, hy, 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = this.act >= 3 ? '#FF6B6B' : '#FFE066'; ctx.fillRect(-11, hy - 4, 7, 5); ctx.fillRect(4, hy - 4, 7, 5);
    ctx.strokeStyle = '#FAB005'; ctx.lineWidth = 3;
    for (let i = 0; i < 3 + this.act; i++) { const a = -Math.PI / 2 + (i - (2 + this.act) / 2) * 0.35; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 22, hy + Math.sin(a) * 22); ctx.lineTo(Math.cos(a) * 34, hy + Math.sin(a) * 34); ctx.stroke(); }
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
  }
}

function createBoss(bossType, x, y) {
  switch (bossType) {
    case 'bull': case 'BossBull': return new BossBull(x, y);
    case 'fulozinha': case 'BossFulozinha': return new BossFulozinha(x, y);
    case 'papa_figo': case 'papafigo': case 'papaFigo': case 'BossPapaFigo': return new BossPapaFigo(x, y);
    case 'serpente': case 'BossSerpente': return new BossSerpente(x, y);
    case 'guardiao': case 'guardiao_brasa': case 'guardiaoBrasa': case 'brasa': case 'BossGuardiaoBrasa': return new BossGuardiaoBrasa(x, y);
    case 'sombra': case 'sombra_seca': case 'sombraSeca': case 'BossSombraSeca': return new BossSombraSeca(x, y);
    default: return null;
  }
}

function drawBossGuide(ctx, boss, camX, camY) {
  if (!boss || boss.dead || boss.hp <= 0) return;
  const dprG = +(ctx.canvas.dataset && ctx.canvas.dataset.dpr) || 1, W = ctx.canvas.width / dprG, t = boss.t || 0;
  const text = boss.guideText || 'Desvie dos ataques e chicoteie o chefe quando ele ficar tonto!';
  ctx.save(); ctx.setTransform(dprG, 0, 0, dprG, 0, 0);
  ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const tw = Math.min(W - 20, ctx.measureText(text).width + 30), bx = W / 2 - tw / 2, by = 52;
  ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.beginPath(); ctx.roundRect(bx, by, tw, 30, 10); ctx.fill();
  ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = boss.state === 'stunned' ? '#FFD700' : '#FFF';
  ctx.fillText(boss.state === 'stunned' ? 'AGORA! Chicoteie o chefe!' : text, W / 2, by + 15, W - 40);
  ctx.restore();
  if (boss.state === 'stunned' && Math.floor(t / 8) % 2 === 0) {
    const ax = boss.x + boss.w / 2 - camX, ay = boss.y - camY - 30 + Math.sin(t * 0.3) * 6;
    ctx.save(); ctx.fillStyle = '#FFD700'; ctx.strokeStyle = '#7A5C00'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(ax - 16, ay - 22); ctx.lineTo(ax + 16, ay - 22); ctx.lineTo(ax + 16, ay - 8); ctx.lineTo(ax + 26, ay - 8);
    ctx.lineTo(ax, ay + 14); ctx.lineTo(ax - 26, ay - 8); ctx.lineTo(ax - 16, ay - 8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}

// ===================== PARTE 2 — Fase, Biomas, Render, UI, Loop =====================
  // Usa símbolos da Parte 1: GAME_STATE, currentState, stateBeforePause, currentLevel, currentLevelIdx,
  // score, rapaduras, lives, health, maxHealth, tookDamageThisRun, collectedCajus, challengeTimeLeft,
  // challengeScore, currentChallengeSeed, bossIntroTimer, player, projectiles, keys, checkAABB,
  // AudioEngine, SaveManager, Enemy, Tonho, Boss*, createBoss.

  const P2C = document.getElementById('gameCanvas');
  const P2X = P2C.getContext('2d');
  const STEP_MS = (typeof FIXED_DELTA !== 'undefined') ? FIXED_DELTA : 1000 / 60;
  const IS_TOUCH = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
  const view = { x: 0, y: 0, px: 0, py: 0 };
  const fxParts = [];
  const fxTexts = [];
  let celebrateTimer = 0, frameCount = 0, challengeStartScore = 0, lastPauseToggle = 0;
  let mapWorld = 0, p2Acc = 0, p2Last = 0, lightBoost = 0;
  const $ = (id) => document.getElementById(id);
  const VW = () => P2C.width / (window.devicePixelRatio > 1 && P2C.dataset.dpr ? +P2C.dataset.dpr : 1);
  const VH = () => P2C.height / (window.devicePixelRatio > 1 && P2C.dataset.dpr ? +P2C.dataset.dpr : 1);

    function toast(msg) {
    const t = $('toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show'); t.classList.remove('hidden'); t.style.display = 'block';
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.classList.remove('show'); t.style.display = 'none'; }, 2200);
  }
  function showScreen(id, on) {
    const el = $(id); if (!el) return;
    el.classList.toggle('hidden', !on); el.classList.toggle('active', on);
    el.style.display = on ? 'flex' : 'none';
  }
  function hideAllScreens() {
    ['titleScreen', 'pauseScreen', 'victoryScreen', 'gameOverScreen', 'worldMapScreen', 'challengeResultScreen']
      .forEach((s) => showScreen(s, false));
    if (window.closeSettings && $('settingsModal') && $('settingsModal').classList.contains('open')) window.closeSettings();
  }
  function spawnBurst(x, y, color, n) {
    for (let i = 0; i < (n || 10); i++) {
      fxParts.push({ x, y, vx: (Math.random() - 0.5) * 6, vy: -Math.random() * 5 - 1, life: 40 + Math.random() * 20, color, s: 2 + Math.random() * 3 });
    }
  }
  function floatText(x, y, txt, color) { fxTexts.push({ x, y, txt, color: color || '#fff', life: 60 }); }
  function updateFx() {
    for (let i = fxParts.length - 1; i >= 0; i--) {
      const p = fxParts[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.2; if (--p.life <= 0) fxParts.splice(i, 1);
    }
    for (let i = fxTexts.length - 1; i >= 0; i--) { const t = fxTexts[i]; t.y -= 0.8; if (--t.life <= 0) fxTexts.splice(i, 1); }
  }
  function drawFx(ctx, camX, camY) {
    fxParts.forEach((p) => { ctx.globalAlpha = Math.min(1, p.life / 30); ctx.fillStyle = p.color; ctx.fillRect(p.x - camX, p.y - camY, p.s, p.s); });
    ctx.globalAlpha = 1; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center';
    fxTexts.forEach((t) => {
      ctx.globalAlpha = Math.min(1, t.life / 25); ctx.lineWidth = 3; ctx.strokeStyle = '#2a1400';
      ctx.strokeText(t.txt, t.x - camX, t.y - camY); ctx.fillStyle = t.color; ctx.fillText(t.txt, t.x - camX, t.y - camY);
    });
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
  }
  function playerBox() { return player ? { x: player.x, y: player.y, w: player.w || 32, h: player.h || 48 } : null; }
  function addScore(n) { score += n; if (currentState === GAME_STATE.CHALLENGE) challengeScore = score - challengeStartScore; }

  // ===================== OBJETOS DE FASE =====================
  class Rapadura {
    constructor(x, y) { this.x = x; this.y = y; this.w = 22; this.h = 18; this.collected = false; this.t = Math.random() * 6; }
    update() {
      if (this.collected) return; this.t += 0.08;
      if (player && checkAABB(this, playerBox())) {
        this.collected = true; rapaduras++; addScore(10); sfx('coin'); spawnBurst(this.x + 11, this.y + 9, '#e0a040', 6);
        if (rapaduras % 100 === 0) { lives++; floatText(this.x, this.y, '+1 VIDA!', '#7fff7f'); sfx('powerup'); }
      }
    }
    draw(ctx, cx, cy) {
      if (this.collected) return;
      const x = this.x - cx, y = this.y - cy + Math.sin(this.t) * 3;
      ctx.fillStyle = '#8a4a1a'; ctx.fillRect(x, y + 3, 22, 14);
      ctx.fillStyle = '#c47a32'; ctx.fillRect(x + 2, y, 18, 12);
      ctx.fillStyle = '#e8a85a'; ctx.fillRect(x + 4, y + 2, 7, 3);
      ctx.strokeStyle = '#5a2c08'; ctx.lineWidth = 1; ctx.strokeRect(x + 2.5, y + 0.5, 17, 11);
    }
  }

  class GoldenCaju {
    constructor(x, y, index) { this.x = x; this.y = y; this.w = 28; this.h = 32; this.index = index; this.t = 0;
      this.collected = !!(collectedCajus && collectedCajus[index]); }
    update() {
      if (this.collected) return; this.t += 0.05;
      if (player && checkAABB(this, playerBox())) {
        this.collected = true; collectedCajus[this.index] = true; addScore(500); sfx('caju');
        spawnBurst(this.x + 14, this.y + 16, '#ffd700', 18); floatText(this.x + 14, this.y, 'CAJU DE OURO!', '#ffd700'); updateHUD();
      }
    }
    draw(ctx, cx, cy) {
      if (this.collected) return;
      const x = this.x - cx + 14, y = this.y - cy + 18 + Math.sin(this.t * 2) * 4;
      ctx.save(); ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 14 + Math.sin(this.t * 4) * 6;
      ctx.fillStyle = '#ffcc22'; ctx.beginPath(); ctx.ellipse(x, y, 11, 13, 0, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = '#8a5a10'; ctx.beginPath(); ctx.ellipse(x, y - 15, 7, 4, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff6b0'; ctx.fillRect(x - 6, y - 7, 4, 6); ctx.restore();
    }
  }

  class AsaBrancaStar {
    constructor(x, y) { this.x = x; this.y = y; this.w = 30; this.h = 26; this.collected = false; this.t = 0; }
    update() {
      if (this.collected) return; this.t += 0.06;
      if (player && checkAABB(this, playerBox())) {
        this.collected = true; addScore(1000); sfx('powerup');
        player.starTimer = 600; player.asaBrancaTimer = 600; // v2.2: o poder da estrela agora funciona de verdade
        floatText(this.x, this.y, 'ASA BRANCA!', '#bfe9ff'); spawnBurst(this.x + 15, this.y + 13, '#ffffff', 20);
      }
    }
    draw(ctx, cx, cy) {
      if (this.collected) return;
      const x = this.x - cx + 15, y = this.y - cy + 13 + Math.sin(this.t * 2) * 5, f = Math.sin(this.t * 6) * 6;
      ctx.save(); ctx.shadowColor = '#bfe9ff'; ctx.shadowBlur = 16; ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - 10, y - 10 - f, x - 18, y - 2 - f); ctx.quadraticCurveTo(x - 8, y + 2, x, y + 4);
      ctx.quadraticCurveTo(x + 8, y + 2, x + 18, y - 2 - f); ctx.quadraticCurveTo(x + 10, y - 10 - f, x, y); ctx.fill();
      ctx.fillStyle = '#d0d0d0'; ctx.beginPath(); ctx.ellipse(x, y + 3, 4, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }

  class CampfireCheckpoint {
    constructor(x, y) { this.x = x; this.y = y; this.w = 34; this.h = 40; this.active = false; this.t = 0; }
    update() {
      this.t += 0.15;
      if (!this.active && player && checkAABB(this, playerBox())) {
        this.active = true; currentLevel.checkpoint = { x: this.x, y: this.y - 20 };
        health = maxHealth; // B13: NÃO reseta tookDamageThisRun
        sfx('checkpoint'); floatText(this.x + 17, this.y - 10, 'FOGUEIRA ACESA!', '#ffb347'); spawnBurst(this.x + 17, this.y + 20, '#ff8c00', 14); updateHUD();
      }
    }
    draw(ctx, cx, cy) {
      const x = this.x - cx, y = this.y - cy;
      ctx.fillStyle = '#5a3a1a'; ctx.save(); ctx.translate(x + 17, y + 36);
      ctx.rotate(0.3); ctx.fillRect(-16, -3, 32, 6); ctx.rotate(-0.6); ctx.fillRect(-16, -3, 32, 6); ctx.restore();
      ctx.fillStyle = '#777'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(x + 4 + i * 6.5, y + 38, 3.5, 0, 7); ctx.fill(); }
      if (this.active) {
        const fl = Math.sin(this.t) * 3;
        ctx.save(); ctx.shadowColor = '#ff8c00'; ctx.shadowBlur = 20;
        ctx.fillStyle = '#ff5a00'; ctx.beginPath(); ctx.moveTo(x + 5, y + 34); ctx.quadraticCurveTo(x + 17, y - 4 + fl, x + 29, y + 34); ctx.fill();
        ctx.fillStyle = '#ffd040'; ctx.beginPath(); ctx.moveTo(x + 11, y + 34); ctx.quadraticCurveTo(x + 17, y + 10 - fl, x + 23, y + 34); ctx.fill();
        ctx.restore();
      } else { ctx.fillStyle = '#444'; ctx.fillRect(x + 12, y + 28, 10, 4); }
    }
  }

  class Flagpole {
    constructor(x, y) { this.x = x; this.y = y; this.w = 20; this.h = 200; this.reached = false; this.flagY = 0; }
    update() {
      if (!this.reached && player && checkAABB(this, playerBox())) {
        this.reached = true;
        currentState = GAME_STATE.LEVEL_COMPLETE; // B15
        player.vx = 0; player.vy = 0; player.invulnerable = true; player.invulnTimer = 9999;
        celebrateTimer = 84; // 1,4s
        addScore(Math.max(100, Math.round((1 - (player.y - this.y) / this.h) * 2000)));
        sfx('victory'); spawnBurst(this.x + 10, player.y, '#ffd700', 30); floatText(this.x, this.y - 20, 'OXE! CHEGOU!', '#ffd700');
      }
      if (this.reached && this.flagY < this.h - 40) this.flagY += 3;
    }
    draw(ctx, cx, cy) {
      const x = this.x - cx, y = this.y - cy;
      ctx.fillStyle = '#6b4a2a'; ctx.fillRect(x + 8, y, 5, this.h);
      ctx.fillStyle = '#ffd700'; ctx.beginPath(); ctx.arc(x + 10.5, y, 6, 0, 7); ctx.fill();
      const fy = y + 8 + this.flagY, wv = Math.sin(frameCount * 0.15) * 3;
      ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.moveTo(x + 13, fy); ctx.lineTo(x + 55, fy + 12 + wv); ctx.lineTo(x + 13, fy + 26); ctx.fill();
      ctx.fillStyle = '#ffd700'; ctx.beginPath(); ctx.arc(x + 28, fy + 13, 5, 0, 7); ctx.fill();
    }
  }

  // ===================== MECÂNICAS DE BIOMA =====================
  function updateBiome() {
    const L = currentLevel; if (!L || !player) return;
    const pb = playerBox();
    // Plataformas que caem
    L.platforms.forEach((p) => {
      if (!p.falling) return;
      if (p.state === 'fallen') { if (--p.respawn <= 0) { p.state = 'idle'; p.y = p.origY; p.x = p.origX; p.fvy = 0; } return; }
      if (p.state === 'idle') {
        const on = pb.x + pb.w > p.x && pb.x < p.x + p.w && Math.abs(pb.y + pb.h - p.y) < 6 && (player.vy || 0) >= 0;
        if (on) { p.state = 'shake'; p.shake = 35; }
      } else if (p.state === 'shake') {
        p.x = p.origX + (Math.random() - 0.5) * 3; if (--p.shake <= 0) { p.state = 'drop'; p.x = p.origX; p.fvy = 0; }
      } else if (p.state === 'drop') {
        p.fvy = Math.min(12, p.fvy + 0.5); p.y += p.fvy;
        if (p.y > L.levelH + 200) { p.state = 'fallen'; p.respawn = 180; p.y = -99999; }
      }
    });
    // v2.2: correntes térmicas e vento ficam só na física do Tonho (antes eram aplicados 2x)
    // Gêiseres: aqui só o relógio; o empurrão acontece em Tonho.applyEnvironment
    L.geysers.forEach((g) => {
      g.t = (g.t || 0) + 1; const per = g.period || 180, on = g.onTime || 70, off = g.offset != null ? g.offset : (g.phase || 0);
      g.active = (g.t + off) % per < on;
      g.warn = !g.active && (g.t + off) % per > per - 45;
    });
    // Cipós pendulares
    L.vines.forEach((v) => {
      v.t = (v.t || 0) + 0.035; v.angle = Math.sin(v.t + (v.phase || 0)) * (v.amp || 0.8);
      const len = v.length || 160; v.tipX = v.x + Math.sin(v.angle) * len; v.tipY = v.y + Math.cos(v.angle) * len;
      if (player.onVine === v) {
        player.x = v.tipX - pb.w / 2; player.y = v.tipY - 10; player.vx = 0; player.vy = 0;
        if (keys.jumpJustPressed) {
          // v2.2: lança na direção do balanço (ou para onde o jogador aponta)
          const swing = Math.cos(v.t + (v.phase || 0)) * (v.amp || 0.8) * 0.035 * len;
          let dir = keys.right ? 1 : keys.left ? -1 : (Math.sign(swing) || player.facing || 1);
          player.onVine = null; player.vineCooldown = 24; player.vy = -10.5; player.vx = dir * clamp(4 + Math.abs(swing) * 1.2, 4, 7.5); player.facing = dir;
          player.jumpBuffer = 0; sfx('jump'); spawnLeaves(v.tipX, v.tipY, 6);
        }
      } else if (!player.onVine && !player.dead && !player.onGround && !(player.vineCooldown > 0) && checkAABB({ x: v.tipX - 18, y: v.tipY - 22, w: 36, h: 44 }, pb)) {
        player.onVine = v; sfx('vine'); spawnLeaves(v.tipX, v.tipY, 4);
      }
    });
    if (player.vineCooldown > 0) player.vineCooldown--;
    // Cristais de luz
    let target = 0;
    L.lightCrystals.forEach((c) => { c.t = (c.t || 0) + 0.05; const d = Math.hypot(c.x - (pb.x + pb.w / 2), c.y - (pb.y + pb.h / 2)); if (d < 130) { target = 130; c.lit = true; } });
    lightBoost += (target - lightBoost) * 0.05;
    // Maré
    if (L.tideConfig) {
      const tc = L.tideConfig, per = tc.period || 600;
      // v2.2: usa a amplitude real da fase (antes o padrão 90 deixava a maré acima do chão)
      L.currentTideY = (tc.baseY != null ? tc.baseY : L.levelH - 60) - Math.sin(frameCount / per * Math.PI * 2) * (tc.amp || tc.amplitude || 36);
      if (!player.dead && pb.y + pb.h > L.currentTideY + 26) {
        player.vy = -11.5; player.onGround = false; sfx('splash');
        for (let i = 0; i < 8; i++) spawnBurst(pb.x + pb.w / 2, L.currentTideY + 20, '#74C0FC', 1);
        player.takeDamage(1);
      }
    }
    if (typeof window !== 'undefined' && window.OxeHD && window.OxeHD.updateObstacles) {
      window.OxeHD.updateObstacles(L, player, keys, { GRAVITY, MAX_FALL_SPEED, getPlatforms, checkAABB, clamp, sfx, spawnDust, spawnSparks, floatText });
    }
  }

  // ===================== CONSTRUÇÃO DE FASE =====================
  function buildFromSpec(spec, idx) {
    const arr = (a) => Array.isArray(a) ? a : [];
    const L = {
      spec, idx, worldIdx: spec.worldIdx || 0, stageIdx: spec.stageIdx || 0, name: spec.name || 'Fase', code: spec.code || '',
      levelW: spec.levelW || 5200, levelH: spec.levelH || 540, width: spec.levelW || 5200, height: spec.levelH || 540, isChallenge: !!spec.isChallenge,
      platforms: arr(spec.platforms).map((p) => Object.assign({}, p, { origX: p.x, origY: p.y, state: 'idle' })),
      rapaduras: arr(spec.rapaduras || spec.coins).map((r) => new Rapadura(r.x, r.y)),
      cajus: arr(spec.cajus || spec.goldenCajus).map((c, i) => new GoldenCaju(c.x, c.y, c.index != null ? c.index : i)),
      stars: arr(spec.asaBrancaStars || spec.stars || spec.asaBrancas).map((s) => new AsaBrancaStar(s.x, s.y)),
      checkpoints: arr(spec.checkpoints || spec.campfires).map((c) => new CampfireCheckpoint(c.x, c.y)),
      enemies: [], boss: null,
      signs: arr(spec.signs).map((s) => Object.assign({}, s)), vines: arr(spec.vines).map((s) => Object.assign({}, s)),
      geysers: arr(spec.geysers).map((s) => Object.assign({}, s)), lightCrystals: arr(spec.lightCrystals).map((s) => Object.assign({}, s)),
      updrafts: arr(spec.updrafts), windZones: arr(spec.windZones).map((w) => Object.assign({}, w, { dir: w.dir || (w.fx != null ? Math.sign(w.fx) || 1 : 1) })),
      trampolines: arr(spec.trampolines).map((t) => Object.assign({}, t)),
      movingPlatforms: arr(spec.movingPlatforms).map((m) => Object.assign({}, m, { origX: m.x, origY: m.y, prevX: m.x, prevY: m.y, vx: 0, vy: 0, isMoving: true, oneWay: true, managedByGame: true })),
      hazardWheels: arr(spec.hazardWheels).map((w) => Object.assign({}, w, { baseX: w.baseX != null ? w.baseX : w.x, baseY: w.baseY != null ? w.baseY : w.y })),
      tideConfig: spec.tideConfig || null, currentTideY: 99999, darkness: !!spec.darkness || spec.worldIdx === 1,
      checkpoint: null, flagpole: null
    };
    L.movingPlatforms.forEach((mp) => L.platforms.push(mp));
    const sp = spec.spawn || spec.playerStart || { x: spec.respawnX != null ? spec.respawnX : 80, y: spec.respawnY != null ? spec.respawnY : 380 };
    L.spawn = { x: sp.x, y: sp.y }; L.checkpoint = { x: sp.x, y: sp.y };
    const fl = spec.flagpolePos || spec.flag || spec.flagpole || spec.goal;
    if (fl) { L.flagpole = new Flagpole(fl.x, fl.y); L.flag = L.flagpole; L.flagX = fl.x; }
    arr(spec.enemies).forEach((e) => { try { L.enemies.push(new Enemy(e.x, e.y, e.type, e)); } catch (err) { console.warn('Enemy', err); } });
    const bt = spec.bossType || (spec.boss && spec.boss.type);
    if (bt) {
      const b = spec.boss || {}; const bx = b.x != null ? b.x : 980, by = b.y != null ? b.y : 360;
      try { L.boss = createBoss(bt, bx, by); } catch (err) { console.warn('Boss', err); }
      bossIntroTimer = 150;
    }
    return L;
  }
  function createLevel(idx) { return buildFromSpec(window.OxeLevels.getLevelSpec(idx), idx); }
  function buildChallengeLevel(seedStr) { return buildFromSpec(window.OxeLevels.getChallengeSpec(seedStr), -1); }

  function spawnPlayerAt(pt) {
    player = new Tonho(pt.x, pt.y);
    player.invuln = 70; // v2.2: proteção real ao reaparecer
    screenShake = 0;
    view.x = view.px = Math.max(0, pt.x - VW() * 0.4); view.y = view.py = Math.max(0, Math.min(currentLevel.levelH - VH(), pt.y - VH() * 0.55));
  }
  function resetRunState(fresh) {
    maxHealth = (getSettings().assistMode || getSettings().assist) ? 5 : 3; health = maxHealth; tookDamageThisRun = false;
    collectedCajus = [false, false, false];
    if (fresh) { score = 0; rapaduras = 0; lives = 3; }
    if (Array.isArray(projectiles)) projectiles.length = 0;
    fxParts.length = 0; fxTexts.length = 0; celebrateTimer = 0; lightBoost = 0;
  }
  function startGame(idx, keepProgress) {
    idx = Math.max(0, Math.min(29, idx | 0));
    hideAllScreens(); resetRunState(!keepProgress);
    currentLevelIdx = idx; currentLevel = createLevel(idx);
    spawnPlayerAt(currentLevel.spawn); currentState = GAME_STATE.PLAYING;
    try { AudioEngine.playMusic && AudioEngine.playMusic(currentLevel.spec.music || 'baiao'); } catch (e) {}
    showScreen('hud', true); updateHUD();
  }
  function startChallenge(seed) {
    seed = seed || window.OxeLevels.getDailySeedString();
    hideAllScreens(); resetRunState(true); lives = 1;
    currentChallengeSeed = seed; currentLevelIdx = -1; currentLevel = buildChallengeLevel(seed);
    challengeTimeLeft = currentLevel.spec.timeLimit || 30; challengeStartScore = score; challengeScore = 0;
    spawnPlayerAt(currentLevel.spawn); currentState = GAME_STATE.CHALLENGE;
    try { AudioEngine.playMusic && AudioEngine.playMusic(currentLevel.spec.music); } catch (e) {}
    showScreen('hud', true); updateHUD();
  }
  function respawnAtCheckpoint() {
    hideAllScreens(); health = maxHealth; spawnPlayerAt(currentLevel.checkpoint || currentLevel.spawn);
    currentState = currentLevel.isChallenge ? GAME_STATE.CHALLENGE : GAME_STATE.PLAYING; updateHUD();
  }
  function loseLife() {
    sfx('hurt'); lives--;
    if (currentLevel.isChallenge) { endChallenge(); return; }
    if (lives <= 0) { showGameOver(); return; }
    respawnAtCheckpoint();
  }

  // ===================== RENDER: PARALLAX =====================
  const WORLD_PAL = [
    { sky: ['#ff9a3c', '#ffe08a'], sun: '#fff3b0', far: '#c9774a', mid: '#9a5a32', near: '#6b3d1f' },
    { sky: ['#120a1a', '#2c1c2e'], sun: '#6d4a7a', far: '#2a1a24', mid: '#3a2630', near: '#1a0f14' },
    { sky: ['#3f6b4a', '#a7c48a'], sun: '#e8f5c0', far: '#4a6b3a', mid: '#2f4f2a', near: '#1f3a1c' },
    { sky: ['#3fa3d8', '#bfe8f5'], sun: '#fffbe0', far: '#7fb3a8', mid: '#2f7a5a', near: '#1f4a3a' },
    { sky: ['#8a1f0a', '#ff7a2a'], sun: '#ffd27a', far: '#a8401a', mid: '#7a2a10', near: '#4a1608' },
    { sky: ['#2a1a10', '#8a6a3a'], sun: '#ff4a1a', far: '#5a4030', mid: '#3a2818', near: '#20140c' }
  ];
  function ridge(ctx, cx, factor, baseY, amp, freq, color, H, W) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, H);
    const off = cx * factor;
    for (let x = 0; x <= W + 20; x += 20) {
      const wx = x + off; const y = baseY - Math.abs(Math.sin(wx * freq)) * amp - Math.sin(wx * freq * 2.3 + 1) * amp * 0.3;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  }
  function drawParallax(ctx, camX, camY) {
    const W = VW(), H = VH(), wi = currentLevel ? currentLevel.worldIdx : 0, P = WORLD_PAL[wi] || WORLD_PAL[0];
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, P.sky[0]); g.addColorStop(1, P.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const yOff = -camY * 0.1;
    // Camada 1: sol/lua/estrelas
    if (wi === 1) {
      ctx.fillStyle = 'rgba(255,220,180,0.25)'; for (let i = 0; i < 40; i++) ctx.fillRect((i * 97 - camX * 0.02) % W + (i * 97 - camX * 0.02 < 0 ? W : 0), (i * 53) % (H * 0.5), 2, 2);
    } else {
      ctx.save(); ctx.shadowColor = P.sun; ctx.shadowBlur = 40; ctx.fillStyle = P.sun;
      ctx.beginPath(); ctx.arc(W * 0.78 - camX * 0.01, H * 0.2 + yOff, wi === 4 ? 70 : 45, 0, 7); ctx.fill(); ctx.restore();
      if (wi === 4) for (let i = 0; i < 8; i++) { ctx.fillStyle = 'rgba(255,200,90,0.35)'; ctx.beginPath(); ctx.arc(W * 0.1 + i * W * 0.11 - (camX * 0.015) % W, H * 0.12 + Math.sin(i) * 20, 10, 0, 7); ctx.fill(); }
    }
    // Camada 2: serras distantes
    ridge(ctx, camX, 0.1, H * 0.55 + yOff, 90, 0.004, P.far, H, W);
    // Camada 3: morros médios + props do bioma
    ridge(ctx, camX, 0.25, H * 0.7 + yOff * 2, 60, 0.007, P.mid, H, W);
    const off3 = camX * 0.4, spacing = 220;
    for (let i = -1; i < W / spacing + 2; i++) {
      const wx = Math.floor(off3 / spacing) + i, sx = wx * spacing - off3 + ((wx * 37) % 60), by = H * 0.78 + yOff * 3, s = 0.7 + ((wx * 13) % 5) / 10;
      ctx.fillStyle = P.near;
      if (wi === 0) { ctx.fillRect(sx, by - 70 * s, 12 * s, 70 * s); ctx.fillRect(sx - 14 * s, by - 50 * s, 8 * s, 26 * s); ctx.fillRect(sx - 14 * s, by - 30 * s, 20 * s, 7 * s); ctx.fillRect(sx + 14 * s, by - 60 * s, 8 * s, 30 * s); ctx.fillRect(sx + 6 * s, by - 36 * s, 16 * s, 7 * s); }
      else if (wi === 1) { ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx + 12 * s, 90 * s); ctx.lineTo(sx + 24 * s, 0); ctx.fill(); ctx.beginPath(); ctx.moveTo(sx + 60, H); ctx.lineTo(sx + 72, H - 70 * s); ctx.lineTo(sx + 84, H); ctx.fill(); }
      else if (wi === 2) { ctx.fillRect(sx, by - 110 * s, 10, 110 * s); ctx.beginPath(); ctx.ellipse(sx + 5, by - 115 * s, 40 * s, 26 * s, 0, 0, 7); ctx.fill(); ctx.strokeStyle = P.near; ctx.beginPath(); ctx.moveTo(sx + 20, by - 110 * s); ctx.quadraticCurveTo(sx + 30, by - 60 * s, sx + 22, by - 30 * s); ctx.stroke(); }
      else if (wi === 3) { ctx.save(); ctx.translate(sx, by); ctx.rotate(-0.15); ctx.fillRect(0, -120 * s, 8, 120 * s); for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.ellipse(4, -120 * s, 36 * s, 7, k * 0.7 - 1.4, 0, 7); ctx.fill(); } ctx.restore(); }
      else if (wi === 4) { ctx.fillRect(sx - 30 * s, by - 90 * s, 70 * s, 90 * s); ctx.fillStyle = P.mid; ctx.fillRect(sx - 34 * s, by - 94 * s, 78 * s, 8); }
      else { ctx.strokeStyle = P.near; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(sx, by); ctx.lineTo(sx, by - 80 * s); ctx.lineTo(sx - 25 * s, by - 110 * s); ctx.moveTo(sx, by - 60 * s); ctx.lineTo(sx + 28 * s, by - 95 * s); ctx.stroke(); ctx.lineWidth = 1; }
    }
    // Camada 4: chão próximo
    ridge(ctx, camX, 0.6, H * 0.88 + yOff * 4, 25, 0.012, P.near, H, W);
    if (wi === 1 || wi === 5) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, W, H); }
    if (wi === 2) { ctx.fillStyle = 'rgba(200,230,200,0.12)'; for (let i = 0; i < 3; i++) ctx.fillRect(0, H * 0.6 + i * 30 + Math.sin(frameCount * 0.01 + i) * 8, W, 18); }
  }

  // ===================== RENDER: PLATAFORMAS =====================
  const PLAT_STYLE = ['dirt', 'stone', 'wood', 'mangrove', 'basalt', 'stone'];
  function drawPlatforms(ctx, camX, camY) {
    if (!currentLevel) return;
    const W = VW(), H = VH(), wi = currentLevel.worldIdx;
    currentLevel.platforms.forEach((p) => {
      if (p.state === 'fallen') return;
      const x = Math.round(p.x - camX), y = Math.round(p.y - camY);
      if (x + p.w < 0 || x > W || y + p.h < 0 || y > H) return;
      const style = p.isRock ? 'rock' : (p.style || p.type || (p.falling ? 'wood' : PLAT_STYLE[wi]));
      if (style === 'wood' || style === 'mangrove') {
        ctx.fillStyle = style === 'wood' ? '#8b5a2b' : '#5a3e22'; ctx.fillRect(x, y, p.w, Math.min(p.h, 18));
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 0; k < p.w; k += 24) ctx.fillRect(x + k, y, 2, Math.min(p.h, 18));
        ctx.fillStyle = '#c8c8c8'; for (let k = 6; k < p.w; k += 24) { ctx.fillRect(x + k, y + 4, 2, 2); ctx.fillRect(x + k, y + 12, 2, 2); }
        if (style === 'mangrove') { ctx.strokeStyle = '#3a2614'; ctx.lineWidth = 3; for (let k = 10; k < p.w; k += 40) { ctx.beginPath(); ctx.moveTo(x + k, y + 18); ctx.quadraticCurveTo(x + k - 10, y + 40, x + k + 6, y + 60); ctx.stroke(); } ctx.lineWidth = 1; }
        if (p.h > 18) { ctx.fillStyle = '#5a3a1a'; ctx.fillRect(x + 6, y + 18, 6, p.h - 18); ctx.fillRect(x + p.w - 12, y + 18, 6, p.h - 18); }
      } else if (style === 'stone' || style === 'rock') {
        ctx.fillStyle = style === 'rock' ? '#8a7a6a' : (wi === 5 ? '#4a3a2a' : '#6a5a5a'); ctx.fillRect(x, y, p.w, p.h);
        ctx.fillStyle = style === 'rock' ? '#b0a08a' : 'rgba(255,255,255,0.12)'; ctx.fillRect(x, y, p.w, 5);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath();
        for (let k = 20; k < p.w; k += 46) { ctx.moveTo(x + k, y + 5); ctx.lineTo(x + k + 7, y + 16); ctx.lineTo(x + k + 2, y + 28); }
        for (let r = 22; r < p.h; r += 22) { ctx.moveTo(x, y + r); ctx.lineTo(x + p.w, y + r); }
        ctx.stroke(); if (style === 'rock') { ctx.strokeStyle = '#fff3c0'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, p.w - 2, p.h - 2); ctx.lineWidth = 1; }
      } else if (style === 'basalt') {
        ctx.fillStyle = '#2a1a18'; ctx.fillRect(x, y, p.w, p.h);
        ctx.fillStyle = '#3e2622'; for (let k = 0; k < p.w; k += 18) ctx.fillRect(x + k + 1, y + 2, 15, p.h - 2);
        ctx.fillStyle = 'rgba(255,90,20,' + (0.4 + Math.sin(frameCount * 0.05) * 0.2) + ')'; for (let k = 17; k < p.w; k += 36) ctx.fillRect(x + k, y + 4, 2, Math.min(p.h - 4, 30));
      } else {
        ctx.fillStyle = '#8a5a32'; ctx.fillRect(x, y, p.w, p.h);
        ctx.fillStyle = '#6b4024'; for (let k = 8; k < p.w; k += 30) for (let r = 14; r < p.h; r += 18) ctx.fillRect(x + k + (r % 12), y + r, 4, 3);
        ctx.fillStyle = wi === 0 ? '#b8a040' : '#5a8a3a'; ctx.fillRect(x, y, p.w, 6);
        for (let k = 2; k < p.w; k += 7) ctx.fillRect(x + k, y - 3 - (k * 7 % 4), 2, 4);
      }
      if (p.state === 'shake') { ctx.fillStyle = 'rgba(255,60,0,0.25)'; ctx.fillRect(x, y, p.w, Math.min(p.h, 18)); }
    });
  }

  // ===================== RENDER: EFEITOS DE BIOMA =====================
  let darkCanvas = null;
  function drawBiomeEffects(ctx, camX, camY) {
    const L = currentLevel; if (!L) return;
    const W = VW(), H = VH(), t = frameCount;
    L.updrafts.forEach((u) => {
      ctx.fillStyle = 'rgba(255,220,150,0.12)'; ctx.fillRect(u.x - camX, u.y - camY, u.w, u.h);
      ctx.strokeStyle = 'rgba(255,240,200,0.5)';
      for (let k = 0; k < 4; k++) { const ly = u.y + u.h - ((t * 3 + k * u.h / 4) % u.h); ctx.beginPath(); ctx.moveTo(u.x - camX + 6 + k * (u.w / 4), ly - camY); ctx.quadraticCurveTo(u.x - camX + 12 + k * (u.w / 4), ly - camY - 12, u.x - camX + 6 + k * (u.w / 4), ly - camY - 24); ctx.stroke(); }
    });
    L.windZones.forEach((wz) => {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; const d = wz.dir || 1;
      for (let k = 0; k < 6; k++) { const lx = wz.x + ((t * 4 * d + k * 97) % wz.w + wz.w) % wz.w, ly = wz.y + (k * 41) % wz.h; ctx.beginPath(); ctx.moveTo(lx - camX, ly - camY); ctx.lineTo(lx - camX - 30 * d, ly - camY); ctx.stroke(); }
    });
    // v2.2: o jato é desenhado exatamente onde ele empurra (antes aparecia no céu)
    L.geysers.forEach((g) => {
      const gw = g.w || 40, gh = g.h || g.height || 220, gx = g.x - camX, top = g.y - camY, base = Math.min(H - 6, g.y + gh - camY);
      ctx.fillStyle = '#3a2a22'; ctx.fillRect(gx - 6, base - 6, gw + 12, 12);
      if (g.active) {
        const gr = ctx.createLinearGradient(0, top, 0, base); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.35, 'rgba(255,230,200,0.45)'); gr.addColorStop(1, 'rgba(255,140,60,0.75)');
        ctx.fillStyle = gr; ctx.fillRect(gx + Math.sin(t * 0.3) * 2, top, gw, base - top);
        ctx.fillStyle = 'rgba(255,240,220,0.85)'; for (let k = 0; k < 8; k++) ctx.fillRect(gx + ((k * 13 + t) % gw), base - ((t * 7 + k * 47) % (base - top)), 4, 4);
      } else if (g.warn) {
        ctx.fillStyle = 'rgba(255,120,40,' + (0.35 + Math.sin(t * 0.5) * 0.3) + ')'; ctx.fillRect(gx, base - 26, gw, 20);
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; for (let k = 0; k < 3; k++) ctx.fillRect(gx + 8 + k * (gw / 3), base - 30 - ((t * 2 + k * 9) % 18), 4, 4);
      }
    });
    L.vines.forEach((v) => {
      if (v.tipX == null) return; const ax = v.x - camX, ay = v.y - camY, tx = v.tipX - camX, ty = v.tipY - camY;
      ctx.strokeStyle = '#4a6a2a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo((ax + tx) / 2 + 8, (ay + ty) / 2, tx, ty); ctx.stroke(); ctx.lineWidth = 1;
      ctx.fillStyle = '#7aa83a'; for (let k = 1; k < 6; k++) { const f = k / 6; ctx.beginPath(); ctx.ellipse(ax + (tx - ax) * f + (k % 2 ? 6 : -6), ay + (ty - ay) * f, 6, 3, k, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#c84a6a'; ctx.beginPath(); ctx.arc(tx, ty, 5, 0, 7); ctx.fill();
    });
    L.lightCrystals.forEach((c) => {
      const cx = c.x - camX, cy = c.y - camY, pulse = 0.6 + Math.sin(c.t || 0) * 0.4;
      ctx.save(); ctx.shadowColor = '#7fe8ff'; ctx.shadowBlur = 20 * pulse; ctx.fillStyle = c.lit ? '#bff4ff' : '#5ab8d8';
      ctx.beginPath(); ctx.moveTo(cx, cy - 18); ctx.lineTo(cx + 9, cy); ctx.lineTo(cx, cy + 14); ctx.lineTo(cx - 9, cy); ctx.fill(); ctx.restore();
    });
    L.signs.forEach((s) => {
      const sx = s.x - camX, sy = s.y - camY;
      ctx.fillStyle = '#5a3a1a'; ctx.fillRect(sx + 14, sy, 6, 40); ctx.fillStyle = '#a0703a'; ctx.fillRect(sx, sy - 22, 34, 24);
      ctx.strokeStyle = '#5a3a1a'; ctx.strokeRect(sx + 0.5, sy - 21.5, 33, 23); ctx.fillStyle = '#3a2008'; ctx.font = 'bold 14px sans-serif'; ctx.fillText('!', sx + 14, sy - 5);
    });
    // Maré
    if (L.tideConfig && L.currentTideY < 9999) {
      const ty = L.currentTideY - camY;
      for (let layer = 0; layer < 2; layer++) {
        ctx.fillStyle = layer ? 'rgba(30,110,140,0.55)' : 'rgba(80,170,200,0.35)'; ctx.beginPath(); ctx.moveTo(0, H);
        for (let x = 0; x <= W; x += 16) ctx.lineTo(x, ty + layer * 8 + Math.sin((x + camX) * 0.03 + t * 0.06 + layer) * 6);
        ctx.lineTo(W, H); ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; for (let x = (-(camX) % 60 + 60) % 60; x < W; x += 60) ctx.fillRect(x, ty + Math.sin((x + camX) * 0.03 + t * 0.06) * 6 - 1, 14, 2);
    }
    // Escuridão
    if (L.darkness && player) {
      if (!darkCanvas) darkCanvas = document.createElement('canvas');
      if (darkCanvas.width !== P2C.width || darkCanvas.height !== P2C.height) { darkCanvas.width = P2C.width; darkCanvas.height = P2C.height; }
      const d = darkCanvas.getContext('2d'); d.setTransform(P2C.width / W, 0, 0, P2C.height / H, 0, 0);
      d.globalCompositeOperation = 'source-over'; d.clearRect(0, 0, W, H); d.fillStyle = 'rgba(5,2,10,0.93)'; d.fillRect(0, 0, W, H);
      d.globalCompositeOperation = 'destination-out';
      const hole = (x, y, r) => { const rg = d.createRadialGradient(x, y, r * 0.2, x, y, r); rg.addColorStop(0, 'rgba(0,0,0,1)'); rg.addColorStop(1, 'rgba(0,0,0,0)'); d.fillStyle = rg; d.beginPath(); d.arc(x, y, r, 0, 7); d.fill(); };
      const pb = playerBox(); hole(pb.x + pb.w / 2 - camX, pb.y + pb.h / 3 - camY, 170 + lightBoost + Math.sin(t * 0.2) * 4);
      L.lightCrystals.forEach((c) => hole(c.x - camX, c.y - camY, (c.lit ? 120 : 70) + Math.sin(c.t || 0) * 8));
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(darkCanvas, 0, 0); ctx.restore();
    }
    // Balões das placas (acima da escuridão)
    if (player) {
      const pb = playerBox();
      L.signs.forEach((s) => {
        if (Math.abs(s.x + 17 - (pb.x + pb.w / 2)) > 140 || Math.abs(s.y - pb.y) > 200) return;
        const txt = (IS_TOUCH ? (s.textTouch || s.text) : (s.textKey || s.text)) || '';
        ctx.font = '15px sans-serif'; const lines = String(txt).split('\n'); const tw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 24, th = lines.length * 20 + 14;
        const bx = Math.max(6, Math.min(W - tw - 6, s.x - camX + 17 - tw / 2)), by = s.y - camY - 40 - th;
        ctx.fillStyle = 'rgba(255,248,225,0.96)'; ctx.strokeStyle = '#6b3d1f'; ctx.lineWidth = 2;
        ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx, by, tw, th, 10); else ctx.rect(bx, by, tw, th); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s.x - camX + 10, by + th); ctx.lineTo(s.x - camX + 17, by + th + 10); ctx.lineTo(s.x - camX + 24, by + th); ctx.fill();
        ctx.lineWidth = 1; ctx.fillStyle = '#3a2008'; lines.forEach((l, i) => ctx.fillText(l, bx + 12, by + 24 + i * 20));
      });
    }
    // Banner do Chefão
    if (bossIntroTimer > 0 && L.boss) {
      const a = Math.min(1, bossIntroTimer / 30, (150 - bossIntroTimer) / 20 + 0.01);
      ctx.save(); ctx.globalAlpha = Math.max(0, a); ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(0, H * 0.35, W, 90);
      ctx.fillStyle = '#ffd700'; ctx.fillRect(0, H * 0.35, W, 3); ctx.fillRect(0, H * 0.35 + 87, W, 3);
      ctx.textAlign = 'center'; ctx.font = 'bold 34px serif'; ctx.fillStyle = '#ffdf7a'; ctx.fillText(L.boss.name || 'CHEFÃO', W / 2, H * 0.35 + 48);
      ctx.font = 'italic 16px serif'; ctx.fillStyle = '#fff'; ctx.fillText(L.boss.title || 'Prepara o gibão, cabra!', W / 2, H * 0.35 + 74); ctx.restore();
    }
  }

  // ===================== HUD =====================
  function updateHUD() {
    const hb = $('heartsBox');
    if (hb) { let s = ''; for (let i = 0; i < maxHealth; i++) s += `<span class="heart${i < health ? '' : ' empty'}">${i < health ? '❤️' : '🤍'}</span>`; hb.innerHTML = s; }
    if ($('hudLives')) $('hudLives').textContent = `×${lives}`;
    if ($('hudScore')) $('hudScore').textContent = currentState === GAME_STATE.CHALLENGE ? `${challengeScore} · ⏱${Math.ceil(challengeTimeLeft)}s` : String(score).padStart(6, '0');
    if ($('hudRapaduras')) $('hudRapaduras').textContent = `×${rapaduras}`;
    for (let i = 0; i < 3; i++) { const c = $('caju' + (i + 1)); if (c) { c.classList.toggle('collected', !!(collectedCajus && collectedCajus[i])); c.style.opacity = collectedCajus && collectedCajus[i] ? '1' : '0.3'; } }
    if ($('hudStageName') && currentLevel) $('hudStageName').textContent = currentLevel.isChallenge ? 'DESAFIO DIÁRIO' : `${currentLevel.code} · ${currentLevel.name}`;
    const bb = $('bossBarContainer');
    if (bb) {
      const b = currentLevel && currentLevel.boss; const on = !!(b && !b.dead && b.hp > 0 && currentState !== GAME_STATE.LEVEL_COMPLETE);
      bb.style.display = on ? 'block' : 'none';
      if (on) { $('bossHpFill').style.width = Math.max(0, b.hp / (b.maxHp || b.hp) * 100) + '%'; $('bossName').textContent = b.name || 'Chefão'; }
    }
  }

  // ===================== PAUSA (B3/B4) =====================
  function togglePause() {
    if (currentState === GAME_STATE.PLAYING || currentState === GAME_STATE.CHALLENGE) {
      stateBeforePause = currentState; currentState = GAME_STATE.PAUSED;
      try { AudioEngine.pauseMusic(); } catch (e) {}
      showScreen('pauseScreen', true);
    } else if (currentState === GAME_STATE.PAUSED) {
      currentState = stateBeforePause || GAME_STATE.PLAYING;
      try { AudioEngine.resumeMusic(); } catch (e) {}
      showScreen('pauseScreen', false); if (window.closeSettings && $('settingsModal') && $('settingsModal').classList.contains('open')) window.closeSettings();
      p2Last = performance.now(); p2Acc = 0; consumeEdgeInputs();
    }
  }

  // ===================== SAVE HELPERS =====================
  // v2.2: lê o progresso do lugar certo (levelData/unlockedLevels). Antes as fases nunca destravavam no mapa.
  function starsOf(idx) {
    try { const lv = (SaveManager.data.levelData || {})[idx]; return lv ? (lv.stars | 0) : 0; } catch (e) { return 0; }
  }
  function isUnlocked(idx) {
    try { return idx === 0 || idx <= (SaveManager.data.unlockedLevels | 0) || starsOf(idx - 1) > 0; } catch (e) { return idx === 0; }
  }
  function getSettings() { return liveSettings(); }
  // v2.2: configurações têm uma fonte só (window.OxeSettings, no index.html)
  window.addEventListener('oxe:settings-changed', (e) => {
    const s = (e && e.detail) || getSettings(); const mh = s.assistMode ? 5 : 3;
    if (mh !== maxHealth) { maxHealth = mh; health = Math.min(Math.max(health, 1), maxHealth); if (mh === 5 && currentLevel) health = Math.max(health, 3); updateHUD(); }
  });

  // ===================== VITÓRIA / GAME OVER =====================
  function showVictoryScreen() {
    currentState = GAME_STATE.VICTORY || GAME_STATE.LEVEL_COMPLETE;
    let starsEarned = 1;
    if (collectedCajus && collectedCajus.filter(Boolean).length >= 3) starsEarned++;
    if (!tookDamageThisRun) starsEarned++; // B13
    try { SaveManager.recordClear(currentLevelIdx, starsEarned, collectedCajus.slice(), stageTimerSeconds); } catch (e) { console.warn(e); }
    const vs = $('victoryStars'); if (vs) vs.innerHTML = [0, 1, 2].map((i) => `<span class="star${i < starsEarned ? ' on' : ''}">${i < starsEarned ? '⭐' : '☆'}</span>`).join('');
    const vm = $('victoryMsg'); if (vm) vm.innerHTML = `Arretado, Tonho! <b>${currentLevel.code}</b> vencida.<br>Pontos: ${score} · Rapaduras: ${rapaduras} · Cajus: ${collectedCajus.filter(Boolean).length}/3${!tookDamageThisRun ? '<br>Sem tomar um arranhão!' : ''}`;
    const nb = $('btnNextStage'); if (nb) nb.style.display = currentLevelIdx < 29 ? '' : 'none';
    showScreen('victoryScreen', true); showScreen('bossBarContainer', false);
  }
  function showGameOver() {
    currentState = GAME_STATE.GAME_OVER; sfx('death');
    try { AudioEngine.pauseMusic(); } catch (e) {}
    showScreen('gameOverScreen', true);
  }
  function endChallenge() {
    if (currentState === GAME_STATE.CHALLENGE_RESULT) return;
    currentState = GAME_STATE.CHALLENGE_RESULT || GAME_STATE.GAME_OVER;
    challengeScore = Math.max(0, score - challengeStartScore + (currentLevel.flagpole && currentLevel.flagpole.reached ? Math.ceil(challengeTimeLeft) * 100 : 0));
    try { SaveManager.recordChallenge && SaveManager.recordChallenge(currentChallengeSeed, challengeScore); } catch (e) {}
    if ($('challengeStats')) $('challengeStats').innerHTML = `Pontos: <b>${challengeScore}</b><br>Rapaduras: <b>${rapaduras}</b><br>${currentLevel.flagpole && currentLevel.flagpole.reached ? 'Chegou no mastro! 🚩' : 'O tempo acabou, visse?'}`;
    if ($('challengeSeedInfo')) $('challengeSeedInfo').textContent = `Semente do Dia: ${currentChallengeSeed}`;
    try { AudioEngine.pauseMusic(); } catch (e) {}
    showScreen('challengeResultScreen', true);
  }

  // ===================== MAPA DE 6 MUNDOS =====================
  window.switchWorldMap = function (worldIdx) {
    mapWorld = Math.max(0, Math.min(5, worldIdx | 0));
    const WS = window.OxeLevels.WORLDS, W = WS[mapWorld];
    if ($('worldTitleText')) $('worldTitleText').textContent = `Mundo ${mapWorld + 1}: ${W.name}`;
    const tabs = $('worldTabs');
    if (tabs) {
      tabs.innerHTML = '';
      WS.forEach((w, i) => { const b = document.createElement('button'); b.className = 'world-tab' + (i === mapWorld ? ' active' : ''); b.textContent = i + 1; b.title = w.name; b.disabled = !isUnlocked(i * 5); b.onclick = () => window.switchWorldMap(i); tabs.appendChild(b); });
    }
    const grid = $('levelGrid'); if (!grid) return; grid.innerHTML = '';
    for (let s = 0; s < 5; s++) {
      const idx = mapWorld * 5 + s, st = W.stages[s], un = isUnlocked(idx), stars = starsOf(idx);
      const b = document.createElement('button'); b.className = 'level-btn' + (un ? '' : ' locked') + (s === 4 ? ' boss' : '');
      b.innerHTML = un ? `<div class="lvl-code">${st.code}</div><div class="lvl-name">${st.name}</div><div class="lvl-stars">${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>` : `<div class="lvl-code">🔒</div><div class="lvl-name">${st.code}</div>`;
      b.disabled = !un; if (un) b.onclick = () => { sfx('select'); startGame(idx); };
      grid.appendChild(b);
    }
  };
  function openMap() {
    hideAllScreens(); showScreen('hud', false); currentState = GAME_STATE.MAP || GAME_STATE.TITLE;
    try { AudioEngine.pauseMusic(); } catch (e) {}
    const w = currentLevelIdx >= 0 ? Math.floor(currentLevelIdx / 5) : mapWorld; window.switchWorldMap(w); showScreen('worldMapScreen', true);
  }

  // ===================== COMPARTILHAMENTO =====================
  const VERSOS = ['No sertão de sol a pino,\nTonho corre sem parar.', 'Rapadura no bornal,\nninguém pode me pegar!', 'Nove sóis queimando o chão,\nmas o cabra é de valor.', 'Quem duvida do Tonho\nvenha ver meu placar, senhor!'];
  function baseUrl() { return location.origin + location.pathname; }
  function challengeLink() { return `${baseUrl()}?desafio=${String(currentChallengeSeed || window.OxeLevels.getDailySeedString()).replace(/\D/g, '')}`; }
  async function shareOrCopy(url, title, text) {
    try { if (navigator.share) { await navigator.share({ title, text, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); toast('Link copiado! Manda pros cabras!'); } catch (e) { prompt('Copie o link:', url); }
  }
  function exportChallengeCard() {
    const cc = document.createElement('canvas'); cc.width = 1080; cc.height = 1920; const c = cc.getContext('2d');
    const g = c.createLinearGradient(0, 0, 0, 1920); g.addColorStop(0, '#ff7a1a'); g.addColorStop(0.55, '#ffd27a'); g.addColorStop(1, '#6b3d1f'); c.fillStyle = g; c.fillRect(0, 0, 1080, 1920);
    c.save(); c.shadowColor = '#fff3b0'; c.shadowBlur = 80; c.fillStyle = '#fff3b0'; c.beginPath(); c.arc(540, 420, 170, 0, 7); c.fill(); c.restore();
    c.fillStyle = '#5a2c08'; c.beginPath(); c.moveTo(0, 1500); for (let x = 0; x <= 1080; x += 40) c.lineTo(x, 1420 - Math.abs(Math.sin(x * 0.006)) * 140); c.lineTo(1080, 1920); c.lineTo(0, 1920); c.fill();
    c.fillStyle = '#2a1400'; [[160, 1380], [880, 1340]].forEach(([x, y]) => { c.fillRect(x, y - 200, 34, 200); c.fillRect(x - 40, y - 140, 22, 80); c.fillRect(x - 40, y - 82, 60, 20); c.fillRect(x + 50, y - 170, 22, 90); c.fillRect(x + 20, y - 100, 52, 20); });
    c.textAlign = 'center'; c.fillStyle = '#2a1400'; c.font = 'bold 130px serif'; c.fillText('OXE! 2.0', 540, 220);
    c.font = 'bold 54px serif'; c.fillText('DESAFIO DIÁRIO', 540, 700);
    c.fillStyle = '#fff'; c.strokeStyle = '#2a1400'; c.lineWidth = 10; c.font = 'bold 200px sans-serif'; c.strokeText(String(challengeScore), 540, 920); c.fillText(String(challengeScore), 540, 920);
    c.fillStyle = '#2a1400'; c.font = '56px sans-serif'; c.fillText(`🍬 ${rapaduras} rapaduras`, 540, 1020);
    c.font = 'bold 46px monospace'; c.fillText(`Semente: ${currentChallengeSeed}`, 540, 1100);
    c.font = 'italic 46px serif'; const vi = Math.abs((window.OxeLevels.hashSeed(String(currentChallengeSeed)) | 0)) % VERSOS.length;
    VERSOS[vi].split('\n').forEach((l, i) => c.fillText(l, 540, 1200 + i * 60));
    c.fillStyle = '#ffe9b0'; c.font = 'bold 44px sans-serif'; c.fillText('Tu consegue bater? Bora!', 540, 1700); c.font = '34px monospace'; c.fillText(challengeLink().replace(/^https?:\/\//, ''), 540, 1770);
    const title = 'OXE! 2.0 · Desafio Diário', text = `Fiz ${challengeScore} pontos no Desafio ${currentChallengeSeed}! Bate aí, cabra:`;
    const download = (blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `oxe-desafio-${String(currentChallengeSeed).replace(/\W/g, '')}.png`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('Cartão salvo!'); };
    cc.toBlob(async (blob) => {
      if (!blob) return;
      try {
        const file = new File([blob], 'oxe-desafio.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title, text, url: challengeLink() }); return; }
      } catch (e) { if (e && e.name === 'AbortError') return; }
      download(blob);
    }, 'image/png');
  }

  // ===================== LIGAÇÃO DE BOTÕES =====================
  function on(id, fn) { const el = $(id); if (el) el.addEventListener('click', (e) => { e.preventDefault(); sfx('select'); fn(e); }); }
  on('btnStartGame', () => { let next = 0; for (let i = 0; i < 30; i++) if (isUnlocked(i)) next = i; startGame(next); });
  on('btnOpenMap', openMap); on('btnCloseMap', () => { hideAllScreens(); showScreen('titleScreen', true); currentState = GAME_STATE.TITLE; });
  on('btnPauseHud', togglePause); on('btnResume', togglePause);
  on('btnRestart', () => { showScreen('pauseScreen', false); currentLevel.isChallenge ? startChallenge(currentChallengeSeed) : startGame(currentLevelIdx); });
  on('btnQuitMap', openMap); on('btnVictoryMap', openMap); on('btnGameOverMap', openMap);
  on('btnNextStage', () => startGame(Math.min(29, currentLevelIdx + 1), true));
  on('btnRestartFromCheckpoint', () => { lives = Math.max(lives, 3); respawnAtCheckpoint(); try { AudioEngine.resumeMusic(); } catch (e) {} });
  on('btnRestartFullLevel', () => startGame(currentLevelIdx));
  on('btnStartChallenge', () => startChallenge(window.OxeLevels.getDailySeedString()));
  on('btnRetryChallenge', () => startChallenge(currentChallengeSeed));
  on('btnCloseChallenge', () => { hideAllScreens(); showScreen('hud', false); showScreen('titleScreen', true); currentState = GAME_STATE.TITLE; });
  on('btnShareChallenge', exportChallengeCard);
  on('btnCopyChallengeLink', () => shareOrCopy(challengeLink(), 'OXE! 2.0 · Desafio', `Encara o Desafio ${currentChallengeSeed}!`));
  on('btnShareStage', () => { const i = Math.max(0, currentLevelIdx); shareOrCopy(`${baseUrl()}?fase=${Math.floor(i / 5) + 1}-${(i % 5) + 1}`, 'OXE! 2.0', `Joga a fase ${currentLevel ? currentLevel.code : ''} comigo!`); });
  // Título e pausa abrem as configurações pelo index.html; a engrenagem do HUD pausa antes
  on('btnSettingsHud', () => { if (currentState === GAME_STATE.PLAYING || currentState === GAME_STATE.CHALLENGE) togglePause(); if (window.openSettings) window.openSettings('hud'); });
  window.addEventListener('keydown', (e) => { if (e.repeat) return; if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') togglePause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && (currentState === GAME_STATE.PLAYING || currentState === GAME_STATE.CHALLENGE)) togglePause(); });

  // ===================== LOOP 60Hz =====================
  const finishChallenge = endChallenge;
  const handlePlayerDeath = loseLife;
  function updatePlayingCommon() {
    const L = currentLevel;
    stageTimerFrames++; if (stageTimerFrames % 60 === 0) stageTimerSeconds++;
    updateMovingPlatforms(L);
    if (player.update) player.update(L);
    if (player.dead) return; // animação de queda; o mundo congela
    updateBiome();
    const wb = player.whipTimer > 0 && player.getWhipBox ? player.getWhipBox() : null;
    L.enemies.forEach((e) => {
      if (e.dead) return;
      if (e.update) e.update(player, L);
      if (wb && !player.whipHitSet.has(e) && checkAABB(wb, e)) { player.whipHitSet.add(e); e.hit(1, player.x); }
      if (!e.dead && !player.dead && checkAABB(player, e)) {
        if (player.asaBrancaTimer > 0) { e.hit(3, player.x); }
        else if (player.vy > 0 && player.prevY + player.h <= e.y + 20 && e.canBeStomped()) { player.bounce(-9.5); e.hit(1, player.x); sfx("stomp"); }
        else if (e.state !== "stunned") { player.takeDamage(1, e.x + e.w / 2); }
      }
    });
    for (let i = L.enemies.length - 1; i >= 0; i--) if (L.enemies[i].remove) L.enemies.splice(i, 1);
    if (L.boss) {
      if (!L.boss.dead && L.boss.update) L.boss.update(player, L);
      if (!L.boss.dead && wb && !player.whipHitSet.has(L.boss) && checkAABB(wb, L.boss)) { player.whipHitSet.add(L.boss); L.boss.takeHit(1); }
      if (!L.boss.dead && checkAABB(player, L.boss)) {
        if (player.vy > 0 && player.prevY + player.h <= L.boss.y + 24 && L.boss.isVulnerable()) { player.bounce(-10.2); L.boss.takeHit(1); sfx("stomp"); }
        else if (L.boss.state !== "stunned") { player.takeDamage(1, L.boss.x + L.boss.w / 2); }
      }
      const bar = $("bossBarContainer"), fill = $("bossHpFill"), bname = $("bossName");
      if (bar) bar.style.display = L.boss.dead ? "none" : "flex";
      if (fill) fill.style.width = Math.max(0, (L.boss.hp / L.boss.maxHp) * 100) + "%";
      if (bname) bname.textContent = L.boss.name;
      if (L.boss.dead && L.boss.deathTimer <= 1 && currentState === GAME_STATE.PLAYING) {
        currentState = GAME_STATE.LEVEL_COMPLETE; celebrateTimer = 84;
        try { AudioEngine.playMusic("victory"); } catch (e) {}
      }
    }
    if (Array.isArray(projectiles)) { for (let i = projectiles.length - 1; i >= 0; i--) { const pr = projectiles[i]; if (pr.update) pr.update(L); if (pr.dead || pr.remove) projectiles.splice(i, 1); } }
    L.rapaduras.forEach((r) => r.update()); L.cajus.forEach((c) => c.update()); L.stars.forEach((s) => s.update()); L.checkpoints.forEach((c) => c.update());
    if (L.flagpole && (!L.boss || L.boss.dead || L.boss.hp <= 0)) L.flagpole.update();
    if (bossIntroTimer > 0) bossIntroTimer--;
    if (player.invulnTimer > 0 && !player.invulnerable) player.invulnTimer--;
    if (!player.dead && (player.y > L.levelH + 150 || health <= 0)) player.die();
  }
  // v2.2: plataformas móveis andam ANTES do Tonho e o levam junto (sem tremedeira)
  function updateMovingPlatforms(L) {
    const mps = L.movingPlatforms || [];
    for (const mp of mps) {
      mp.prevX = mp.x; mp.prevY = mp.y;
      mp.t = (mp.t || 0) + (mp.speed || 0.025);
      const off = Math.sin(mp.t + (mp.phase || 0)) * (mp.range || 90);
      if (mp.axis === 'y') mp.y = mp.origY + off; else mp.x = mp.origX + off;
      mp.vx = mp.x - mp.prevX; mp.vy = mp.y - mp.prevY;
      if (player && !player.dead && !player.onVine && player.onGround && player.vy >= 0 &&
          Math.abs(player.y + player.h - mp.prevY) <= 3 && player.x + player.w > mp.prevX + 2 && player.x < mp.prevX + mp.w - 2) {
        const ny = mp.y - player.h;
        player._carryDX = (player._carryDX || 0) + mp.vx; player._carryDY = (player._carryDY || 0) + (ny - player.y);
        player.x += mp.vx; player.y = ny;
      }
    }
  }
  let camLook = 0;
  function updateCamera() {
    if (!player || !currentLevel) return;
    view.px = view.x; view.py = view.y;
    const W = VW(), H = VH();
    // olhar um pouco à frente na direção do movimento, com suavidade
    const lookT = player.onVine ? 0 : clamp((player.facing || 1) * 50 + (player.vx || 0) * 8, -90, 90);
    camLook += (lookT - camLook) * 0.035;
    const tx = Math.max(0, Math.min(currentLevel.levelW - W, player.x + player.w / 2 - W * 0.42 + camLook)), ty = Math.max(0, Math.min(currentLevel.levelH - H, player.y - H * 0.55));
    const dx = tx - view.x;
    view.x += dx * (Math.abs(dx) > 220 ? 0.25 : 0.12); view.y += (ty - view.y) * 0.08;
  }
  function fixedUpdate() {
    frameCount++;
    if (screenShake > 0) { screenShake *= 0.86; if (screenShake < 0.35) screenShake = 0; } // v2.2: o tremor agora acaba
    if (currentState === GAME_STATE.PLAYING) { updatePlayingCommon(); updateCamera(); updateFx(); }
    else if (currentState === GAME_STATE.CHALLENGE) {
      updatePlayingCommon(); updateCamera(); updateFx();
      challengeScore = Math.max(0, score - challengeStartScore);
      challengeTimeLeft = Math.max(0, challengeTimeLeft - STEP_MS / 1000);
      if (currentState === GAME_STATE.CHALLENGE && challengeTimeLeft <= 0) endChallenge();
    } else if (currentState === GAME_STATE.LEVEL_COMPLETE) {
      if (player) { player.vx = 0; player.vy = 0; player.invulnerable = true; }
      if (currentLevel.flagpole) currentLevel.flagpole.update();
      updateFx(); if (frameCount % 8 === 0 && currentLevel.flagpole) spawnBurst(currentLevel.flagpole.x + Math.random() * 60 - 30, currentLevel.flagpole.y + Math.random() * 60, ['#ffd700', '#ff5a5a', '#5ad0ff'][frameCount % 3], 6);
      if (--celebrateTimer <= 0) { if (currentLevel.isChallenge) endChallenge(); else showVictoryScreen(); }
    }
    if (frameCount % 6 === 0) updateHUD();
    keys.jumpJustPressed = false; keys.whipJustPressed = false;
  }

  function render(alpha) {
    if (alpha === undefined) alpha = 1;
    const W = VW(), H = VH();
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    if (!currentLevel || !player) return;
    const L = currentLevel;
    let camX = view.px + (view.x - view.px) * alpha, camY = view.py + (view.y - view.py) * alpha;
    if (screenShake > 0.35 && currentState !== GAME_STATE.PAUSED) { const a = frameCount * 1.7; camX += Math.sin(a) * screenShake * 0.5; camY += Math.cos(a * 1.3) * screenShake * 0.5; }
    const dprR = +(P2C.dataset.dpr || 1) || 1;
    camX = Math.round(camX * dprR) / dprR; camY = Math.round(camY * dprR) / dprR;
    L._alpha = alpha;
    const draw = (e) => { if (e && e.draw && !e.removed) e.draw(ctx, camX, camY); };
    const HD = typeof window !== 'undefined' && window.OxeHD;
    if (HD && HD.drawParallaxHD) HD.drawParallaxHD(ctx, camX, camY, L, frameCount, W, H);
    else if (typeof drawParallax === 'function') drawParallax(ctx, camX, camY, L);
    if (HD && HD.drawPlatformsHD) HD.drawPlatformsHD(ctx, camX, camY, L, frameCount, W, H);
    else if (typeof drawPlatforms === 'function') drawPlatforms(ctx, camX, camY, L);
    if (HD && HD.drawObstacles) HD.drawObstacles(ctx, camX, camY, L, frameCount);
    if (typeof drawBiomeEffects === 'function') drawBiomeEffects(ctx, camX, camY, L);
    L.rapaduras.forEach((r) => { if (!r.collected && HD && HD.drawCollectibleHD) HD.drawCollectibleHD(ctx, camX, camY, r, 'rapadura', frameCount); else draw(r); });
    L.cajus.forEach((c) => { if (!c.collected && HD && HD.drawCollectibleHD) HD.drawCollectibleHD(ctx, camX, camY, c, 'caju', frameCount); else draw(c); });
    L.stars.forEach((s) => { if (!s.collected && HD && HD.drawCollectibleHD) HD.drawCollectibleHD(ctx, camX, camY, s, 'star', frameCount); else draw(s); });
    L.checkpoints.forEach((c) => { if (HD && HD.drawCollectibleHD) HD.drawCollectibleHD(ctx, camX, camY, c, 'checkpoint', frameCount); else draw(c); });
    if (L.flagpole && (!L.boss || L.boss.dead || L.boss.hp <= 0)) {
      if (HD && HD.drawCollectibleHD) HD.drawCollectibleHD(ctx, camX, camY, L.flagpole, 'flagpole', frameCount);
      else draw(L.flagpole);
    }
    L.enemies.forEach(draw);
    if (L.boss) { draw(L.boss); if (bossIntroTimer <= 0) drawBossGuide(ctx, L.boss, camX, camY); }
    if (Array.isArray(projectiles)) projectiles.forEach(draw);
    draw(player);
    if (typeof particles !== 'undefined' && Array.isArray(particles)) particles.forEach(draw);
    if (typeof drawFx === 'function') drawFx(ctx, camX, camY);
    if (typeof drawDarkness === 'function') drawDarkness(ctx, camX, camY, L);
    if (L.boss && bossIntroTimer > 0) {
      const a = Math.min(1, bossIntroTimer / 30);
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, H / 2 - 50, W, 100);
      ctx.fillStyle = '#FFD700'; ctx.font = 'bold 36px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(L.boss.name || 'CHEFE', W / 2, H / 2 - 10);
      ctx.fillStyle = '#FFF'; ctx.font = '16px sans-serif';
      ctx.fillText(L.boss.guideText || 'Prepare-se!', W / 2, H / 2 + 26, W - 40);
      ctx.restore();
    }
  }

  // v2.2: o renderAlpha local escondia o global, então o Tonho e os inimigos eram desenhados
  // sem interpolação enquanto a câmera era interpolada -> personagem "tremendo" na tela.
  let perfSamples = 0, perfSum = 0, lowQuality = false;
  function syncTouchVisibility() {
    const tc = $('touchControls'); if (!tc) return;
    const playing = currentState === GAME_STATE.PLAYING || currentState === GAME_STATE.CHALLENGE || currentState === GAME_STATE.LEVEL_COMPLETE;
    if (tc._playing !== playing) { tc._playing = playing; tc.classList.toggle('hidden-by-game', !playing); if (!playing) { keys.left = keys.right = keys.down = false; setJump(false); setWhip(false); } }
  }
  function startMainLoop() {
    const STEP = (typeof STEP_MS !== 'undefined') ? STEP_MS : 1000 / 60;
    let lastTime = performance.now(), accumulator = 0;
    function loop(now) {
      let dt = now - lastTime; lastTime = now;
      if (dt > 100) dt = 100; // evita "espiral" de atualizações depois de travadas
      const active = currentState !== GAME_STATE.PAUSED;
      if (active) {
        accumulator += dt;
        let steps = 0;
        while (accumulator >= STEP && steps < 5) { fixedUpdate(); accumulator -= STEP; steps++; }
        if (steps >= 5) accumulator = 0;
      } else accumulator = 0;
      renderAlpha = clamp(accumulator / STEP, 0, 1);
      render(renderAlpha);
      syncTouchVisibility();
      // Qualidade automática: celulares lentos perdem efeitos caros e resolução extra
      if (!lowQuality && (currentState === GAME_STATE.PLAYING || currentState === GAME_STATE.CHALLENGE) && dt < 100) {
        perfSum += dt; perfSamples++;
        if (perfSamples >= 150) { if (perfSum / perfSamples > 24) { lowQuality = true; window.OXE_LOW_QUALITY = true; if (window.OxeHD) window.OxeHD.lowQuality = true; resizeCanvas(); } perfSum = 0; perfSamples = 0; }
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  function levelIndexFromParam(str) {
    const m = /^(\d+)-(\d+)$/.exec(str || ''); if (!m) return -1;
    const w = parseInt(m[1], 10), s = parseInt(m[2], 10);
    if (typeof LEVELS !== 'undefined' && Array.isArray(LEVELS)) {
      const idx = LEVELS.findIndex((l) => l && l.world === w && l.stage === s);
      if (idx >= 0) return idx;
      const perWorld = Math.max(1, Math.round(LEVELS.length / 6));
      const guess = (w - 1) * perWorld + (s - 1);
      return guess >= 0 && guess < LEVELS.length ? guess : -1;
    }
    return clamp((w - 1) * 5 + (s - 1), 0, 29);
  }

  function boot() {
    const params = new URLSearchParams(window.location.search);
    const fase = params.get('fase'), desafio = params.get('desafio');
    if (desafio && /^\d{8}$/.test(desafio)) startChallenge('OXE-' + desafio);
    else if (fase && levelIndexFromParam(fase) >= 0) startGame(levelIndexFromParam(fase));
    else if (typeof showTitleScreen === 'function') showTitleScreen();
    else currentState = GAME_STATE.TITLE;
    startMainLoop();
  }

  window.__OXE_TEST__ = {
    getState: () => ({ currentState, stateBeforePause, currentLevelIdx, score, rapaduras, lives, health, maxHealth, tookDamageThisRun, collectedCajus, challengeTimeLeft, challengeScore, currentChallengeSeed }),
    getPlayer: () => player,
    getLevel: () => currentLevel,
    getEnemies: () => currentLevel ? currentLevel.enemies : [],
    getBoss: () => currentLevel ? currentLevel.boss : null,
    getProjectiles: () => projectiles,
    getShake: () => screenShake, getView: () => ({ x: view.x, y: view.y }), isUnlocked, starsOf, openMap,
    SaveManager, GAME_STATE,
    loadLevel: (idx) => startGame(idx),
    startChallenge: (seed) => startChallenge(seed),
    togglePause,
    injectInput: (inp) => { if ('jump' in inp) setJump(!!inp.jump); if ('whip' in inp) setWhip(!!inp.whip); Object.assign(keys, inp); if ('jump' in inp) keys.glide = !!inp.jump; },
    step: (n = 1) => { for (let i = 0; i < n; i++) fixedUpdate(); render(1); },
    Enemy, Tonho, BossBull, BossFulozinha, BossPapaFigo, BossSerpente, BossGuardiaoBrasa, BossSombraSeca, createBoss,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
