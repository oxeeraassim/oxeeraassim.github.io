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
// v3.0.1: ganchos registrados por nome (antes usava eval, que quebrava na versão publicada: morrer não levava ao game over)
const HOOKS = {};
function callHook(name, ...args) { const fn = HOOKS[name]; if (typeof fn === 'function') return fn(...args); }
// v3.0: 8 mundos × 7 fases (o mundo especial ★ é o 8º)
// v3.3: jogo 12% (mundo 1) a 20% (mundos finais) mais fácil, mantendo a subida de dificuldade
function oxeEase(d) { return Math.min(0.20, 0.12 + 0.012 * Math.max(0, d | 0)); }
const OXL = (typeof window !== 'undefined' && window.OxeLevels) || { TOTAL_LEVELS: 56, STAGES_PER_WORLD: 7, BOSS_STAGE: 6, WORLDS: [] };
const SPW = OXL.STAGES_PER_WORLD || 7, TOTAL_LV = OXL.TOTAL_LEVELS || 56, LAST_LV = TOTAL_LV - 1, SPECIAL_W = 7, SPECIAL_FIRST = SPECIAL_W * SPW;
function getPlatforms() { return (currentLevel && currentLevel.platforms) ? currentLevel.platforms : []; }

// ==================== SAVE MANAGER v3 ====================
const SaveManager = {
  KEY: 'oxe_save_v3', LEGACY_KEY: 'oxe_save_v2', TOTAL_LEVELS: TOTAL_LV,
  data: { version: 3, unlockedLevels: 0, levelData: {}, challengeHighScore: 0, dailyScores: {}, soundEnabled: true,
    settings: { touchSize: 'md', touchOpacity: 85, leftHanded: false, vibration: true, assistMode: false, reduceShake: false } },
  defaults() { return JSON.parse(JSON.stringify(this.data)); },
  init() {
    const base = this.defaults();
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) { const parsed = JSON.parse(raw); this.data = this.merge(base, parsed); if (!(parsed.version >= 4)) { this.migrate5to7(); this.save(); } }
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
    out.levelData = out.levelData || {}; out.dailyScores = out.dailyScores || {}; out.version = 4; return out;
  },
  // v3.0: os mundos tinham 5 fases e agora têm 7 (2 fases novas antes do chefe). Converte o progresso salvo.
  migrate5to7() {
    const map = (o) => { o = o | 0; const w = Math.floor(o / 5), st = o % 5; return w * SPW + (st === 4 ? SPW - 1 : st); };
    const ld = this.data.levelData || {}, nl = {};
    Object.keys(ld).forEach((k) => { nl[map(+k)] = ld[k]; });
    this.data.levelData = nl;
    this.data.unlockedLevels = map(this.data.unlockedLevels | 0);
    this.data.version = 4;
  },
  migrateV2(base, old) {
    const out = this.merge(base, {});
    const rawLvl = old.unlockedLevels ?? old.unlockedLevel ?? old.maxLevel ?? old.highestLevel ?? old.maxUnlocked ?? 0;
    out.unlockedLevels = clamp(Math.floor((rawLvl | 0) / 5) * SPW + ((rawLvl | 0) % 5 === 4 ? SPW - 1 : (rawLvl | 0) % 5), 0, this.TOTAL_LEVELS - 1);
    out.unlockedLevel = out.unlockedLevels;
    const ld = old.levelData || {};
    Object.keys(ld).forEach(k => { const d = ld[k] || {}; out.levelData[k] = { stars: d.stars | 0, cajus: Array.isArray(d.cajus) ? d.cajus.slice(0, 3) : [false, false, false], bestTime: d.bestTime || null, cleared: d.cleared !== undefined ? !!d.cleared : (d.stars | 0) > 0 }; });
    out.challengeHighScore = old.challengeHighScore | 0; out.dailyScores = old.dailyScores || {};
    out.soundEnabled = old.soundEnabled !== undefined ? !!old.soundEnabled : true;
    if (old.settings) out.settings = Object.assign(out.settings, old.settings);
    return out;
  },
  save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) {} },
  // o mundo especial (★) tem progresso próprio e não destrava os mundos normais
  unlockNext(levelIdx) { if (levelIdx >= SPECIAL_FIRST - 1 && levelIdx !== SPECIAL_FIRST - 1) { this.save(); return; } const n = Math.min(SPECIAL_FIRST, levelIdx + 1); if (n > this.data.unlockedLevels) this.data.unlockedLevels = n; this.save(); },
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
// v4.0: Esquadrão Sertanejo (Tonho + 6 Amigos jogáveis) + Montarias (Jegue e Bode Toddy) + União Suprema
let companion = null; let heroKind = 'tonho'; let duoJoined = false; let swapCd = 0; const jegueFlee = [];
let unionGauge = 0; let unionReady = false; let unionTimer = 0; let unionRelicSpawned = false;
const DUO_STAGES = (typeof window !== 'undefined' && window.OxeLevels && window.OxeLevels.DUO_STAGES) || {};
const HERO_META = {
  tonho:        { ico: '🤠', name: 'Tonho', label: 'Tonho', color: '#FFE066', def: 'chicote' },
  zefinha:      { ico: '👧', name: 'Zefinha', label: 'Zefinha', color: '#FFC9DE', def: 'pedrinha' },
  cabeca_vento: { ico: '🪁', name: 'Menino Cabeça de Vento', label: 'Menino Cabeça de Vento', color: '#74C0FC', def: 'estilingue' },
  galinha:      { ico: '🐔', name: 'Galinha Melindrosa', label: 'Galinha Melindrosa', color: '#FFD8A8', def: 'penas' },
  bode_toddy:   { ico: '🐐', name: 'Bode Toddy', label: 'Bode Toddy', color: '#D0BFFF', def: 'chifrada_toddy' },
  seu_lunga:    { ico: '🪗', name: 'Mestre Seu Lunga', label: 'Mestre Seu Lunga', color: '#FFE8A3', def: 'sanfona_fole' },
  tatu_bola:    { ico: '🦔', name: 'Tatu-Bola Cascudo', label: 'Tatu-Bola Cascudo', color: '#D8F5A2', def: 'giro_tatu' }
};
const WEAPON_ORDER = ['chicote', 'baleadeira', 'pandeiro', 'rojao', 'sanfona', 'porrete', 'laco', 'zabumba', 'candeeiro', 'chocalho', 'triangulo', 'peixeira', 'bacamarte', 'berimbau', 'rede'];
const ZEF_ORDER = ['pedrinha', 'presilha', 'chapeu', 'fita', 'sombrinha', 'espelho', 'boneca_pano', 'corda', 'bilro', 'cajuina'];
const CAB_ORDER = ['estilingue', 'pipa', 'chiclete', 'piao', 'bolinha_gude', 'bombinha', 'aviao_papel', 'ioio'];
const GAL_ORDER = ['penas', 'ciscar', 'ovo_ouro', 'cacarejo', 'bicada_furadeira', 'ninho_pintinhos', 'redemoinho_penas'];
const BOD_ORDER = ['chifrada_toddy', 'berro_bode', 'cabecada_sismica', 'coice_bode', 'lata_toddy', 'salto_cabrito', 'furia_toddy'];
const LUN_ORDER = ['sanfona_fole', 'resposta_braba', 'bengala_couro', 'cachimbo_fumaca', 'espora_prata', 'forro_trovao'];
const TAT_ORDER = ['giro_tatu', 'placa_casco', 'cavada_sertaneja', 'terremoto_tatu', 'espinho_mandacaru', 'tatu_foguete'];
const MOUNT_JEGUE_SLOTS = ['jegue_coice', 'jegue_disparada', 'jegue_zurro'];
const MOUNT_TODDY_SLOTS = ['toddy_investida', 'toddy_sismico', 'toddy_berro'];

const WEAPON_INFO = {
  // Tonho (15 armas)
  chicote:    { ico: '⚡', name: 'Chicote de Couro', style: 'Ponta do chicote dá ESTALO ×2 + corta tiros!' },
  baleadeira: { ico: '🪨', name: 'Baleadeira', ammo: 15, style: 'Tiro rápido que RICOCHETEIA para outro bicho!' },
  pandeiro:   { ico: '🥁', name: 'Pandeiro Bumerangue', ammo: 10, style: 'Vai e volta em curva e COLETA rapaduras!' },
  rojao:      { ico: '🎆', name: 'Rojão de São João', ammo: 6, style: 'Foguete pesado + 3 bombinhas de estalo!' },
  sanfona:    { ico: '🪗', name: 'Sanfona de 8 Baixos', ammo: 4, style: 'Onda 360° de forró + acorde de 3 notas!' },
  porrete:    { ico: '🪵', name: 'Porrete de Aroeira', ammo: 12, style: 'Pancada Dano 3 (quebra casco) + tremor no chão!' },
  laco:       { ico: '➰', name: 'Laço de Vaqueiro', ammo: 8, style: 'Amarra por 3s, PUXA o bicho e pega itens!' },
  zabumba:    { ico: '🪘', name: 'Zabumba Sísmica', ammo: 5, style: 'Ondas duplas pelo chão que JOGAM pro alto!' },
  candeeiro:  { ico: '🏮', name: 'Candeeiro a Querosene', ammo: 6, style: 'Explode e cria POÇA DE FOGO + ilumina tudo!' },
  chocalho:   { ico: '🔔', name: 'Chocalho de Cascavel', ammo: 5, style: 'Atordoa geral e deixa os bichos VULNERÁVEIS (+1 dano)!' },
  triangulo:  { ico: '🔺', name: 'Triângulo Perfurante', ammo: 10, style: 'Raio sonoro veloz que atravessa e ricocheteia!' },
  peixeira:   { ico: '🗡️', name: 'Peixeira de Aço', ammo: 14, style: 'Corte veloz + arremessa faca que atravessa 2 bichos!' },
  bacamarte:  { ico: '🎺', name: 'Bacamarte Sertanejo', ammo: 6, style: 'Disparo em leque de 5 balins + recuo que impulsiona!' },
  berimbau:   { ico: '🏹', name: 'Berimbau de Angola', ammo: 10, style: 'Onda sonora que rebate tiros + moeda dobrão teleguiada!' },
  rede:       { ico: '🕸️', name: 'Rede de Dormir', ammo: 7, style: 'Prende os inimigos na rede sonolenta por 4s!' },
  // Zefinha (10 armas)
  pedrinha:   { ico: '🪨', name: 'Pedrinhas', style: 'Tiro ágil infinito (a cada 3 tiros sai DUPLO!)' },
  presilha:   { ico: '📎', name: 'Presilha Dupla', ammo: 20, style: 'Dispara 2 grampos que atravessam até 3 bichos!' },
  chapeu:     { ico: '👒', name: 'Chapéu de Palha', ammo: 8, style: 'Bumerangue largo que junta rapaduras no ar!' },
  fita:       { ico: '🎀', name: 'Fita de Chita', ammo: 15, style: 'Chicotada + lança fita que amarra de longe!' },
  sombrinha:  { ico: '☂️', name: 'Sombrinha de Frevo', ammo: 6, style: 'Pulo no ar + escudo que REBATE tiros em dobro!' },
  espelho:    { ico: '🪞', name: 'Espelhinho de Sol', ammo: 6, style: 'Clarão solar longo que cega e queima assombração!' },
  boneca_pano:{ ico: '🪆', name: 'Boneca de Pano', ammo: 8, style: 'Atrai os bichos de perto e explode em estrelas de algodão!' },
  corda:      { ico: '🪢', name: 'Corda de Pular', ammo: 12, style: 'Giro duplo que rasteira todos ao redor e dá super salto!' },
  bilro:      { ico: '🧶', name: 'Bilros de Renda', ammo: 14, style: 'Dispara 3 bilros cruzados que prendem em teia de renda!' },
  cajuina:    { ico: '🍾', name: 'Garrafa de Cajuína', ammo: 5, style: 'Estoura espuma dourada que dá dano em área e +1 ❤️!' },
  // Menino Cabeça de Vento (8 armas de criança e travessuras)
  estilingue:   { ico: '🎯', name: 'Estilingue de Mamona', style: 'Tiro duplo de mamonas que quicam (Infinito!)' },
  pipa:         { ico: '🪁', name: 'Pipa Cortadeira', ammo: 10, style: 'Voa alto com linha de cerol e solta bombinhas lá de cima!' },
  chiclete:     { ico: '🫧', name: 'Chiclete Tutti-Frutti', ammo: 12, style: 'Bolha rosa gigante que GRUDA e prende os inimigos no ar!' },
  piao:         { ico: '陀', name: 'Pião de Fieira', ammo: 12, style: 'Roda furioso pelo chão acertando vários inimigos seguidos!' },
  bolinha_gude: { ico: '🔮', name: 'Bolinhas de Gude', ammo: 14, style: 'Solta 5 bolinhas de vidro que quicam e ricocheteiam por tudo!' },
  bombinha:     { ico: '🧨', name: 'Bombinha Estalinho', ammo: 10, style: 'Chuva de 4 estalinhos de São João que explodem em cadeia!' },
  aviao_papel:  { ico: '✈️', name: 'Aviãozinho de Papel', ammo: 15, style: 'Esquadrilha de 3 aviões de papel TELEGUIADOS nos bichos!' },
  ioio:         { ico: '🪀', name: 'Ioiô Coca-Cola', ammo: 14, style: 'Vai longe na linha, puxa rapaduras e acerta na ida e na volta!' },
  // Galinha Melindrosa (7 armas/habilidades)
  penas:            { ico: '🪶', name: 'Rajada de Penas', style: 'Lança 3 penas afiadas em leque (Infinito!)' },
  ciscar:           { ico: '🌪️', name: 'Ciscar Furioso 360°', ammo: 12, style: 'Cisca levantando pedras e MATANDO os inimigos ao redor!' },
  ovo_ouro:         { ico: '🥚', name: 'Ovo de Ouro Explosivo', ammo: 8, style: 'Bota um ovo dourado gigante que explode em gema solar!' },
  cacarejo:         { ico: '🐓', name: 'Cacarejo Supersônico', ammo: 8, style: 'Grito estridente que atordoa e empurra tudo na tela!' },
  bicada_furadeira: { ico: '⚡', name: 'Bicada Furadeira', ammo: 10, style: 'Voa girando como broca e atravessa qualquer inimigo!' },
  ninho_pintinhos:  { ico: '🐤', name: 'Esquadrão Pintinhos', ammo: 6, style: 'Chama 3 pintinhos valentes que correm bicando todo mundo!' },
  redemoinho_penas: { ico: '🌀', name: 'Tornado Melindroso', ammo: 6, style: 'Furacão de penas que avança jogando os bichos pro alto!' },
  // Bode Toddy (7 armas/habilidades quando jogável)
  chifrada_toddy:   { ico: '🐐', name: 'Chifrada Furiosa', style: 'Sai chifrando todo mundo em disparada invencível (Infinito!)' },
  berro_bode:       { ico: '📢', name: 'Berro Estrondoso', ammo: 10, style: 'Onda sonora BÉÉÉ que tonteia e apaga projéteis!' },
  cabecada_sismica: { ico: '💥', name: 'Cabeçada Sísmica', ammo: 8, style: 'Bate os chifres no chão abrindo 2 ondas de choque!' },
  coice_bode:       { ico: '🦵', name: 'Coice Giratório', ammo: 12, style: 'Coice duplo pra frente e pra trás com dano pesado!' },
  lata_toddy:       { ico: '🥫', name: 'Chuva de Latas', ammo: 12, style: 'Mastiga e cospe 4 latas metálicas que ricocheteiam!' },
  salto_cabrito:    { ico: '☄️', name: 'Salto Meteoro', ammo: 8, style: 'Pula nas nuvens e cai esmagando tudo embaixo!' },
  furia_toddy:      { ico: '🔥', name: 'Redemoinho de Chifres', ammo: 6, style: 'Gira em chamas chifrando tudo ao redor por 3 segundos!' },
  // Mestre Seu Lunga (6 armas)
  sanfona_fole:     { ico: '🪗', name: 'Fole de 8 Baixos', style: 'Rajada musical de forró que empurra e dá dano (Infinito!)' },
  resposta_braba:   { ico: '💬', name: 'Resposta Braba!', ammo: 10, style: 'Grita "PERGUNTA BESTA!" que explode com Dano 4!' },
  bengala_couro:    { ico: '🦯', name: 'Bengala de Jucá', ammo: 12, style: 'Pancada certeira Dano 3 que rebate qualquer tiro!' },
  cachimbo_fumaca:  { ico: '💨', name: 'Nuvem de Cachimbo', ammo: 8, style: 'Cortina de fumaça que deixa os bichos tontos e lentos!' },
  espora_prata:     { ico: '⚙️', name: 'Espora de Prata', ammo: 10, style: 'Arrancada cortante que atravessa a fila de inimigos!' },
  forro_trovao:     { ico: '🌩️', name: 'Forró do Trovão', ammo: 5, style: 'Toca um dobrado que faz cair 3 raios na cabeça dos bichos!' },
  // Tatu-Bola Cascudo (6 armas)
  giro_tatu:        { ico: '🦔', name: 'Bola de Canhão', style: 'Fecha o casco e sai rolando invencível nos bichos (Infinito!)' },
  placa_casco:      { ico: '🛡️', name: 'Placas de Casco', ammo: 12, style: 'Dispara 3 placas duras que quicam pelo cenário!' },
  cavada_sertaneja: { ico: '⛏️', name: 'Cavada Sertaneja', ammo: 10, style: 'Mergulha na terra e explode por baixo jogando pedras!' },
  terremoto_tatu:   { ico: '🌋', name: 'Terremoto Cascudo', ammo: 8, style: 'Pulo pesado que racha o chão e derruba geral!' },
  espinho_mandacaru:{ ico: '🌵', name: 'Explosão de Espinhos', ammo: 10, style: 'Dispara 8 espinhos em todas as direções!' },
  tatu_foguete:     { ico: '🚀', name: 'Tatu Foguete Turbo', ammo: 6, style: 'Giro supersônico em chamas que atravessa a tela inteira!' },
  // Ataques exclusivos das Montarias (só usados quando selecionados na barra!)
  jegue_coice:      { ico: '🫏', name: 'Coice Duplo do Jegue', isMountSlot: true, style: 'Patada forte pra frente e pra trás que joga longe!' },
  jegue_disparada:  { ico: '💨', name: 'Disparada do Jegue', isMountSlot: true, style: 'Sai correndo e atropelando tudo pela frente!' },
  jegue_zurro:      { ico: '📢', name: 'Zurro Sísmico (Ió-Ió!)', isMountSlot: true, style: 'Zurro ensurdecedor que atordoa os bichos ao redor!' },
  toddy_investida:  { ico: '🐐', name: 'Chifrada Montada', isMountSlot: true, style: 'Bode Toddy dispara chifrando tudo pelo caminho!' },
  toddy_sismico:    { ico: '💥', name: 'Pisão do Bode Toddy', isMountSlot: true, style: 'Salto com chifrada no chão que levanta ondas de choque!' },
  toddy_berro:      { ico: '📢', name: 'Berro Montado', isMountSlot: true, style: 'Berro sônico do Bode Toddy que limpa projéteis!' }
};
function isMountSlot(w) { return MOUNT_JEGUE_SLOTS.includes(w) || MOUNT_TODDY_SLOTS.includes(w); }
// v3.0: cada bicho tem uma fraqueza (dano dobrado). 'pisao' = pular em cima.
const WEAKNESS = {
  calango: 'chicote', tatu: 'porrete', carcara: 'baleadeira', morcego: 'candeeiro', cacto_atirador: 'porrete', bode_doido: 'laco',
  fulozinha: 'pandeiro', papa_figo: 'candeeiro', caranguejo: 'porrete', baiacu: 'baleadeira', salamandra: 'zabumba', sapo_cururu: 'pisao',
  marimbondo: 'candeeiro', jararaca: 'porrete', cangaceiro_sombra: 'candeeiro', mula_sem_cabeca: 'laco', boitata_fogo: 'sanfona',
  lobisomem: 'triangulo', escorpiao: 'pisao', urubu: 'baleadeira', jacare: 'zabumba',
  prea: 'chicote', cascavel: 'baleadeira', caititu: 'laco', lacraia: 'chicote', onca_pintada: 'rojao', rola_bosta: 'pisao', teju: 'zabumba',
  ararinha_azul: 'pandeiro', rasga_mortalha: 'candeeiro', alamoa: 'candeeiro', cumacanga: 'triangulo', muricoca: 'chocalho',
  caipora: 'candeeiro', cabra_cabriola: 'laco', perna_cabeluda: 'porrete', cabeca_de_cuia: 'baleadeira', labatut: 'rojao', quibungo: 'zabumba'
};
// v3.1: fraquezas para as armas da Zefinha e novos amigos
const WEAKNESS_Z = {
  carcara: 'presilha', prea: 'presilha', rasga_mortalha: 'presilha', urubu: 'presilha', baiacu: 'presilha',
  ararinha_azul: 'chapeu', marimbondo: 'chapeu', morcego: 'chapeu', boitata_fogo: 'chapeu', calango: 'chapeu',
  caititu: 'fita', muricoca: 'fita', fulozinha: 'fita', bode_doido: 'fita', mula_sem_cabeca: 'fita', cabra_cabriola: 'fita',
  cumacanga: 'sombrinha', salamandra: 'sombrinha', cacto_atirador: 'sombrinha',
  alamoa: 'espelho', cangaceiro_sombra: 'espelho', lobisomem: 'espelho', papa_figo: 'espelho', caipora: 'espelho'
};
function isWeak(t, w) { if (w === 'patada' || w === 'jegue_coice' || w === 'coice_bode') w = 'pisao'; return !!w && (WEAKNESS[t] === w || WEAKNESS_Z[t] === w || w === 'uniao'); }
const WEAK_ICON = { pisao: '👟' };
function weakIcon(t) { const w = (player && player.hero === 'zefinha' && WEAKNESS_Z[t]) || WEAKNESS[t]; return w ? (WEAK_ICON[w] || (WEAPON_INFO[w] || {}).ico || '') : ''; }
// v3.1: fantasias (bônus por tempo, a partir do Mundo 2)
const COSTUME_FRAMES = 40 * 60;
// v3.1: especiais por tempo (só nas fases difíceis) — e quando pega, chega uma leva de bichos brabos
const SPECIAL_FRAMES = 20 * 60;
const SPECIAL_INFO = { milho: { ico: '🌽', name: 'Metralhadora de milho' }, pamonha: { ico: '🫔', name: 'Canhão de pamonha' }, tapioca: { ico: '🥞', name: 'Tapioca grudenta' } };
const COSTUME_INFO = { cacto: { ico: '🌵', name: 'Mandacaru' }, boi: { ico: '🐂', name: 'Boi-Bumbá' }, sol: { ico: '☀️', name: 'Sol do Sertão' } };

let inventory = {}; let selectedWeapon = 'chicote';
let zefInv = {}; let zefSel = 'pedrinha';
let cabInv = {}; let cabSel = 'estilingue';
let galInv = {}; let galSel = 'penas';
let bodInv = {}; let bodSel = 'chifrada_toddy';
let lunInv = {}; let lunSel = 'sanfona_fole';
let tatInv = {}; let tatSel = 'giro_tatu';
const heroInvs = { tonho: inventory, zefinha: zefInv, cabeca_vento: cabInv, galinha: galInv, bode_toddy: bodInv, seu_lunga: lunInv, tatu_bola: tatInv };
const heroSels = { tonho: 'chicote', zefinha: 'pedrinha', cabeca_vento: 'estilingue', galinha: 'penas', bode_toddy: 'chifrada_toddy', seu_lunga: 'sanfona_fole', tatu_bola: 'giro_tatu' };
const HERO_ORDERS = { tonho: WEAPON_ORDER, zefinha: ZEF_ORDER, cabeca_vento: CAB_ORDER, galinha: GAL_ORDER, bode_toddy: BOD_ORDER, seu_lunga: LUN_ORDER, tatu_bola: TAT_ORDER };
function invOf(h) {
  const k = (h && h.hero) || 'tonho';
  if (k === 'tonho') return inventory;
  if (k === 'zefinha') return zefInv;
  if (k === 'cabeca_vento') return cabInv;
  if (k === 'galinha') return galInv;
  if (k === 'bode_toddy') return bodInv;
  if (k === 'seu_lunga') return lunInv;
  if (k === 'tatu_bola') return tatInv;
  return heroInvs[k] || (heroInvs[k] = {});
}
function selOf(h) {
  const k = (h && h.hero) || 'tonho';
  if (k === 'tonho') return selectedWeapon;
  if (k === 'zefinha') return zefSel;
  if (k === 'cabeca_vento') return cabSel;
  if (k === 'galinha') return galSel;
  if (k === 'bode_toddy') return bodSel;
  if (k === 'seu_lunga') return lunSel;
  if (k === 'tatu_bola') return tatSel;
  return heroSels[k] || defOf(h);
}
function setSel(h, w) {
  const k = (h && h.hero) || 'tonho';
  if (k === 'tonho') selectedWeapon = w;
  else if (k === 'zefinha') zefSel = w;
  else if (k === 'cabeca_vento') cabSel = w;
  else if (k === 'galinha') galSel = w;
  else if (k === 'bode_toddy') bodSel = w;
  else if (k === 'seu_lunga') lunSel = w;
  else if (k === 'tatu_bola') tatSel = w;
  else heroSels[k] = w;
}
function defOf(h) { const k = (h && h.hero) || 'tonho'; return (HERO_META[k] && HERO_META[k].def) || 'chicote'; }
function orderOf(h) {
  const k = (h && h.hero) || 'tonho';
  const base = HERO_ORDERS[k] || WEAPON_ORDER;
  if (h && h.mount) {
    const mSlots = h.mount.type === 'bode_toddy' ? MOUNT_TODDY_SLOTS : MOUNT_JEGUE_SLOTS;
    return base.concat(mSlots.filter((s) => !base.includes(s)));
  }
  return base;
}
let heldWeapon = null; // compatibilidade (não usado)
let stompCombo = 0;
let heldArmor = 0;     // gibão de couro: aguenta 1 golpe
const sanfonaRings = [];

function liveSettings() { try { if (window.OxeSettings && window.OxeSettings.get) return window.OxeSettings.get(); } catch (e) {} return SaveManager.data.settings || {}; }
function triggerHaptic(ms = 20) { if (liveSettings().vibration !== false && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} } }
// v2.2: tremor curto e com decaimento (antes nunca zerava e a tela tremia para sempre)
function addScreenShake(amount) { const a = Math.min(5, liveSettings().reduceShake ? amount * 0.2 : amount * 0.42); screenShake = Math.max(screenShake, a); }

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

// v2.3: controle de toque refeito. Antes os botões PULAR e CHICOTE tinham pointer-events:none no CSS
// e o código escutava direto neles -> nunca recebiam o toque. Agora cada zona escuta os dedos
// (multitoque, dá para deslizar o polegar entre os botões) e escolhe o botão mais próximo.
const TouchController = {
  fingers: new Map(), // pointerId -> { zone, action }
  init() {
    ['dpadZone', 'actionZone'].forEach((zid) => {
      const zone = document.getElementById(zid); if (!zone) return;
      zone.style.touchAction = 'none';
      const down = (e) => { e.preventDefault(); try { zone.setPointerCapture(e.pointerId); } catch (_) {} this.fingers.set(e.pointerId, { zone: zid, action: this.pick(zid, e.clientX, e.clientY) }); this.apply(true); };
      const move = (e) => { const f = this.fingers.get(e.pointerId); if (!f) return; e.preventDefault(); const a = this.pick(zid, e.clientX, e.clientY); if (a !== f.action) { f.action = a; this.apply(false); } };
      const up = (e) => { if (!this.fingers.has(e.pointerId)) return; this.fingers.delete(e.pointerId); this.apply(false); };
      if (window.PointerEvent) {
        zone.addEventListener('pointerdown', down); zone.addEventListener('pointermove', move);
        zone.addEventListener('pointerup', up); zone.addEventListener('pointercancel', up); zone.addEventListener('lostpointercapture', up);
      } else { // navegadores antigos: eventos de toque
        const wrap = (fn) => (ev) => { ev.preventDefault(); for (const t of ev.changedTouches) fn({ pointerId: 't' + t.identifier, clientX: t.clientX, clientY: t.clientY, preventDefault() {} }); };
        zone.addEventListener('touchstart', wrap(down), { passive: false }); zone.addEventListener('touchmove', wrap(move), { passive: false });
        zone.addEventListener('touchend', wrap(up), { passive: false }); zone.addEventListener('touchcancel', wrap(up), { passive: false });
      }
      zone.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  },
  center(id) { const el = document.getElementById(id); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; },
  pick(zid, x, y) {
    if (zid === 'dpadZone') {
      const candidates = [];
      const u = this.center('dpadUp'), d = this.center('dpadDown'), l = this.center('dpadLeft'), r = this.center('dpadRight');
      if (l) candidates.push({ id: 'left', dist: Math.hypot(x - l.x, y - l.y) });
      if (r) candidates.push({ id: 'right', dist: Math.hypot(x - r.x, y - r.y) });
      if (u) candidates.push({ id: 'up', dist: Math.hypot(x - u.x, y - u.y) });
      if (d) candidates.push({ id: 'down', dist: Math.hypot(x - d.x, y - d.y) });
      if (candidates.length) {
        candidates.sort((a, b) => a.dist - b.dist);
        return candidates[0].id;
      }
      return 'left';
    }
    const J = this.center('btnJump'), W = this.center('btnWhip'); if (!J) return 'jump';
    if (!W) return 'jump';
    return Math.hypot(x - W.x, y - W.y) < Math.hypot(x - J.x, y - J.y) * 0.9 ? 'whip' : 'jump';
  },
  apply(isPress) {
    const on = { left: false, right: false, up: false, down: false, jump: false, whip: false };
    this.fingers.forEach((f) => { if (f.action) on[f.action] = true; });
    keys.left = on.left && !on.right; keys.right = on.right && !on.left;
    keys.up = on.up && !on.down; keys.down = on.down && !on.up;
    const wasJump = keys.jump, wasWhip = keys.whip;
    setJump(on.jump); setWhip(on.whip);
    if (isPress && ((on.jump && !wasJump) || (on.whip && !wasWhip))) triggerHaptic(10);
    [['dpadLeft', keys.left], ['dpadRight', keys.right], ['dpadUp', keys.up], ['dpadDown', keys.down], ['btnJump', on.jump], ['btnWhip', on.whip]].forEach(([id, a]) => { const el = document.getElementById(id); if (el) el.classList.toggle('active', !!a); });
  },
  reset() { this.fingers.clear(); this.apply(false); }
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
    const k = clamp(this.life / this.maxLife, 0, 1); ctx.globalAlpha = k; ctx.fillStyle = this.color; ctx.beginPath(); ctx.arc(x, y, Math.max(0.8, this.size * (0.35 + 0.25 * k)), 0, 6.283); ctx.fill(); ctx.globalAlpha = 1; // v2.4: partículas redondas e que encolhem
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
const PROJ_STYLE = { spine: ['#E9D8A6', 6, 6], leaf: ['#51CF66', 12, 8], miasma: ['#9C36B5', 16, 16], fire: ['#FF6B1A', 14, 14], water: ['#4DABF7', 14, 10], ember: ['#FFA94D', 10, 10], shockwave: ['#FFD8A8', 28, 18], pedra: ['#8D8173', 10, 10], bone: ['#F1F3F5', 14, 7], slash: ['rgba(255,255,255,0.9)', 40, 30], pandeiro: ['#F8E1A8', 22, 22], rojao: ['#E03131', 22, 10],
  // v3.0 & v4.0
  laco: ['#C9A26B', 26, 20], milho: ['#FFD43B', 9, 9], pamonha: ['#C9E265', 22, 16], tapioca: ['#F8F0E3', 20, 10], presilha: ['#F06595', 16, 8], chapeu: ['#E9C46A', 30, 16], zwave: ['#FFE8A3', 34, 24], candeeiro: ['#FFB347', 14, 16], nota: ['#E7F5FF', 18, 14], pedrinha: ['#A89F94', 8, 8],
  bosta: ['#6B4A2B', 20, 20], semente: ['#7A5230', 8, 8], fita: ['#F06595', 16, 8], estalo: ['#FFD43B', 10, 10], fireZone: ['#FF6B1A', 54, 16],
  peixeira: ['#DEE2E6', 24, 10], bacamarte: ['#FFD43B', 9, 9], berimbau: ['#FFD43B', 16, 16], rede: ['#F8F0E3', 30, 22],
  boneca_pano: ['#F06595', 22, 26], corda: ['#E9C46A', 32, 16], bilro: ['#F8F0E3', 18, 10], cajuina: ['#FCC419', 16, 20],
  pipa: ['#FF6B6B', 28, 28], chiclete: ['#FF85C0', 22, 22], piao: ['#FAB005', 20, 20], bolinha_gude: ['#3BC9DB', 12, 12],
  bombinha: ['#E03131', 12, 12], aviao_papel: ['#FFFFFF', 22, 12], ioio: ['#E03131', 18, 18],
  penas: ['#FFD43B', 18, 8], ovo_ouro: ['#FFD43B', 20, 24], pintinho: ['#FFE066', 18, 18], redemoinho_penas: ['#FFF3BF', 44, 58],
  lata_toddy: ['#ADB5BD', 16, 18], resposta_braba: ['#FFE066', 36, 24], placa_casco: ['#C9A26B', 18, 14], espinho_mandacaru: ['#51CF66', 14, 8] };
class Projectile {
  constructor(x, y, vx, vy, type = 'spine', opts = {}) {
    const st = PROJ_STYLE[type] || PROJ_STYLE.spine;
    this.type = type; this.color = st[0]; this.w = opts.w || st[1]; this.h = opts.h || st[2];
    this.x = x - this.w / 2; this.y = y - this.h / 2; this.prevX = this.x; this.prevY = this.y; this.vx = vx; this.vy = vy;
    this.gravity = opts.gravity || 0; this.life = opts.life || 240; this.hostile = opts.hostile !== false; this.damage = opts.damage || 1; this.dead = false; this.t = 0; this.weapon = opts.weapon || null;
    this.bounces = opts.bounces || 0;
    if (type === 'shockwave') { this.groundY = opts.groundY !== undefined ? opts.groundY : y + this.h / 2; this.y = this.groundY - this.h; this.prevY = this.y; }
  }
  update() {
    this.prevX = this.x; this.prevY = this.y; this.t++;
    if (this.type === 'leaf') this.vy += Math.sin(this.t * 0.2) * 0.08;
    const own = this.owner || player;
    if ((this.type === 'pandeiro' || this.type === 'chapeu' || this.type === 'ioio') && own) { // vai e volta como bumerangue/ioiô e coleta rapaduras!
      if (currentLevel && Array.isArray(currentLevel.rapaduras)) {
        for (const r of currentLevel.rapaduras) if (!r.collected && checkAABB(this, r)) r.update();
      }
      const turnT = this.type === 'ioio' ? 12 : 16;
      if (this.t > turnT) {
        const dx = own.x + own.w / 2 - (this.x + this.w / 2), dy = own.y + 16 - (this.y + this.h / 2), d = Math.hypot(dx, dy) || 1;
        const pull = this.type === 'ioio' ? 1.4 : 0.95;
        this.vx += (dx / d) * pull; this.vy += (dy / d) * pull;
        const sp = Math.hypot(this.vx, this.vy); if (sp > 11) { this.vx *= 11 / sp; this.vy *= 11 / sp; }
        if (d < 26) {
          this.dead = true;
          if (this.type === 'pandeiro' && own === player) {
            own._pandeiroCatch = ((own._pandeiroCatch || 0) + 1);
            if (own._pandeiroCatch % 2 === 0) {
              inventory.pandeiro = (inventory.pandeiro | 0) + 1;
              spawnFloatingText('PEGOU NO COMPASSO! +1 🥁', own.x + own.w / 2, own.y - 16, '#FFE066');
              updateWeaponUI();
            }
          }
        }
      } else {
        this.vx -= (this.dir || Math.sign(this.vx) || 1) * 0.22;
        if (this.type !== 'ioio') this.vy += Math.sin(this.t * 0.22) * (this.type === 'chapeu' ? 0.22 : 0.12);
      }
    }
    // Pipa: voa alto em ziguezague e solta bombinhas lá de cima nos bichos!
    if (this.type === 'pipa') {
      this.vy = Math.sin(this.t * 0.16) * 1.4 - 0.35;
      if (this.t % 18 === 0) {
        const b = new Projectile(this.x + this.w / 2, this.y + this.h, (Math.random() - 0.5) * 1.5, 2.5, 'estalo', { hostile: false, gravity: 0.22, life: 55, damage: 2, weapon: 'pipa', bounces: 1 });
        b.owner = own; projectiles.push(b); sfx('spine');
      }
    }
    // Avião de papel ou dobrão de berimbau: teleguiado no inimigo mais próximo!
    if ((this.type === 'aviao_papel' || this.type === 'berimbau') && currentLevel) {
      let bestE = null, bestD = 340;
      for (const e of currentLevel.enemies) {
        if (e.dead) continue;
        const d = Math.hypot((e.x + e.w / 2) - (this.x + this.w / 2), (e.y + e.h / 2) - (this.y + this.h / 2));
        if (d < bestD) { bestD = d; bestE = e; }
      }
      if (!bestE && currentLevel.boss && !currentLevel.boss.dead) bestE = currentLevel.boss;
      if (bestE) {
        const ang = Math.atan2((bestE.y + bestE.h / 2) - (this.y + this.h / 2), (bestE.x + bestE.w / 2) - (this.x + this.w / 2));
        const spd = this.type === 'berimbau' ? 9.5 : 8.5;
        this.vx = lerp(this.vx, Math.cos(ang) * spd, 0.12);
        this.vy = lerp(this.vy, Math.sin(ang) * spd, 0.12);
      }
    }
    // Boneca de pano: fica no chão atraindo os bichos perto e depois explode em estrelas!
    if (this.type === 'boneca_pano') {
      this.vx *= 0.9; this.vy = Math.min(this.vy + 0.35, 8);
      for (const pl of getPlatforms()) if (pl.state !== 'fallen' && checkAABB({ x: this.x, y: this.y + this.vy, w: this.w, h: this.h }, pl)) { this.y = pl.y - this.h; this.vy = 0; break; }
      if (currentLevel) {
        for (const e of currentLevel.enemies) {
          if (!e.dead && !e.legend && Math.hypot(e.x - this.x, e.y - this.y) < 190) {
            e.x += Math.sign(this.x - e.x) * 1.4; e.facing = Math.sign(this.x - e.x) || 1;
          }
        }
      }
      if (this.life <= 2 && !this.exploded) {
        this.exploded = true; explodeRojao(this);
      }
    }
    if (this.type === 'laco' && currentLevel) {
      if (Array.isArray(currentLevel.rapaduras)) {
        for (const r of currentLevel.rapaduras) if (!r.collected && checkAABB(this, r)) { r.x = (own || player).x; r.y = (own || player).y; r.update(); }
      }
      if (Array.isArray(currentLevel.items)) {
        for (const it of currentLevel.items) if (!it.collected && checkAABB(this, it)) { it.x = (own || player).x; it.y = (own || player).y; it.update(); }
      }
    }
    if (this.type === 'fireZone') {
      this.vx = 0; this.vy = Math.min(this.vy + 0.4, 8);
      for (const pl of getPlatforms()) if (pl.state !== 'fallen' && checkAABB({ x: this.x, y: this.y + this.vy, w: this.w, h: this.h }, pl)) { this.y = pl.y - this.h; this.vy = 0; break; }
      if (this.t % 28 === 0 && this.hitSet) this.hitSet.clear();
      if (this.t % 4 === 0) particles.push(new Particle(this.x + Math.random() * this.w, this.y + 4, (Math.random() - 0.5) * 0.8, -1.2 - Math.random(), this.t % 8 === 0 ? '#FFE066' : '#FF6B1A', 16, 3, -0.02));
      if (--this.life <= 0) this.dead = true;
      return;
    }
    if (this.type === 'rojao') { this.vx = clamp(this.vx * 1.07, -12, 12); if (this.t % 2 === 0) particles.push(new Particle(this.x + this.w / 2 - Math.sign(this.vx) * 10, this.y + this.h / 2, -this.vx * 0.1, -0.3, this.t % 4 ? '#FFD43B' : '#FF6B1A', 20, 4, -0.02));
      for (const pl of getPlatforms()) if (!pl.oneWay && checkAABB(this, pl)) { this.dead = true; break; } }
    if (this.type === 'miasma') { this.vx *= 0.995; this.vy += Math.sin(this.t * 0.1) * 0.05; }
    // v3.0 & v4.0: projéteis que correm pelo chão (zwave, bosta, pião, pintinho, redemoinho_penas)
    if (this.type === 'zwave' || this.type === 'bosta' || this.type === 'piao' || this.type === 'pintinho' || this.type === 'redemoinho_penas') {
      this.vy = Math.min(this.vy + 0.5, 10); let onG = false;
      for (const pl of getPlatforms()) if (pl.state !== 'fallen' && checkAABB({ x: this.x, y: this.y + this.vy, w: this.w, h: this.h }, pl) && this.y + this.h <= pl.y + 12) { this.y = pl.y - this.h; this.vy = 0; onG = true; break; }
      if ((this.type === 'zwave' || this.type === 'piao' || this.type === 'redemoinho_penas') && this.t % 3 === 0) spawnDust(this.x + this.w / 2, this.y + this.h, 1, '#FFE8A3');
      if (this.type === 'pintinho' && onG && this.t % 18 === 0) this.vy = -4.2;
      if ((this.type === 'piao' || this.type === 'redemoinho_penas') && this.t % 14 === 0 && this.hitSet) this.hitSet.clear();
      if (this.type === 'bosta') this.spin = (this.spin || 0) + this.vx * 0.12;
    }
    if (this.type === 'candeeiro' || this.type === 'cajuina' || this.type === 'ovo_ouro' || this.type === 'bombinha') {
      if (this.t % 2 === 0) particles.push(new Particle(this.x + this.w / 2, this.y, (Math.random() - 0.5), -0.8, '#FFD43B', 14, 2.5, -0.02));
      for (const pl of getPlatforms()) if (pl.state !== 'fallen' && checkAABB(this, pl)) { this.dead = true; break; }
    }
    if (this.type === 'pamonha') { for (const pl of getPlatforms()) if (pl.state !== 'fallen' && checkAABB(this, pl)) { this.dead = true; break; } }
    if (this.type === 'laco' || this.type === 'rede') { this.vx *= 0.97; if (this.t > 44) this.dead = true; }
    if ((this.type === 'nota' || this.type === 'bolinha_gude' || this.type === 'lata_toddy' || this.type === 'placa_casco') && this.bounces > 0) {
      for (const pl of getPlatforms()) if (!pl.oneWay && checkAABB(this, pl)) {
        if (this.y + this.h - this.vy <= pl.y + 10) { this.y = pl.y - this.h - 1; this.vy = -Math.max(4.2, Math.abs(this.vy) * 0.82); }
        else { this.vx = -this.vx; }
        this.bounces--; sfx('coin'); spawnSparks(this.x + this.w / 2, this.y + this.h / 2, 4, '#C5F6FA'); break;
      }
    }
    if (this.type === 'zwave' || this.type === 'bosta' || this.type === 'piao' || this.type === 'pintinho' || this.type === 'redemoinho_penas') { this.x += this.vx; this.y += this.vy; } else { this.vy += this.gravity; this.x += this.vx; this.y += this.vy; }
    if (this.type === 'shockwave') { this.y = this.groundY - this.h; if (this.t % 4 === 0) spawnDust(this.x + this.w / 2, this.groundY, 1); }
    if (this.type === 'ember' || this.type === 'fire' || this.type === 'estalo') if (this.t % 3 === 0) particles.push(new Particle(this.x + this.w / 2, this.y + this.h / 2, 0, -0.5, '#FFD43B', 12, 2, 0));
    if (--this.life <= 0) this.dead = true;
    if (this.type !== 'shockwave' && (this.type === 'fire' || this.type === 'spine' || this.type === 'ember' || this.type === 'pedra' || this.type === 'bone' || this.type === 'estalo' || this.type === 'bolinha_gude' || this.type === 'lata_toddy' || this.type === 'placa_casco') && this.gravity > 0) {
      for (const p of getPlatforms()) if (checkAABB(this, p)) {
        if ((this.type === 'pedra' || this.type === 'estalo' || this.type === 'bolinha_gude' || this.type === 'lata_toddy' || this.type === 'placa_casco') && this.bounces > 0) {
          this.bounces--; this.y = p.y - this.h - 1; this.vy = -Math.max(3.6, Math.abs(this.vy) * 0.78);
          spawnSparks(this.x + this.w / 2, this.y + this.h, 4, '#FFE066');
          break;
        }
        this.dead = true; spawnSparks(this.x + this.w / 2, this.y + this.h, 5, this.color); break;
      }
    }
    if (currentLevel && (this.y > (currentLevel.height || 2000) + 100 || this.x < -200 || this.x > (currentLevel.width || 5000) + 200)) this.dead = true;
  }
  draw(ctx, camX, camY) {
    const x = lerp(this.prevX, this.x, renderAlpha) - camX, y = lerp(this.prevY, this.y, renderAlpha) - camY;
    // Linha do Ioiô ou da Pipa ligada ao dono
    if ((this.type === 'ioio' || this.type === 'pipa') && this.owner) {
      const ox = lerp(this.owner.prevX, this.owner.x, renderAlpha) - camX + this.owner.w / 2;
      const oy = lerp(this.owner.prevY, this.owner.y, renderAlpha) - camY + 18;
      ctx.save(); ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(x + this.w / 2, y + this.h / 2); ctx.stroke(); ctx.restore();
    }
    ctx.save(); ctx.translate(x + this.w / 2, y + this.h / 2);
    ctx.strokeStyle = '#1A1A1A'; ctx.lineWidth = 2; ctx.fillStyle = this.color;
    switch (this.type) {
      case 'leaf': ctx.rotate(this.t * 0.3); ctx.beginPath(); ctx.ellipse(0, 0, this.w / 2, this.h / 2 - 1, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); break;
      case 'miasma': ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(0, 0, this.w / 2 + Math.sin(this.t * 0.3) * 1.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#E599F7'; ctx.beginPath(); ctx.arc(-2, -2, 3, 0, Math.PI * 2); ctx.fill(); break;
      case 'shockwave': ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.moveTo(-this.w / 2, this.h / 2); ctx.quadraticCurveTo(0, -this.h, this.w / 2, this.h / 2); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
      case 'water': ctx.beginPath(); ctx.ellipse(0, 0, this.w / 2, this.h / 2, Math.atan2(this.vy, this.vx), 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#D0EBFF'; ctx.fillRect(-2, -3, 4, 2); break;
      case 'pandeiro': { ctx.rotate(this.t * 0.5); ctx.beginPath(); ctx.arc(0, 0, 11, 0, 7); ctx.fillStyle = '#C68B59'; ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 8, 0, 7); ctx.fillStyle = '#F8E1A8'; ctx.fill(); ctx.fillStyle = '#FFD43B'; for (let k = 0; k < 5; k++) { const a = k * 1.2566; ctx.beginPath(); ctx.arc(Math.cos(a) * 10, Math.sin(a) * 10, 2.4, 0, 7); ctx.fill(); } break; }
      case 'rojao': { ctx.rotate(Math.atan2(this.vy, this.vx)); ctx.fillStyle = '#E03131'; ctx.fillRect(-9, -4, 16, 8); ctx.strokeRect(-9, -4, 16, 8); ctx.fillStyle = '#FFD43B'; ctx.beginPath(); ctx.moveTo(7, -5); ctx.lineTo(13, 0); ctx.lineTo(7, 5); ctx.fill(); ctx.stroke(); ctx.strokeStyle = '#8B5A2B'; ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-20, 0); ctx.stroke(); ctx.fillStyle = '#FFA94D'; ctx.beginPath(); ctx.arc(-11 - Math.random() * 4, (Math.random() - 0.5) * 4, 3 + Math.random() * 2, 0, 7); ctx.fill(); break; }
      case 'pedra': ctx.rotate(this.t * 0.4); ctx.beginPath(); ctx.ellipse(0, 0, this.w / 2, this.h / 2 - 1, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#BDB2A5'; ctx.fillRect(-2, -3, 3, 2); break;
      case 'bone': ctx.rotate(this.t * 0.25); ctx.fillRect(-this.w / 2 + 2, -2, this.w - 4, 4); ctx.strokeRect(-this.w / 2 + 2, -2, this.w - 4, 4); [-1, 1].forEach((k) => { ctx.beginPath(); ctx.arc(k * this.w / 2, -2, 2.6, 0, 7); ctx.arc(k * this.w / 2, 2, 2.6, 0, 7); ctx.fill(); }); break;
      case 'slash': { const a = 1 - this.life / 12; ctx.globalAlpha = 0.85; ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, this.w / 2, -1.2 + a, 1.2 + a); ctx.stroke(); ctx.strokeStyle = '#FFA94D'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, this.w / 2 - 6, -1 + a, 1 + a); ctx.stroke(); break; }
      case 'fire': case 'ember': ctx.beginPath(); ctx.arc(0, 0, this.w / 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#FFE066'; ctx.beginPath(); ctx.arc(0, 0, this.w / 4, 0, Math.PI * 2); ctx.fill(); break;
      case 'laco': { const r = 9 + Math.sin(this.t * 0.6) * 2; ctx.strokeStyle = '#8B5A2B'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, 0, r + 3, r, this.t * 0.3, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-Math.sign(this.vx || 1) * r, 0); ctx.lineTo(-Math.sign(this.vx || 1) * (r + 40 - this.t), 4); ctx.stroke(); ctx.strokeStyle = '#E9C46A'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(0, 0, r + 3, r, this.t * 0.3, 0, 7); ctx.stroke(); break; }
      case 'zwave': { ctx.globalAlpha = 0.9; const g = ctx.createLinearGradient(0, -this.h / 2, 0, this.h / 2); g.addColorStop(0, 'rgba(255,248,220,0)'); g.addColorStop(1, '#FFD8A8'); ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(-this.w / 2, this.h / 2); ctx.quadraticCurveTo(0, -this.h * 0.9, this.w / 2, this.h / 2); ctx.fill(); ctx.strokeStyle = '#E8590C'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#7A3E12'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('TUM', 0, 2); break; }
      case 'candeeiro': { ctx.rotate(this.t * 0.25); ctx.fillStyle = '#868E96'; ctx.fillRect(-5, -4, 10, 10); ctx.strokeRect(-5, -4, 10, 10); ctx.fillStyle = '#FFD43B'; ctx.beginPath(); ctx.moveTo(-3, -4); ctx.quadraticCurveTo(0, -14 - Math.random() * 3, 3, -4); ctx.fill(); break; }
      case 'nota': { ctx.rotate(Math.sin(this.t * 0.5) * 0.3); ctx.strokeStyle = '#C5F6FA'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-8, 6); ctx.lineTo(0, -8); ctx.lineTo(8, 6); ctx.closePath(); ctx.stroke();
        ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(0, 0, 11, 0, 7); ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.5; ctx.stroke(); break; }
      case 'milho': case 'bacamarte': ctx.fillStyle = '#FFD43B'; ctx.beginPath(); ctx.ellipse(0, 0, 4.5, 3.5, this.t * 0.3, 0, 7); ctx.fill(); ctx.stroke(); break;
      case 'pamonha': { ctx.rotate(this.t * 0.15); ctx.fillStyle = '#A9C94A'; ctx.beginPath(); ctx.ellipse(0, 0, 11, 7, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.strokeStyle = '#6B8E23'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-10, -2); ctx.lineTo(10, -2); ctx.moveTo(-10, 2); ctx.lineTo(10, 2); ctx.stroke(); ctx.strokeStyle = '#8B5A2B'; ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(-15, -4); ctx.moveTo(11, 0); ctx.lineTo(15, -4); ctx.stroke(); break; }
      case 'tapioca': { ctx.rotate(this.t * 0.5); ctx.fillStyle = '#FFF8EC'; ctx.beginPath(); ctx.ellipse(0, 0, 10, 5, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#E8590C'; ctx.beginPath(); ctx.arc(-3, 0, 1.6, 0, 7); ctx.arc(3, 1, 1.4, 0, 7); ctx.fill(); break; }
      case 'pedrinha': ctx.beginPath(); ctx.arc(0, 0, 4, 0, 7); ctx.fill(); ctx.stroke(); break;
      case 'presilha': { ctx.rotate(this.t * 0.6); ctx.fillStyle = '#F06595'; ctx.beginPath(); ctx.moveTo(-8, -2); ctx.lineTo(8, -2); ctx.lineTo(8, 2); ctx.lineTo(-8, 2); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#FFE066'; ctx.beginPath(); ctx.arc(-6, 0, 3, 0, 7); ctx.fill(); ctx.stroke(); break; }
      case 'chapeu': { ctx.rotate(this.t * 0.45); ctx.fillStyle = '#E9C46A'; ctx.beginPath(); ctx.ellipse(0, 3, 15, 5, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.ellipse(0, -1, 8, 6, 0, Math.PI, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#C2255C'; ctx.fillRect(-8, -1, 16, 2); break; }
      case 'bosta': { ctx.rotate(this.spin || 0); ctx.beginPath(); ctx.arc(0, 0, this.w / 2, 0, 7); ctx.fillStyle = '#6B4A2B'; ctx.fill(); ctx.stroke(); ctx.fillStyle = '#8B6542'; ctx.beginPath(); ctx.arc(-3, -3, 3, 0, 7); ctx.arc(4, 2, 2, 0, 7); ctx.fill(); break; }
      case 'semente': ctx.beginPath(); ctx.ellipse(0, 0, 4, 3, this.t * 0.2, 0, 7); ctx.fill(); ctx.stroke(); break;
      case 'fita': { ctx.rotate(this.t * 0.4); const cs = ['#F06595', '#FCC419', '#4DABF7', '#69DB7C']; ctx.fillStyle = cs[(this.t >> 3) % 4]; ctx.fillRect(-this.w / 2, -3, this.w, 6); ctx.strokeRect(-this.w / 2, -3, this.w, 6); break; }
      case 'peixeira': { ctx.rotate(this.t * 0.55); ctx.fillStyle = '#DEE2E6'; ctx.beginPath(); ctx.moveTo(-10, -2); ctx.lineTo(10, 0); ctx.lineTo(-10, 3); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#5C3D2E'; ctx.fillRect(-13, -3, 5, 6); break; }
      case 'berimbau': { ctx.rotate(this.t * 0.4); ctx.fillStyle = '#FFD43B'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, 7); ctx.fill(); ctx.stroke(); ctx.strokeStyle = '#74C0FC'; ctx.beginPath(); ctx.arc(0, 0, 11, 0, 7); ctx.stroke(); break; }
      case 'rede': { ctx.fillStyle = 'rgba(248,240,227,0.88)'; ctx.beginPath(); ctx.ellipse(0, 0, 14, 9, Math.sin(this.t * 0.2) * 0.2, 0, 7); ctx.fill(); ctx.stroke(); break; }
      case 'boneca_pano': { ctx.rotate(Math.sin(this.t * 0.2) * 0.15); ctx.fillStyle = '#F06595'; ctx.beginPath(); ctx.moveTo(-8, 10); ctx.lineTo(8, 10); ctx.lineTo(4, -2); ctx.lineTo(-4, -2); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#E0A872'; ctx.beginPath(); ctx.arc(0, -6, 5, 0, 7); ctx.fill(); ctx.stroke(); break; }
      case 'corda': case 'bilro': { ctx.rotate(this.t * 0.5); ctx.fillStyle = '#E9C46A'; ctx.beginPath(); ctx.ellipse(0, 0, 8, 4, 0, 0, 7); ctx.fill(); ctx.stroke(); break; }
      case 'cajuina': { ctx.rotate(this.t * 0.3); ctx.fillStyle = '#2F9E44'; ctx.fillRect(-4, -8, 8, 16); ctx.strokeRect(-4, -8, 8, 16); ctx.fillStyle = '#FCC419'; ctx.fillRect(-3, -2, 6, 8); break; }
      case 'pipa': { ctx.rotate(Math.sin(this.t * 0.2) * 0.2); ctx.fillStyle = '#FF6B6B'; ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(12, 0); ctx.lineTo(0, 13); ctx.lineTo(-12, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#FFD43B'; ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(12, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill(); break; }
      case 'chiclete': { const r = 9 + Math.sin(this.t * 0.35) * 2; ctx.fillStyle = 'rgba(255,133,192,0.88)'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#FFF'; ctx.beginPath(); ctx.arc(-3, -3, 2.5, 0, 7); ctx.fill(); break; }
      case 'piao': { ctx.rotate(this.t * 0.8); ctx.fillStyle = '#FAB005'; ctx.beginPath(); ctx.moveTo(-8, -6); ctx.lineTo(8, -6); ctx.lineTo(0, 9); ctx.closePath(); ctx.fill(); ctx.stroke(); break; }
      case 'bolinha_gude': { ctx.fillStyle = '#3BC9DB'; ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#FFF'; ctx.beginPath(); ctx.arc(-2, -2, 1.8, 0, 7); ctx.fill(); break; }
      case 'bombinha': { ctx.rotate(this.t * 0.5); ctx.fillStyle = '#E03131'; ctx.fillRect(-4, -6, 8, 12); ctx.strokeRect(-4, -6, 8, 12); break; }
      case 'aviao_papel': { ctx.rotate(Math.atan2(this.vy, this.vx)); ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-9, -6); ctx.lineTo(-5, 0); ctx.lineTo(-9, 6); ctx.closePath(); ctx.fill(); ctx.stroke(); break; }
      case 'ioio': { ctx.rotate(this.t * 0.7); ctx.fillStyle = '#E03131'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#FFF'; ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, 7); ctx.fill(); break; }
      case 'penas': case 'espinho_mandacaru': { ctx.rotate(Math.atan2(this.vy, this.vx)); ctx.fillStyle = this.type === 'penas' ? '#FFD43B' : '#51CF66'; ctx.beginPath(); ctx.ellipse(0, 0, 8, 3.5, 0, 0, 7); ctx.fill(); ctx.stroke(); break; }
      case 'ovo_ouro': { ctx.rotate(this.t * 0.25); ctx.fillStyle = '#FFD43B'; ctx.beginPath(); ctx.ellipse(0, 0, 8, 10, 0, 0, 7); ctx.fill(); ctx.stroke(); break; }
      case 'pintinho': { ctx.scale(this.vx >= 0 ? 1 : -1, 1); ctx.fillStyle = '#FFE066'; ctx.beginPath(); ctx.arc(0, 1, 7, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#FF922B'; ctx.beginPath(); ctx.moveTo(6, -1); ctx.lineTo(11, 1); ctx.lineTo(6, 3); ctx.fill(); ctx.fillStyle = '#1A1A1A'; ctx.beginPath(); ctx.arc(3, -2, 1.4, 0, 7); ctx.fill(); break; }
      case 'redemoinho_penas': { ctx.globalAlpha = 0.85; for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? '#FFF3BF' : '#FFD43B'; ctx.beginPath(); ctx.ellipse(Math.sin(this.t * 0.4 + i) * 5, 16 - i * 11, 9 + i * 3, 5, 0, 0, 7); ctx.fill(); ctx.stroke(); } break; }
      case 'lata_toddy': { ctx.rotate(this.t * 0.45); ctx.fillStyle = '#ADB5BD'; ctx.fillRect(-6, -8, 12, 16); ctx.strokeRect(-6, -8, 12, 16); ctx.fillStyle = '#E03131'; ctx.fillRect(-5, -3, 10, 6); break; }
      case 'resposta_braba': { ctx.fillStyle = '#FFF9DB'; ctx.beginPath(); ctx.roundRect(-18, -11, 36, 22, 6); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#E03131'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('OXE?!', 0, 4); break; }
      case 'placa_casco': { ctx.rotate(this.t * 0.5); ctx.fillStyle = '#C9A26B'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, 7); ctx.fill(); ctx.stroke(); break; }
      case 'estalo': { ctx.rotate(this.t * 0.6); ctx.fillStyle = this.t % 4 < 2 ? '#FFD43B' : '#FF6B6B'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, 7); ctx.fill(); ctx.stroke(); break; }
      case 'fireZone': {
        ctx.globalCompositeOperation = 'lighter';
        for (let k = -2; k <= 2; k++) {
          const fh = 10 + Math.sin(this.t * 0.35 + k) * 4;
          ctx.fillStyle = k % 2 === 0 ? 'rgba(255,107,26,0.85)' : 'rgba(255,212,59,0.9)';
          ctx.beginPath(); ctx.moveTo(k * 10 - 8, this.h / 2); ctx.quadraticCurveTo(k * 10, -fh, k * 10 + 8, this.h / 2); ctx.fill();
        }
        break;
      }
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
    this.hero = 'tonho'; this.maxSpd = 4.6; this.jumpV = -12.3; this.canGlide = true; this.canDouble = false; this.usedDouble = false; this.maxFlaps = 0; this.flapsLeft = 0;
    this.meleeWeapon = 'chicote'; this.whipDamage = 1; this.mount = null; this.dazed = 0; this.swapMark = 0;
    this.brawlAmmo = 3; this.brawlSuper = 0; this.powerCubes = 0; this.inBush = false;
  }
  // v4.0: caixas de ataque corpo-a-corpo ampliadas para coice, ciscar, chifrada, bengala, peixeira e corda
  getWhipBox() {
    if (currentLevel && (currentLevel.specialMode === 'brawlstars' || currentLevel.specialMode === 'pacman')) {
      return { x: this.x - 48, y: this.y - 40, w: this.w + 96, h: this.h + 80 };
    }
    if (this.meleeWeapon === 'patada' || this.meleeWeapon === 'jegue_coice' || this.meleeWeapon === 'coice_bode') {
      return { x: this.x - 46, y: this.y + this.h * 0.2, w: this.w + 92, h: this.h * 0.8 };
    }
    if (this.meleeWeapon === 'ciscar' || this.meleeWeapon === 'corda' || this.meleeWeapon === 'furia_toddy') {
      return { x: this.x - 64, y: this.y - 18, w: this.w + 128, h: this.h + 32 };
    }
    if (this.meleeWeapon === 'fita' || this.meleeWeapon === 'peixeira') {
      const r = 64; return { x: this.facing > 0 ? this.x + this.w : this.x - r, y: this.y - 2, w: r, h: 36 };
    }
    if (this.meleeWeapon === 'porrete' || this.meleeWeapon === 'bengala_couro') {
      const r = 60; return { x: this.facing > 0 ? this.x + this.w - 4 : this.x - r + 4, y: this.y - 8, w: r, h: this.h + 10 };
    }
    const reach = 70; return { x: this.facing > 0 ? this.x + this.w : this.x - reach, y: this.y, w: reach, h: 36 };
  }
  setMount(on, mountType = 'jegue') {
    if (on && !this.mount) {
      const mKind = typeof on === 'string' ? on : (mountType || 'jegue');
      this.mount = { t: 0, hp: 2, maxHp: 2, type: mKind, kind: mKind };
      this.y -= 14; this.h = 58; this.x -= 4; this.w = 36;
    } else if (on && this.mount) {
      const mKind = typeof on === 'string' ? on : (mountType || this.mount.type || 'jegue');
      this.mount.type = mKind; this.mount.kind = mKind; this.mount.hp = 2; this.mount.maxHp = 2;
    } else if (!on && this.mount) {
      const wasToddy = this.mount.type === 'bode_toddy';
      this.mount = null; this.y += 14; this.h = 44; this.x += 4; this.w = 28;
      if (isMountSlot(selOf(this))) setSel(this, defOf(this));
      if (wasToddy && this._mountedPartnerKind === 'bode_toddy' && !companion && currentLevel) {
        companion = makeHero('bode_toddy', this.x - this.facing * 38, this.y);
        this._mountedPartnerKind = null;
      }
    }
    if (typeof updateWeaponUI === 'function') updateWeaponUI();
  }
  update() {
    this.prevX = this.x - (this._carryDX || 0); this.prevY = this.y - (this._carryDY || 0); this._carryDX = 0; this._carryDY = 0;
    if (this.dead) { this.updateDeath(); return; }
    if (this.asaBrancaTimer > 0) this.asaBrancaTimer--;
    if (this.swapMark > 0) this.swapMark--;
    if (this.special && --this.special.t <= 0) { this.special = null; spawnFloatingText('O especial acabou!', this.x + this.w / 2, this.y - 14, '#FFF'); updateWeaponUI(); }
    if (this.costume) { if (--this.costume.t <= 0) { this.costume = null; this.dash = 0; spawnFloatingText('A fantasia acabou!', this.x + this.w / 2, this.y - 14, '#FFF'); spawnSparks(this.x + this.w / 2, this.y + this.h / 2, 12, '#FFFFFF'); } }
    if (this.mount) this.mount.t++;
    if (this.dazed > 0) { this.dazed--; this.vx *= 0.85; this.vy += GRAVITY; if (this.vy > MAX_FALL_SPEED) this.vy = MAX_FALL_SPEED; this.moveAndCollide(); this.updateAnim(); return; }
    if (keys.jumpJustPressed) { this.jumpBuffer = 11; } else if (this.jumpBuffer > 0) { this.jumpBuffer--; }
    if (this.invuln > 0) this.invuln--; if (this.whipCooldown > 0) this.whipCooldown--; if (this.vineCooldown > 0) this.vineCooldown--;
    if (this.shieldTimer > 0) this.shieldTimer--;
    if (keys.whipJustPressed && this.whipCooldown <= 0) this.performAttack();
    if (this.whipTimer > 0) this.whipTimer--;

    const L = currentLevel;
    const sm = L && L.specialMode;

    // ----- MODO ESPECIAL 1: PAC-OXE (1-4) E MODO ESPECIAL 4: BRAWL STARS (4-4, 6-4, 8-4) -----
    if ((sm === 'pacman' || sm === 'brawlstars') && this === player) {
      if (sm === 'pacman') {
        if (this.turboCooldown > 0) this.turboCooldown--;
        if (keys.jumpJustPressed && this.dash <= 0 && (!this.turboCooldown || this.turboCooldown <= 0)) {
          this.dash = 24; this.turboCooldown = 70; sfx('whoosh');
          spawnDust(this.x + this.w / 2, this.y + this.h, 8);
          spawnFloatingText('⚡ TURBO DISPARADA!', this.x + this.w / 2, this.y - 14, '#FFE066');
        }
      }
      const spd = (sm === 'pacman' ? (5.0 + (this.dash > 0 ? 3.6 : 0)) : (4.6 + (this.powerCubes || 0) * 0.2 + (this.dash > 0 ? 4.5 : 0)));
      if (this.dash > 0) this.dash--;
      let tx = 0, ty = 0;
      if (keys.left && !keys.right) { tx = -spd; this.facing = -1; }
      else if (keys.right && !keys.left) { tx = spd; this.facing = 1; }
      if (keys.up) ty = -spd;
      else if (keys.down) ty = spd;
      else if (keys.jump && sm !== 'pacman') ty = -spd;
      if (tx !== 0 && ty !== 0) { tx *= 0.74; ty *= 0.74; }
      this.vx = lerp(this.vx, tx, 0.45);
      this.vy = lerp(this.vy, ty, 0.45);
      this.onGround = true;
      const plats = getPlatforms();
      this.x += this.vx;
      let hitH = false;
      for (const p of plats) { if (p.oneWay || p.y >= (L.levelH || 540) - 36 || !checkAABB(this, p)) continue; if (this.vx > 0) this.x = p.x - this.w; else if (this.vx < 0) this.x = p.x + p.w; this.vx = 0; hitH = true; }
      this.y += this.vy;
      let hitV = false;
      for (const p of plats) { if (p.oneWay || !checkAABB(this, p)) continue; if (this.vy > 0) this.y = p.y - this.h; else if (this.vy < 0) this.y = p.y + p.h; this.vy = 0; hitV = true; }
      // Corner-slip suave para corredores de labirinto no Pac-Oxe
      if (sm === 'pacman') {
        if (hitH && Math.abs(tx) > 0.1 && Math.abs(ty) < 0.1) {
          const testUp = { x: this.x + Math.sign(tx) * 4, y: this.y - 10, w: this.w, h: this.h };
          const testDown = { x: this.x + Math.sign(tx) * 4, y: this.y + 10, w: this.w, h: this.h };
          const upBlocked = plats.some(p => !p.oneWay && checkAABB(testUp, p));
          const downBlocked = plats.some(p => !p.oneWay && checkAABB(testDown, p));
          if (!upBlocked && downBlocked) this.y -= 3.2;
          else if (!downBlocked && upBlocked) this.y += 3.2;
        } else if (hitV && Math.abs(ty) > 0.1 && Math.abs(tx) < 0.1) {
          const testLeft = { x: this.x - 10, y: this.y + Math.sign(ty) * 4, w: this.w, h: this.h };
          const testRight = { x: this.x + 10, y: this.y + Math.sign(ty) * 4, w: this.w, h: this.h };
          const leftBlocked = plats.some(p => !p.oneWay && checkAABB(testLeft, p));
          const rightBlocked = plats.some(p => !p.oneWay && checkAABB(testRight, p));
          if (!leftBlocked && rightBlocked) this.x -= 3.2;
          else if (!rightBlocked && leftBlocked) this.x += 3.2;
        }
      }
      if (sm === 'pacman') {
        if (this.x < 8) this.x = L.levelW - this.w - 12;
        else if (this.x + this.w > L.levelW - 8) this.x = 12;
      } else {
        this.x = clamp(this.x, 28, (L.levelW || 2200) - this.w - 28);
      }
      this.y = clamp(this.y, 44, (L.levelH || 540) - this.h - 38);
      if (sm === 'brawlstars') {
        this.brawlAmmo = Math.min(3, (this.brawlAmmo == null ? 3 : this.brawlAmmo) + 0.022);
        this.inBush = (L.brawlBushes || []).some((b) => checkAABB(this, b));
      }
      this.updateAnim();
      return;
    }

    // ----- MODO ESPECIAL 5: ASA-DELTA TURBO / SHMUP (5-4) -----
    if (sm === 'shmup' && this === player) {
      const sx = (keys.right ? 5.6 : 0) - (keys.left ? 4.4 : 0) + 1.8;
      const sy = (keys.down ? 4.6 : 0) - ((keys.up || keys.jump) ? 4.6 : 0);
      this.vx = lerp(this.vx, sx, 0.25);
      this.vy = lerp(this.vy, sy, 0.25);
      this.facing = 1; this.gliding = true; this.onGround = false;
      this.x = clamp(this.x + this.vx, 20, (L.levelW || 4400) - this.w - 20);
      this.y = clamp(this.y + this.vy, 36, (L.levelH || 540) - this.h - 46);
      this.checkHazards();
      this.updateAnim();
      return;
    }

    // ----- MODO ESPECIAL 3: OXE-KART 3D CÂMERA ATRÁS DO CARRO (ESTILO MARIO KART, 3-4) -----
    if (sm === 'kart' && this === player) {
      this.facing = 1;
      if (!L.kartRace) {
        L.kartRace = {
          trackZ: 0, lap: 1, totalLaps: 3, lapLength: 2600,
          laneX: 0, steer: 0, speed: 6.5, hopY: 0, hopVy: 0,
          driftDir: 0, driftCharge: 0, heldItem: null, rouletteTimer: 0, rouletteItem: 'casco_tatu',
          shells3D: [], lightningFlash: 0, rank: 1
        };
      }
      const kr = L.kartRace;
      if (this.kartBoost > 0) { this.kartBoost--; if (frameCount % 2 === 0) spawnSparks(this.x, this.y + this.h - 6, 2, '#FF922B'); }
      const steerInput = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      kr.steer = lerp(kr.steer || 0, steerInput, 0.22);
      // Pulo + Drift estilo Mario Kart (segurar Pulo nas curvas carrega faíscas azuis/laranjas/roxas!)
      if (this.jumpBuffer > 0 && kr.hopY <= 0) {
        kr.hopVy = 6.2; this.jumpBuffer = 0; sfx('jump');
        if (steerInput !== 0) kr.driftDir = steerInput;
      }
      if (kr.hopY > 0 || kr.hopVy > 0) {
        kr.hopY = Math.max(0, (kr.hopY || 0) + kr.hopVy);
        kr.hopVy -= 0.65;
        if (kr.hopY <= 0) kr.hopVy = 0;
      }
      if (keys.jump && (kr.driftDir !== 0 || Math.abs(steerInput) > 0) && kr.speed > 5.5) {
        if (kr.driftDir === 0) kr.driftDir = steerInput;
        kr.driftCharge = (kr.driftCharge || 0) + 1;
      } else {
        if ((kr.driftCharge || 0) >= 22) {
          const superDrift = kr.driftCharge >= 50;
          this.kartBoost = Math.max(this.kartBoost || 0, superDrift ? 65 : 38);
          sfx('whip');
          spawnFloatingText(superDrift ? '🟣 ULTRA DRIFT TURBO!' : '🔥 MINI-TURBO DRIFT!', this.x, this.y - 22, superDrift ? '#E599F7' : '#FF922B');
        }
        kr.driftDir = 0; kr.driftCharge = 0;
      }
      // Curvatura da pista em função de trackZ (empurra o kart para fora da curva como no Mario Kart!)
      const segIdx = Math.floor(kr.trackZ / 32);
      const roadCurve = Math.sin(segIdx * 0.045) * 0.65 + Math.cos(segIdx * 0.022) * 0.45;
      const centrifugal = -roadCurve * (kr.speed / 11.5) * 0.032;
      const steerPower = (kr.driftDir !== 0 ? 0.052 : 0.042);
      kr.laneX = clamp((kr.laneX || 0) + steerInput * steerPower + centrifugal, -1.42, 1.42);
      const offRoad = Math.abs(kr.laneX) > 1.04 && (this.kartBoost || 0) <= 0;
      const topSpd = this.kartBoost > 0 ? 13.4 : (unionTimer > 0 ? 12.8 : (offRoad ? 5.6 : 9.4));
      const accelTarget = keys.down ? 4.2 : topSpd * (keys.up || keys.right || !keys.left ? 1.0 : 0.92);
      kr.speed = lerp(kr.speed || 6.5, accelTarget, this.kartBoost > 0 ? 0.16 : 0.08);
      kr.trackZ += kr.speed;
      const totalRaceDist = kr.lapLength * kr.totalLaps;
      kr.lap = clamp(Math.floor(kr.trackZ / kr.lapLength) + 1, 1, kr.totalLaps);
      // Sincroniza x 2D proporcionalmente ao progresso das 3 voltas para compatibilidade total com a bandeira e testes
      const flagX = L.flagX || (L.levelW - 220) || 5180;
      this.x = clamp(120 + (kr.trackZ / totalRaceDist) * (flagX - 120), 80, flagX + 12);
      this.vx = kr.speed;
      this.y = 408 - (kr.hopY || 0);
      this.vy = -(kr.hopVy || 0);
      this.onGround = (kr.hopY || 0) <= 0;
      if (kr.trackZ >= totalRaceDist && L.flagpole && currentState === GAME_STATE.PLAYING) {
        this.x = L.flagpole.x;
        this.y = L.flagpole.y + L.flagpole.h - this.h;
      }
      this.updateAnim();
      return;
    }

    // ----- Cipó -----
    if (this.onVine) { this.vx = 0; this.vy = 0; this.coyote = 0; this.updateAnim(); return; }

    // v4.0: cada um dos 7 heróis e 2 montarias tem peso e velocidade próprios
    const zf = this.hero === 'zefinha' || this.hero === 'cabeca_vento' || this.hero === 'galinha', mt = !!this.mount;
    const isToddyMount = mt && this.mount.type === 'bode_toddy';
    const accel = this.onGround ? (mt ? 1.0 : zf ? 1.05 : 0.88) : (mt ? 0.68 : zf ? 0.82 : 0.62);
    const maxSpd = this.dash > 0 ? 10.5 : (mt ? (isToddyMount ? 6.4 : 6.1) : (this.costume && this.costume.type === 'boi' ? 6.0 : this.maxSpd));
    const fric = this.onGround ? (zf ? 0.72 : 0.76) : 0.93;
    if (this.dash > 0) { this.dash--; this.vx = this.facing * 10.5; if (this.dash % 3 === 0) spawnDust(this.x + this.w / 2, this.y + this.h, 2); }
    const turn = (d) => (Math.sign(this.vx) === -d && this.onGround ? 2.2 : 1);
    if (keys.left && !keys.right) { this.vx -= accel * turn(-1); this.facing = -1; }
    else if (keys.right && !keys.left) { this.vx += accel * turn(1); this.facing = 1; }
    else this.vx *= fric;
    this.vx = clamp(this.vx, -maxSpd, maxSpd); if (Math.abs(this.vx) < 0.05) this.vx = 0;

    if (this.onGround) { this.coyote = 9; this.usedDouble = false; this.flapsLeft = this.maxFlaps || 0; } else if (this.coyote > 0) this.coyote--;
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.vy = this.mount ? (isToddyMount ? -13.9 : -13.4) : this.jumpV; this.onGround = false; this.coyote = 0; this.jumpBuffer = 0;
      sfx('jump'); spawnDust(this.x + this.w / 2, this.y + this.h, 5);
    } else if (this.jumpBuffer > 0 && this.hero === 'galinha' && this.flapsLeft > 0 && !this.onGround && this.coyote <= 0) {
      // Galinha Melindrosa: 3 batidas de asa no ar!
      this.vy = -10.2; this.flapsLeft--; this.jumpBuffer = 0; sfx('doubleJump'); spawnSparks(this.x + this.w / 2, this.y + this.h, 7, '#FFE066');
    } else if (this.jumpBuffer > 0 && (this.canDouble || isToddyMount) && !this.usedDouble && !this.onGround && this.coyote <= 0) {
      this.vy = -11.5; this.usedDouble = true; this.jumpBuffer = 0; sfx('doubleJump'); spawnSparks(this.x + this.w / 2, this.y + this.h, 8, '#FFC9DE');
    }
    if (this.trampolineTimer > 0) this.trampolineTimer--;
    let g = GRAVITY;
    if (!keys.jump && this.vy < 0 && !(this.trampolineTimer > 0)) g = GRAVITY * 2.3;
    else if (keys.jump && Math.abs(this.vy) < 1.6 && !this.onGround) g = GRAVITY * 0.6;
    this.vy += g;
    const canG = this.canGlide || (this.hero === 'zefinha' && this === player && zefSel === 'sombrinha' && (zefInv.sombrinha | 0) > 0) || (this.hero === 'cabeca_vento' && (invOf(this).pipa | 0) > 0 && selOf(this) === 'pipa');
    this.gliding = canG && keys.glide && keys.jump && this.vy > 0 && !this.onGround;
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
    const immuneThorns = this.hero === 'bode_toddy' || this.hero === 'tatu_bola' || (this.mount && this.mount.type === 'bode_toddy');
    for (const h of (L.hazards || [])) {
      if (immuneThorns && h.type !== 'lava') continue;
      if (checkAABB(this, h)) { this.takeDamage(1, h.x + h.w / 2); if (!this.dead) this.vy = Math.min(this.vy, -8); }
    }
    if (this.y > (L.height || CANVAS_H) + 80) { if (this !== player) { if (typeof teleportCompanion === 'function') teleportCompanion(); return; } health = 0; this.die(); }
  }
  updateAnim() {
    if ((this.onGround || (currentLevel && (currentLevel.specialMode === 'pacman' || currentLevel.specialMode === 'brawlstars'))) && (Math.abs(this.vx) > 0.4 || Math.abs(this.vy) > 0.4)) {
      this.runTick += Math.max(Math.abs(this.vx), Math.abs(this.vy)) * 0.2;
      if (this.runTick >= 1) { this.runTick = 0; this.runFrame = (this.runFrame + 1) % 6; }
    } else this.runFrame = 0;
    if (--this.blinkTimer < -6) this.blinkTimer = 140 + Math.floor(Math.random() * 120);
    this.hatTilt = lerp(this.hatTilt, clamp(-this.vx * 0.06, -0.3, 0.3) + (this.vy < -2 ? -0.08 : 0), 0.2);
    if (this.landSquash > 0) this.landSquash--;
  }
  performAttack() {
    const L = currentLevel;
    // Em Brawl Stars (4-4, 6-4, ★-4), Mira 360° + Auto-Aim (Quickfire) no inimigo ou caixa mais próxima!
    let brawlAimAngle = null;
    if (L && L.specialMode === 'brawlstars') {
      let best = null, bestD = 380;
      const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
      for (const e of (L.enemies || [])) {
        if (e.dead || e.respawnTimer > 0) continue;
        const d = Math.hypot((e.x + e.w / 2) - cx, (e.y + e.h / 2) - cy);
        if (d < bestD) { bestD = d; best = e; }
      }
      if (!best) {
        for (const cr of (L.brawlCrates || [])) {
          if (cr.broken) continue;
          const d = Math.hypot((cr.x + cr.w / 2) - cx, (cr.y + cr.h / 2) - cy);
          if (d < bestD) { bestD = d; best = cr; }
        }
      }
      this._brawlTarget = best;
      if (best) {
        brawlAimAngle = Math.atan2((best.y + best.h / 2) - cy, (best.x + best.w / 2) - cx);
        this.facing = Math.cos(brawlAimAngle) >= 0 ? 1 : -1;
      } else if (this === player) {
        const mx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
        const my = (keys.down ? 1 : 0) - ((keys.up || keys.jump) ? 1 : 0);
        if (mx !== 0 || my !== 0) brawlAimAngle = Math.atan2(my, mx);
      }
    }
    const ox = this.x + this.w / 2 + this.facing * 18, oy = this.y + 16;
    const dmgBonus = (this.powerCubes || 0) + (unionTimer > 0 ? 2 : 0);
    const fr = (type, vx, vy, o) => {
      const opts = Object.assign({ hostile: false }, o);
      opts.damage = (opts.damage || 1) + dmgBonus;
      let rvx = vx, rvy = vy;
      if (brawlAimAngle != null && !opts._noAimRotate && Math.hypot(vx, vy) > 0.1) {
        const spd = Math.hypot(vx, vy);
        const spread = Math.atan2(vy, Math.abs(vx) || 1) * 0.45;
        rvx = Math.cos(brawlAimAngle + spread) * spd;
        rvy = Math.sin(brawlAimAngle + spread) * spd;
      }
      const pr = new Projectile(ox, oy, rvx, rvy, type, opts);
      pr.owner = this; if (opts.pierce) pr.hitSet = new Set(); projectiles.push(pr); return pr;
    };
    // Em Oxe-Kart 3D (3-4), o botão de ataque dispara o Item da Roleta Mario Kart ou um Casco de Tatu 3D na pista!
    if (L && L.specialMode === 'kart' && this === player && L.kartRace) {
      const kr = L.kartRace;
      const item = kr.heldItem || 'casco_tatu';
      kr.heldItem = null; kr.rouletteTimer = 0;
      this.whipCooldown = 18;
      if (item === 'pimenta_turbo') {
        this.kartBoost = 95; sfx('powerup'); addScreenShake(5);
        spawnFloatingText('🌶️ PIMENTA MALAGUETA TURBO!', this.x, this.y - 20, '#FF6B6B');
      } else if (item === 'trovao_oxe') {
        kr.lightningFlash = 35; sfx('quake'); addScreenShake(9);
        (L.kartRivals || []).forEach((rv) => { rv.spinTimer = 85; rv.shrunkTimer = 240; });
        spawnFloatingText('⚡ TROVÃO DE SÃO PEDRO! RIVAIS ENCOLHERAM!', this.x, this.y - 24, '#FFD43B');
      } else if (item === 'rojao_azul') {
        kr.shells3D.push({ z: kr.trackZ + 32, lane: kr.laneX, vz: 24, type: 'rojao_azul', color: '#4DABF7', life: 150 });
        sfx('fire');
        spawnFloatingText('🚀 ROJÃO AZUL (CAÇA O LÍDER)!', this.x, this.y - 20, '#4DABF7');
      } else {
        kr.shells3D.push({ z: kr.trackZ + 28, lane: kr.laneX, vz: 19, type: 'casco_tatu', color: '#51CF66', life: 120 });
        sfx('whip');
      }
      fr('pedra', 11, 0, { life: 45, damage: 2 });
      return;
    }
    // Em OxeCraft (2-4), qualquer ataque quebra blocos de minério/TNT perto!
    if (L && L.specialMode === 'minecraft' && typeof breakCraftBlocksNear === 'function') {
      breakCraftBlocksNear(this.x + this.w / 2 + this.facing * 32, this.y + this.h / 2, 72);
    }
    // Em Brawl Stars (4-4, 6-4, 8-4), gasta 1 barra de munição (ou solta o SUPER se estiver 100%!)
    if (L && L.specialMode === 'brawlstars' && this === player) {
      if ((this.brawlSuper || 0) >= 100) {
        this.brawlSuper = 0; this.whipCooldown = 18;
        sfx('bossRoar'); addScreenShake(6); sanfonaBlast(this);
        for (let a = 0; a < 8; a++) {
          const ang = (a / 8) * Math.PI * 2;
          fr('rojao', Math.cos(ang) * 7.5, Math.sin(ang) * 7.5, { life: 48, damage: 3, weapon: 'rojao', _noAimRotate: true });
        }
        spawnFloatingText('⭐ SUPER BRAWL OXE! ⭐', this.x + this.w / 2, this.y - 24, '#FFD43B');
        return;
      }
      if ((this.brawlAmmo || 0) < 0.85) return;
      this.brawlAmmo = Math.max(0, this.brawlAmmo - 0.85);
    }
    // Especial da União Suprema ativo: todo ataque solta rajada solar combinada!
    if (unionTimer > 0 && this === player) {
      fr('nota', this.facing * 13, -1.2, { life: 55, damage: 2, weapon: 'uniao', pierce: true });
      fr('nota', this.facing * 13, 1.2, { life: 55, damage: 2, weapon: 'uniao', pierce: true });
    }
    if (this.special) {
      const sp = this.special.type;
      if (sp === 'milho') { this.whipCooldown = 5; if (frameCount % 2 === 0) sfx('spine'); fr('milho', this.facing * 12, (Math.random() - 0.5) * 1.6, { life: 40, damage: 1, weapon: 'especial' }); }
      else if (sp === 'pamonha') { this.whipCooldown = 40; sfx('fire'); addScreenShake(3); fr('pamonha', this.facing * 7.5, -5, { gravity: 0.25, life: 120, damage: 4, weapon: 'especial' }); }
      else if (sp === 'tapioca') { this.whipCooldown = 20; sfx('bee'); fr('tapioca', this.facing * 9, -1, { gravity: 0.08, life: 70, damage: 1, weapon: 'tapioca' }); }
      return;
    }
    if (this.costume) {
      const ct = this.costume.type;
      if (ct === 'cacto') { this.whipCooldown = 14; sfx('spine'); for (let i = -1; i <= 1; i++) fr('spine', this.facing * 9, -1.2 + i * 1.6, { gravity: 0.05, life: 60, damage: 2, weapon: 'fantasia', w: 12, h: 8 }); }
      else if (ct === 'boi') { this.whipCooldown = 34; this.dash = 20; this.vx = this.facing * 10; sfx('charge'); spawnDust(this.x + this.w / 2, this.y + this.h, 8); }
      else if (ct === 'sol') { this.whipCooldown = 16; sfx('fire'); fr('fire', this.facing * 7.5, -0.5, { life: 70, damage: 2, weapon: 'fantasia' }); }
      return;
    }
    const inv = invOf(this), def = defOf(this);
    const sel = this === player ? selOf(this) : (this._aiWeapon || def);

    // 1) Se selecionou especificamente um slot da MONTARIA (Jegue ou Bode Toddy), usa o golpe da montaria!
    if (this.mount && isMountSlot(sel)) {
      if (sel === 'jegue_coice') {
        this.whipTimer = 14; this.whipCooldown = 20; this.whipHitSet.clear(); this.meleeWeapon = 'jegue_coice'; this.whipDamage = 3; sfx('bonk');
        spawnDust(this.x + this.w / 2 - this.facing * 24, this.y + this.h, 8);
        spawnFloatingText('COICE DUPLO! 🫏', this.x + this.w / 2, this.y - 16, '#FFE8A3');
      } else if (sel === 'jegue_disparada' || sel === 'toddy_investida') {
        this.whipCooldown = 28; this.dash = 24; this.vx = this.facing * 11; sfx('charge'); addScreenShake(3);
        spawnDust(this.x + this.w / 2, this.y + this.h, 10);
        spawnFloatingText(sel === 'toddy_investida' ? 'CHIFRADA TODDY! 🐐' : 'DISPARADA DO JEGUE! 💨', this.x + this.w / 2, this.y - 16, '#FFD43B');
      } else if (sel === 'jegue_zurro' || sel === 'toddy_berro') {
        this.whipCooldown = 30; chocalhoBlast(this);
        spawnFloatingText(sel === 'toddy_berro' ? 'BÉÉÉ ESTRONDOSO! 📢' : 'IÓ-IÓ! ZURRO SÍSMICO!', this.x + this.w / 2, this.y - 16, '#74C0FC');
      } else if (sel === 'toddy_sismico') {
        this.whipCooldown = 28; sfx('quake'); addScreenShake(4);
        [-1, 1].forEach((d) => { const pr = new Projectile(this.x + this.w / 2 + d * 20, this.y + this.h - 12, d * 7.2, 0, 'zwave', { hostile: false, life: 80, damage: 3, weapon: 'zabumba', pierce: true }); pr.hitSet = new Set(); pr.owner = this; projectiles.push(pr); });
      }
      return;
    }

    const has = sel !== def && (inv[sel] | 0) > 0;
    // 2) Arma padrão infinita de cada um dos 7 heróis (funciona a pé E montado no Jegue/Bode Toddy!)
    if (!has) {
      if (this.hero === 'zefinha') {
        this.whipCooldown = 13; sfx('whip');
        this._pebbleCnt = ((this._pebbleCnt || 0) + 1);
        fr('pedrinha', this.facing * 10.4, -0.5, { gravity: 0.05, life: 75, damage: 1, weapon: 'baleadeira' });
        if (this._pebbleCnt % 3 === 0) {
          fr('pedrinha', this.facing * 9.6, -1.6, { gravity: 0.05, life: 75, damage: 1, weapon: 'baleadeira' });
          spawnSparks(ox, oy, 5, '#FFC9DE');
        }
      } else if (this.hero === 'cabeca_vento') {
        this.whipCooldown = 14; sfx('whip');
        fr('pedra', this.facing * 10.6, -1.2, { gravity: 0.09, life: 95, damage: 1, weapon: 'baleadeira', bounces: 2 });
        fr('pedra', this.facing * 9.6, -2.4, { gravity: 0.09, life: 95, damage: 1, weapon: 'baleadeira', bounces: 1 });
      } else if (this.hero === 'galinha') {
        this.whipCooldown = 13; sfx('whip');
        [-1.3, 0, 1.3].forEach((vy) => fr('penas', this.facing * 11, vy, { life: 60, damage: 1, weapon: 'presilha', pierce: true }));
      } else if (this.hero === 'bode_toddy') {
        this.whipCooldown = 22; this.dash = 18; this.vx = this.facing * 10.5; sfx('charge');
        spawnDust(this.x + this.w / 2, this.y + this.h, 8);
      } else if (this.hero === 'seu_lunga') {
        this.whipCooldown = 18; sfx('checkpoint');
        [-1.2, 0, 1.2].forEach((vy) => { const n = fr('nota', this.facing * 10, vy, { life: 52, damage: 1, weapon: 'sanfona', pierce: true }); n.maxHits = 3; });
      } else if (this.hero === 'tatu_bola') {
        this.whipCooldown = 20; this.dash = 20; this.vx = this.facing * 10.8; sfx('charge');
        spawnDust(this.x + this.w / 2, this.y + this.h, 6);
      } else {
        this.performWhipAttack();
      }
      return;
    }

    // 3) Armas coletadas de todos os 7 heróis
    if (sel === 'presilha') {
      this.whipCooldown = 12; sfx('whip');
      const p1 = fr('presilha', this.facing * 11.5, -0.55, { life: 55, damage: 1, weapon: 'presilha', pierce: true }); p1.maxHits = 3;
      const p2 = fr('presilha', this.facing * 11.5, 0.55, { life: 55, damage: 1, weapon: 'presilha', pierce: true }); p2.maxHits = 3;
    } else if (sel === 'chapeu') {
      if (projectiles.some((q) => q.type === 'chapeu' && q.owner === this)) return;
      this.whipCooldown = 14; sfx('bee'); const pr = fr('chapeu', this.facing * 9.8, -0.5, { life: 165, damage: 1, weapon: 'chapeu' }); pr.hitSet = new Set(); pr.dir = this.facing; this.hatThrown = 1;
    } else if (sel === 'fita') {
      this.whipTimer = 14; this.whipCooldown = 18; this.whipHitSet.clear(); this.meleeWeapon = 'fita'; this.whipDamage = 1; sfx('whip');
      fr('fita', this.facing * 10, -0.2, { life: 38, damage: 1, weapon: 'fita' });
    } else if (sel === 'sombrinha') {
      this.whipCooldown = 28; this.shieldTimer = 95;
      if (!this.onGround) { this.vy = Math.min(this.vy, -6.5); }
      sfx('checkpoint'); spawnSparks(this.x + this.w / 2, this.y, 14, '#F06595');
    } else if (sel === 'espelho') {
      this.whipCooldown = 28; espelhoBeam(this);
    } else if (sel === 'boneca_pano') {
      this.whipCooldown = 24; sfx('whip'); fr('boneca_pano', this.facing * 5.5, -4, { gravity: 0.22, life: 95, damage: 3, weapon: 'rojao' });
    } else if (sel === 'corda') {
      this.whipTimer = 16; this.whipCooldown = 20; this.whipHitSet.clear(); this.meleeWeapon = 'corda'; this.whipDamage = 2;
      if (this.onGround) this.vy = -8.5;
      sfx('whip'); spawnSparks(this.x + this.w / 2, this.y + this.h / 2, 12, '#FFE066');
    } else if (sel === 'bilro') {
      this.whipCooldown = 15; sfx('whip');
      [-1.8, 0, 1.8].forEach((vy) => fr('bilro', this.facing * 10.5, vy, { life: 55, damage: 1, weapon: 'fita', pierce: true }));
    } else if (sel === 'cajuina') {
      this.whipCooldown = 28; sfx('fire');
      if (health < maxHealth) { health = Math.min(maxHealth, health + 1); spawnFloatingText('+1 ❤️ CAJUÍNA!', this.x + this.w / 2, this.y - 18, '#FFD43B'); updateHUD(); }
      fr('cajuina', this.facing * 6.5, -5.5, { gravity: 0.26, life: 100, damage: 3, weapon: 'candeeiro' });
    } else if (sel === 'baleadeira') {
      this.whipCooldown = 13; sfx('whip');
      fr('pedra', this.facing * 10.2, -1.5, { gravity: 0.11, life: 100, damage: 1, weapon: 'baleadeira', bounces: 1 });
    } else if (sel === 'pandeiro') {
      if (projectiles.some((q) => q.type === 'pandeiro')) return;
      this.whipCooldown = 12; sfx('bee');
      const pr = fr('pandeiro', this.facing * 9.5, 0, { life: 160, damage: 1, weapon: 'pandeiro' }); pr.hitSet = new Set(); pr.dir = this.facing;
    } else if (sel === 'rojao') {
      this.whipCooldown = 28; sfx('fire');
      if (this.onGround) this.vx -= this.facing * 1.8;
      fr('rojao', this.facing * 4.5, -0.3, { life: 85, damage: 4, weapon: 'rojao' });
    } else if (sel === 'sanfona') {
      this.whipCooldown = 36; sanfonaBlast(this);
      [-1.6, 0, 1.6].forEach((vy) => { const n = fr('nota', this.facing * 9.5, vy, { life: 45, damage: 1, weapon: 'sanfona', pierce: true }); n.maxHits = 3; });
    } else if (sel === 'porrete') {
      this.whipTimer = 15; this.whipCooldown = 22; this.whipHitSet.clear(); this.meleeWeapon = 'porrete'; this.whipDamage = 3; sfx('bonk');
      if (this.onGround) {
        addScreenShake(2); spawnDust(this.x + this.w / 2 + this.facing * 26, this.y + this.h, 6);
        const tr = new Projectile(this.x + this.w / 2 + this.facing * 24, this.y + this.h - 12, this.facing * 5.2, 0, 'zwave', { hostile: false, life: 24, damage: 1, weapon: 'porrete', pierce: true });
        tr.hitSet = new Set(); tr.owner = this; projectiles.push(tr);
      }
    } else if (sel === 'laco') {
      this.whipCooldown = 24; sfx('whip'); fr('laco', this.facing * 9.8, -0.2, { life: 36, damage: 1, weapon: 'laco' });
    } else if (sel === 'zabumba') {
      this.whipCooldown = 34; sfx('quake'); addScreenShake(3);
      [-1, 1].forEach((d) => { const pr = new Projectile(this.x + this.w / 2 + d * 20, this.y + this.h - 12, d * 6.5, 0, 'zwave', { hostile: false, life: 85, damage: 2, weapon: 'zabumba', pierce: true }); pr.hitSet = new Set(); pr.owner = this; projectiles.push(pr); });
    } else if (sel === 'candeeiro') {
      this.whipCooldown = 25; sfx('fire'); fr('candeeiro', this.facing * 6.4, -6.5, { gravity: 0.28, life: 120, damage: 2, weapon: 'candeeiro' });
    } else if (sel === 'chocalho') {
      this.whipCooldown = 36; chocalhoBlast(this);
    } else if (sel === 'triangulo') {
      this.whipCooldown = 13; sfx('coin'); fr('nota', this.facing * 12.8, 0, { life: 65, damage: 1, weapon: 'triangulo', pierce: true, bounces: 1 });
    } else if (sel === 'peixeira') {
      this.whipTimer = 12; this.whipCooldown = 15; this.whipHitSet.clear(); this.meleeWeapon = 'peixeira'; this.whipDamage = 2; sfx('whip');
      const px = fr('peixeira', this.facing * 12.2, -0.2, { life: 55, damage: 2, weapon: 'porrete', pierce: true }); px.maxHits = 2;
    } else if (sel === 'bacamarte') {
      this.whipCooldown = 28; sfx('quake'); addScreenShake(4);
      if (this.onGround) this.vx -= this.facing * 3.2; else this.vy = Math.min(this.vy, -5);
      for (let i = -2; i <= 2; i++) fr('bacamarte', this.facing * 11, i * 1.1, { life: 36, damage: 2, weapon: 'rojao' });
    } else if (sel === 'berimbau') {
      this.whipCooldown = 18; this.shieldTimer = 45; sfx('coin');
      fr('berimbau', this.facing * 8.5, -1.2, { life: 110, damage: 2, weapon: 'triangulo', pierce: true });
    } else if (sel === 'rede') {
      this.whipCooldown = 22; sfx('whip'); fr('rede', this.facing * 8.5, -1.0, { gravity: 0.06, life: 55, damage: 1, weapon: 'laco' });
    } else if (sel === 'pipa') {
      this.whipCooldown = 22; sfx('whip');
      if (!this.onGround) this.vy = -7.5;
      const kp = fr('pipa', this.facing * 5.2, -2.2, { life: 110, damage: 2, weapon: 'pipa', pierce: true }); kp.maxHits = 5;
    } else if (sel === 'chiclete') {
      this.whipCooldown = 18; sfx('bee'); fr('chiclete', this.facing * 8.8, -0.8, { gravity: 0.04, life: 85, damage: 1, weapon: 'tapioca' });
    } else if (sel === 'piao') {
      this.whipCooldown = 18; sfx('whip');
      const pi = fr('piao', this.facing * 6.8, 0, { life: 120, damage: 2, weapon: 'porrete', pierce: true }); pi.maxHits = 6;
    } else if (sel === 'bolinha_gude') {
      this.whipCooldown = 18; sfx('coin');
      for (let i = 0; i < 5; i++) fr('bolinha_gude', this.facing * (7.5 + i * 0.9), -2.5 - i * 0.7, { gravity: 0.22, life: 120, damage: 1, weapon: 'baleadeira', bounces: 4 });
    } else if (sel === 'bombinha') {
      this.whipCooldown = 22; sfx('fire');
      for (let i = -1; i <= 2; i++) fr('bombinha', this.facing * (5 + i * 1.4), -4.5 - Math.abs(i), { gravity: 0.24, life: 80, damage: 2, weapon: 'rojao' });
    } else if (sel === 'aviao_papel') {
      this.whipCooldown = 16; sfx('whip');
      [-1.5, 0, 1.5].forEach((vy) => fr('aviao_papel', this.facing * 8.5, vy, { life: 95, damage: 1, weapon: 'presilha' }));
    } else if (sel === 'ioio') {
      if (projectiles.some((q) => q.type === 'ioio' && q.owner === this)) return;
      this.whipCooldown = 14; sfx('whip');
      const io = fr('ioio', this.facing * 11, 0, { life: 110, damage: 2, weapon: 'pandeiro', pierce: true }); io.dir = this.facing;
    } else if (sel === 'ciscar') {
      this.whipTimer = 18; this.whipCooldown = 22; this.whipHitSet.clear(); this.meleeWeapon = 'ciscar'; this.whipDamage = 3; sfx('quake');
      spawnDust(this.x + this.w / 2, this.y + this.h, 14);
      for (let i = -2; i <= 2; i++) if (i !== 0) fr('pedra', i * 4.5, -3.5, { gravity: 0.2, life: 45, damage: 2, weapon: 'baleadeira' });
      spawnFloatingText('CISCAR 360°! 🐔', this.x + this.w / 2, this.y - 16, '#FFD43B');
    } else if (sel === 'ovo_ouro') {
      this.whipCooldown = 24; sfx('fire'); fr('ovo_ouro', this.facing * 6.5, -5.5, { gravity: 0.25, life: 100, damage: 4, weapon: 'rojao' });
    } else if (sel === 'cacarejo' || sel === 'berro_bode') {
      this.whipCooldown = 28; chocalhoBlast(this);
    } else if (sel === 'bicada_furadeira' || sel === 'espora_prata' || sel === 'tatu_foguete') {
      this.whipCooldown = 24; this.dash = 22; this.vx = this.facing * 11.5; sfx('charge');
      spawnSparks(this.x + this.w / 2, this.y + this.h / 2, 12, '#FFD43B');
    } else if (sel === 'ninho_pintinhos') {
      this.whipCooldown = 28; sfx('coin');
      [-1, 0, 1].forEach((k) => { const pt = fr('pintinho', this.facing * (4.8 + k * 0.8), -2, { life: 150, damage: 2, weapon: 'pisao', pierce: true }); pt.maxHits = 4; });
    } else if (sel === 'redemoinho_penas') {
      this.whipCooldown = 26; sfx('whip');
      const tw = fr('redemoinho_penas', this.facing * 4.5, 0, { life: 110, damage: 2, weapon: 'sanfona', pierce: true }); tw.maxHits = 8;
    } else if (sel === 'cabecada_sismica' || sel === 'terremoto_tatu') {
      this.whipCooldown = 28; sfx('quake'); addScreenShake(5);
      [-1, 1].forEach((d) => { const pr = new Projectile(this.x + this.w / 2 + d * 20, this.y + this.h - 12, d * 7, 0, 'zwave', { hostile: false, life: 85, damage: 3, weapon: 'zabumba', pierce: true }); pr.hitSet = new Set(); pr.owner = this; projectiles.push(pr); });
    } else if (sel === 'coice_bode') {
      this.whipTimer = 15; this.whipCooldown = 20; this.whipHitSet.clear(); this.meleeWeapon = 'coice_bode'; this.whipDamage = 3; sfx('bonk');
    } else if (sel === 'lata_toddy') {
      this.whipCooldown = 20; sfx('metal');
      for (let i = 0; i < 4; i++) fr('lata_toddy', this.facing * (6.5 + i * 1.1), -3 - i * 0.8, { gravity: 0.22, life: 110, damage: 2, weapon: 'porrete', bounces: 3 });
    } else if (sel === 'salto_cabrito' || sel === 'cavada_sertaneja') {
      this.whipCooldown = 26; this.vy = -13.5; this.onGround = false; this.invuln = Math.max(this.invuln, 35); sfx('jump');
      [-1, 1].forEach((d) => fr('zwave', d * 6, 0, { life: 60, damage: 2, weapon: 'zabumba', pierce: true }));
    } else if (sel === 'furia_toddy') {
      this.whipTimer = 26; this.whipCooldown = 30; this.whipHitSet.clear(); this.meleeWeapon = 'furia_toddy'; this.whipDamage = 3; this.dash = 24; sfx('bossRoar');
    } else if (sel === 'resposta_braba') {
      this.whipCooldown = 22; sfx('bossRoar'); fr('resposta_braba', this.facing * 8.5, -0.5, { life: 75, damage: 4, weapon: 'rojao' });
    } else if (sel === 'bengala_couro') {
      this.whipTimer = 15; this.whipCooldown = 18; this.whipHitSet.clear(); this.meleeWeapon = 'bengala_couro'; this.whipDamage = 3; this.shieldTimer = 45; sfx('bonk');
    } else if (sel === 'cachimbo_fumaca') {
      this.whipCooldown = 26; chocalhoBlast(this);
      for (let i = 0; i < 12; i++) spawnDust(this.x + this.w / 2 + (Math.random() - 0.5) * 60, this.y + 20, 2, '#CED4DA');
    } else if (sel === 'forro_trovao') {
      this.whipCooldown = 34; sanfonaBlast(this);
      if (L) {
        L.enemies.slice(0, 4).forEach((e) => { if (!e.dead && Math.abs(e.x - this.x) < 380) { e.hit(4, this.x, 'sanfona'); spawnSparks(e.x + e.w / 2, e.y, 16, '#74C0FC'); } });
      }
    } else if (sel === 'placa_casco') {
      this.whipCooldown = 18; sfx('bonk');
      [-1.5, 0, 1.5].forEach((vy) => fr('placa_casco', this.facing * 9.5, vy - 1, { gravity: 0.16, life: 100, damage: 2, weapon: 'porrete', bounces: 2 }));
    } else if (sel === 'espinho_mandacaru') {
      this.whipCooldown = 22; sfx('spine');
      for (let a = 0; a < 8; a++) { const ang = (a / 8) * Math.PI * 2; fr('espinho_mandacaru', Math.cos(ang) * 9, Math.sin(ang) * 9, { life: 55, damage: 2, weapon: 'baleadeira' }); }
    }
    inv[sel]--;
    if (inv[sel] <= 0) {
      delete inv[sel];
      if (this === player) {
        setSel(this, def);
        spawnFloatingText(`Acabou! Voltou ${(WEAPON_INFO[def] || {}).name || 'arma padrão'}`, this.x + this.w / 2, this.y - 10, '#FFF');
      } else this._aiWeapon = def;
    }
    updateWeaponUI();
  }
  performWhipAttack() {
    this.meleeWeapon = 'chicote'; this.whipDamage = 1 + (this.powerCubes || 0) + (unionTimer > 0 ? 2 : 0);
    this.whipTimer = 14; this.whipCooldown = 20; this.whipHitSet.clear(); sfx('whip');
    spawnSparks(this.x + this.w / 2 + this.facing * 52, this.y + 18, 8, '#FFD43B');
  }
  bounce(power = -8.5) { this.vy = keys.jump ? power * 1.3 : power; this.onGround = false; this.coyote = 0; }
  takeDamage(amount = 1, srcX) {
    if (currentState === GAME_STATE.LEVEL_COMPLETE) return;
    if (this.invuln > 0 || this.dead || this.asaBrancaTimer > 0 || this.dash > 0 || unionTimer > 0) return;
    // O parceiro controlado pelo computador não perde coração: fica tonto um pouco
    if (this !== player) { if (this.dazed <= 0) { this.dazed = 80; this.invuln = 140; this.vy = -5; this.vx = (srcX != null && this.x + this.w / 2 < srcX ? -1 : 1) * 3; sfx('bonk'); } return; }
    // v4.1: Montaria não dá imunidade total. O jogador e a montaria tomam dano real!
    if (this.mount) {
      const wasType = this.mount.type || 'jegue';
      const mName = wasType === 'bode_toddy' ? 'O BODE TODDY' : 'O JEGUE';
      tookDamageThisRun = true;
      health -= 1;
      this.invuln = 70;
      hitstopFrames = 5;
      addScreenShake(6);
      triggerHaptic(60);
      sfx('hurt');
      spawnSparks(this.x + this.w / 2, this.y + this.h / 2, 12, '#FA5252');
      const away = srcX != null ? (this.x + this.w / 2 < srcX ? -1 : 1) : -this.facing;
      this.vy = -6; this.vx = away * 4;
      if (--this.mount.hp <= 0) {
        this.setMount(false);
        spawnDust(this.x + this.w / 2, this.y + this.h, 12);
        spawnFloatingText(`DERRUBADO! ${mName} CORREU!`, this.x + this.w / 2, this.y - 16, '#FF6B6B');
        if (typeof fleeJegue === 'function') fleeJegue(this, wasType);
        updateWeaponUI();
      } else {
        sfx('bonk');
        spawnFloatingText(`${mName} LEVOU GOLPE! (${this.mount.hp}/${this.mount.maxHp || 2} ❤️)`, this.x + this.w / 2, this.y - 14, '#FFE8A3');
      }
      if (health <= 0) this.die();
      return;
    }
    if (heldArmor > 0) { heldArmor = 0; this.invuln = 90; sfx('clank'); addScreenShake(3); spawnSparks(this.x + this.w / 2, this.y + this.h / 2, 14, '#C68B59'); spawnFloatingText('O GIBÃO AGUENTOU!', this.x + this.w / 2, this.y - 12, '#FFD8A8'); updateWeaponUI(); return; }
    tookDamageThisRun = true; health -= amount; this.invuln = (currentLevel && currentLevel.worldIdx < 2) ? 150 : 120; hitstopFrames = 5; addScreenShake(6); triggerHaptic(60); sfx('hurt');
    const away = srcX != null ? (this.x + this.w / 2 < srcX ? -1 : 1) : -this.facing;
    this.vy = -6; this.vx = away * 4; this.onVine = null;
    spawnSparks(this.x + this.w / 2, this.y + this.h / 2, 10, '#FA5252');
    if (health <= 0) this.die();
  }
  die() {
    if (this !== player) { if (typeof teleportCompanion === 'function') teleportCompanion(); return; }
    if (this.mount) this.setMount(false);
    if (this.dead) return; this.dead = true; health = 0; sfx('death'); triggerHaptic(150); addScreenShake(8);
    spawnSparks(this.x + this.w / 2, this.y + this.h / 2, 20, '#FFF');
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
    if (this.inBush && this === player) ctx.globalAlpha = 0.52;
    if (this.asaBrancaTimer > 0) {
      const gx = lerp(this.prevX, this.x, renderAlpha) - camX + this.w / 2, gy = lerp(this.prevY, this.y, renderAlpha) - camY + this.h / 2;
      const rg = ctx.createRadialGradient(gx, gy, 6, gx, gy, 46); rg.addColorStop(0, 'rgba(255,255,255,0.55)'); rg.addColorStop(1, 'rgba(191,233,255,0)');
      ctx.fillStyle = rg; ctx.fillRect(gx - 46, gy - 46, 92, 92);
    }
    const A3 = typeof window !== 'undefined' && window.OxeArt3;
    const sm = typeof window !== 'undefined' && window._oxeSpecialMode;
    if (A3 && this.dazed > 0 && Math.floor(this.dazed / 6) % 2 === 0) ctx.globalAlpha = 0.6;
    // Rastro dourado/ciano de velocidade durante o Especial da União Suprema ou Dash!
    if ((unionTimer > 0 || (this.dash || 0) > 0) && !this.dead) {
      const sx = lerp(this.prevX, this.x, renderAlpha) - camX, sy = lerp(this.prevY, this.y, renderAlpha) - camY;
      ctx.save();
      for (let k = 1; k <= 2; k++) {
        ctx.fillStyle = k === 1 ? 'rgba(255,212,59,0.28)' : 'rgba(77,171,247,0.20)';
        ctx.beginPath();
        ctx.ellipse(sx + this.w / 2 - (this.facing || 1) * k * 14, sy + this.h / 2, this.w * 0.45, this.h * 0.46, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    // Asa-Delta de Couro Nordestina com Turbinas de Rojão na fase 5-4 (Voo do Carcará)!
    if (sm === 'shmup') {
      const hx = lerp(this.prevX, this.x, renderAlpha) - camX + this.w / 2;
      const hy = lerp(this.prevY, this.y, renderAlpha) - camY + this.h / 2;
      ctx.save();
      // Asa triangular de couro do Cariri
      ctx.fillStyle = this === player ? '#D9480F' : '#1C7ED6';
      ctx.strokeStyle = '#3B1F0E'; ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(hx + 28, hy - 14);
      ctx.lineTo(hx - 32, hy - 34);
      ctx.lineTo(hx - 20, hy + 8);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // Costuras e meia-lua branca de couro
      ctx.strokeStyle = '#FFE8A3'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(hx + 22, hy - 14); ctx.lineTo(hx - 26, hy - 22); ctx.stroke();
      // Turbinas de rojão soltando fogo
      ctx.fillStyle = '#495057'; ctx.fillRect(hx - 28, hy - 10, 14, 7);
      ctx.fillStyle = frameCount % 2 ? '#FFD43B' : '#FF6B6B';
      ctx.beginPath();
      ctx.moveTo(hx - 28, hy - 10);
      ctx.lineTo(hx - 48 - (frameCount % 8), hy - 6.5);
      ctx.lineTo(hx - 28, hy - 3);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // Em OxeCraft (2-4), TODOS os 7 heróis, amigos e montarias usam o modelo 3D em blocos de Minecraft!
    if (sm === 'minecraft' && window.OxeHD && window.OxeHD.drawTonhoHD) {
      window.OxeHD.drawTonhoHD(ctx, camX, camY, this, renderAlpha, frameCount);
      ctx.globalAlpha = 1;
      return;
    }
    if (A3 && (this.hero !== 'tonho' || this.mount || sm === 'kart' || sm === 'shmup' || sm === 'brawlstars' || unionTimer > 0)) {
      A3.drawHero(ctx, camX, camY, this, renderAlpha, frameCount);
      ctx.globalAlpha = 1;
      return;
    }
    if (typeof window !== 'undefined' && window.OxeHD && window.OxeHD.drawTonhoHD) {
      if (this.dazed > 0 && A3) { window.OxeHD.drawTonhoHD(ctx, camX, camY, this, renderAlpha, frameCount); A3.drawDazed(ctx, camX, camY, this, renderAlpha, frameCount); ctx.globalAlpha = 1; return; }
      if (this.dead) {
        const cx = lerp(this.prevX, this.x, renderAlpha) - camX + this.w / 2, cy = lerp(this.prevY, this.y, renderAlpha) - camY + this.h / 2;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI); ctx.translate(-cx, -cy);
        window.OxeHD.drawTonhoHD(ctx, camX, camY, this, renderAlpha, frameCount); ctx.restore(); ctx.globalAlpha = 1; return;
      }
      window.OxeHD.drawTonhoHD(ctx, camX, camY, this, renderAlpha, frameCount);
      ctx.globalAlpha = 1;
      return;
    }
  }
}

// v4.0: OS 6 AMIGOS DO TONHO (cada um com física, armas e habilidades próprias!)
class Zefinha extends Tonho {
  constructor(x, y) { super(x, y); this.hero = 'zefinha'; this.w = 26; this.h = 44; this.maxSpd = 5.3; this.jumpV = -11.8; this.canGlide = false; this.canDouble = true; }
}
class CabecaVento extends Tonho {
  constructor(x, y) { super(x, y); this.hero = 'cabeca_vento'; this.w = 26; this.h = 42; this.maxSpd = 5.5; this.jumpV = -12.4; this.canGlide = true; this.canDouble = true; }
}
class GalinhaMelindrosa extends Tonho {
  constructor(x, y) { super(x, y); this.hero = 'galinha'; this.w = 26; this.h = 40; this.maxSpd = 5.4; this.jumpV = -11.6; this.canGlide = true; this.canDouble = true; this.maxFlaps = 3; this.flapsLeft = 3; }
}
class BodeToddy extends Tonho {
  constructor(x, y) { super(x, y); this.hero = 'bode_toddy'; this.w = 32; this.h = 44; this.maxSpd = 5.6; this.jumpV = -13.0; this.canGlide = false; this.canDouble = true; }
}
class SeuLunga extends Tonho {
  constructor(x, y) { super(x, y); this.hero = 'seu_lunga'; this.w = 28; this.h = 46; this.maxSpd = 4.7; this.jumpV = -12.0; this.canGlide = false; this.canDouble = true; }
}
class TatuBola extends Tonho {
  constructor(x, y) { super(x, y); this.hero = 'tatu_bola'; this.w = 30; this.h = 40; this.maxSpd = 5.4; this.jumpV = -12.2; this.canGlide = false; this.canDouble = true; }
}
function makeHero(kind, x, y) {
  switch (kind) {
    case 'zefinha': return new Zefinha(x, y);
    case 'cabeca_vento': return new CabecaVento(x, y);
    case 'galinha': return new GalinhaMelindrosa(x, y);
    case 'bode_toddy': return new BodeToddy(x, y);
    case 'seu_lunga': return new SeuLunga(x, y);
    case 'tatu_bola': return new TatuBola(x, y);
    default: return new Tonho(x, y);
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
// v3.0: 12 bichos novos do Nordeste
Object.assign(ENEMY_DEF, {
  prea:           { w: 26, h: 18, hp: 1, spd: 1.6, color: '#A68A64' },
  cascavel:       { w: 40, h: 22, hp: 2, spd: 0.7, color: '#C2A878' },
  caititu:        { w: 40, h: 28, hp: 2, spd: 1.0, color: '#5C4A3A' },
  lacraia:        { w: 54, h: 16, hp: 3, spd: 0.9, color: '#B5482E' },
  onca_pintada:   { w: 50, h: 30, hp: 4, spd: 1.2, color: '#E8A33D' },
  rola_bosta:     { w: 26, h: 20, hp: 2, spd: 0.6, color: '#2B3A4A' },
  teju:           { w: 50, h: 22, hp: 3, spd: 0.9, color: '#3D3D3D' },
  ararinha_azul:  { w: 30, h: 24, hp: 1, spd: 1.6, color: '#4DABF7', fly: true },
  rasga_mortalha: { w: 32, h: 30, hp: 2, spd: 1.4, color: '#E9DCC0', fly: true },
  alamoa:         { w: 30, h: 46, hp: 3, spd: 0.8, color: '#E7F5FF', fly: true },
  cumacanga:      { w: 30, h: 30, hp: 2, spd: 1.3, color: '#FF922B', fly: true },
  muricoca:       { w: 18, h: 16, hp: 1, spd: 1.7, color: '#495057', fly: true }
});
// v2.4: LENDAS DO NORDESTE — chefes de meio de mundo (aparecem no fim de algumas fases)
const LEGEND_DEF = {
  caipora:        { w: 34, h: 48, hp: 8,  spd: 2.4, color: '#2F9E44', score: 1500, name: 'Caipora', sub: 'Lenda das matas do Nordeste · protetora dos bichos' },
  cabra_cabriola: { w: 54, h: 46, hp: 9,  spd: 1.3, color: '#5C3D2E', score: 1800, name: 'Cabra-Cabriola', sub: 'Lenda de Pernambuco e da Bahia · cospe fogo' },
  perna_cabeluda: { w: 42, h: 92, hp: 10, spd: 2.5, color: '#C68B59', score: 2000, name: 'Perna Cabeluda', sub: 'Lenda do Recife · a perna que pula sozinha' },
  cabeca_de_cuia: { w: 56, h: 52, hp: 9,  spd: 2.2, color: '#E0A872', score: 2000, name: 'Cabeça de Cuia', sub: 'Lenda do Piauí · mora no rio Parnaíba' },
  labatut:        { w: 60, h: 96, hp: 12, spd: 1.2, color: '#6F4E37', score: 2500, name: 'Labatut', sub: 'Lenda do Ceará · o gigante de um olho só' },
  quibungo:       { w: 62, h: 70, hp: 11, spd: 1.3, color: '#5B4636', score: 2500, name: 'Quibungo', sub: 'Lenda da Bahia · tem uma boca nas costas' }
};
Object.keys(LEGEND_DEF).forEach((k) => { ENEMY_DEF[k] = Object.assign({ legend: true }, LEGEND_DEF[k]); });
// Pontos por espécie (as mais difíceis valem mais)
const ENEMY_SCORE = { calango: 100, tatu: 150, carcara: 150, morcego: 120, cacto_atirador: 200, bode_doido: 300, fulozinha: 200, papa_figo: 250,
  caranguejo: 150, baiacu: 200, salamandra: 180, sapo_cururu: 150, marimbondo: 150, jararaca: 200, cangaceiro_sombra: 300,
  mula_sem_cabeca: 350, boitata_fogo: 300, lobisomem: 400, escorpiao: 160, urubu: 180, jacare: 300,
  prea: 100, cascavel: 220, caititu: 220, lacraia: 240, onca_pintada: 420, rola_bosta: 150, teju: 260, ararinha_azul: 150, rasga_mortalha: 220, alamoa: 300, cumacanga: 280, muricoca: 80 };
let legendIntro = null; // { name, sub, timer }
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
    const wIdx = opts.worldIdx | 0;
    this.legend = !!d.legend; this.worldIdx = wIdx;
    this.isPacGhost = !!(opts.isPacGhost || opts.pacGhost);
    this.pacGhost = this.isPacGhost;
    this.ghostColor = opts.ghostColor || '';
    this.ghostName = opts.ghostName || '';
    this.scaredTimer = 0; this.respawnTimer = 0;
    this.isBrawlBoss = !!(opts.isBrawlBoss || opts.brawlBoss);
    this.brawlBoss = this.isBrawlBoss;
    if (this.isBrawlBoss) this.legend = false;
    this.brawlerName = opts.brawlerName || opts.name || '';
    if (!this.name && this.brawlerName) this.name = this.brawlerName;
    if (opts.hp != null) {
      this.hp = opts.hp;
      this.speed = (d.spd || 1.2) * (this.isBrawlBoss ? 1.25 : 1.05);
    } else if (!this.legend) {
      this.hp = d.hp + (wIdx >= 1 ? 1 : 0) + (wIdx >= 4 ? 1 : 0) + (opts.elite ? 1 : 0);
      this.speed = d.spd * (wIdx === 0 ? 0.95 : 1 + wIdx * 0.07) * (1 - oxeEase(wIdx) / 2);
    } else {
      this.hp = Math.max(4, Math.round((d.hp - 2 + wIdx * 1.5 | 0) * (1 - oxeEase(wIdx))));
      this.name = d.name; this.sub = d.sub; this.st = 'intro'; this.alpha = 1; this.homeX = x; this.homeY = y;
    }
    if (this.isBrawlBoss) { this.w = Math.round(this.w * 1.25); this.h = Math.round(this.h * 1.25); this.scoreValue = 1500; }
    // v4.1: com 2 personagens (dupla sertaneja), a fase fica mais desafiadora (+vida e velocidade)
    const isDuoActive = (currentLevel && (currentLevel.duo || currentLevel.partner)) || (typeof companion !== 'undefined' && companion && !companion.dead);
    if (isDuoActive && !this.isPacGhost) {
      this.hp = Math.round(this.hp * 1.35) + 1;
      this.speed = (this.speed || 1) * 1.18;
    }
    this.maxHp = this.hp; this.hitCd = 0; this.stagger = 0; this.kbx = 0; this.dodged = false;
    this.scoreValue = this.scoreValue || d.score || ENEMY_SCORE[type] || 100;
    if (this.vx) this.vx = -this.speed;
  }
  // persegue o jogador quando ele chega perto, sem se jogar de penhascos
  chase(dx, dy, spd, range = 240) {
    if (!this.legend && this.worldIdx === 0) range *= 0.6; // no sertão os bichos são mais distraídos
    if (Math.abs(dx) < range && Math.abs(dy) < 70) {
      const dir = Math.sign(dx) || this.facing;
      if (this.onGround && !this.groundAhead(dir)) { this.facing = dir; this.vx = 0; return; }
      this.vx = dir * spd * 1.55; this.walk(spd * 1.55); if (Math.abs(dx) > 12) this.facing = dir;
    } else this.walk(spd);
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
    if (currentLevel && this.y > (currentLevel.height || 2000) + 100) {
      if (this.legend) { this.x = this.homeX; this.y = this.homeY - 60; this.vy = 0; this.vx = 0; spawnLeaves(this.x + this.w / 2, this.y, 10); } // lenda nunca morre caindo
      else this.dead = true;
    }
  }
  walk(spd) {
    this.x += this.vx;
    let blocked = false;
    for (const p of getPlatforms()) if (!p.oneWay && checkAABB(this, p) && p.y < this.y + this.h - 10) { this.x = this.vx > 0 ? p.x - this.w - 1 : p.x + p.w + 1; blocked = true; }
    if (blocked || (this.onGround && !this.groundAhead(Math.sign(this.vx)))) { this.vx = -this.vx; }
    this.vx = Math.sign(this.vx || -1) * spd; this.facing = Math.sign(this.vx);
  }
  updateDeath() {
    this.prevX = this.x; this.prevY = this.y;
    this.deathVy = (this.deathVy || -6) + 0.45; this.y += this.deathVy; this.x += this.kbx * 0.5;
    if (--this.deathTimer <= 0) this.remove = true;
  }
  update() {
    this.prevX = this.x; this.prevY = this.y; if (this.dead) return;
    if (this.respawnTimer > 0) {
      if (--this.respawnTimer <= 0) { this.x = this.baseX; this.y = this.baseY; this.scaredTimer = 0; spawnSparks(this.x + this.w / 2, this.y + this.h / 2, 10, '#4DABF7'); }
      return;
    }
    this.t++; this.timer++; if (this.hitFlashTimer > 0) this.hitFlashTimer--; if (this.hitCd > 0) this.hitCd--;
    if (this.scaredTimer > 0) this.scaredTimer--;
    if (this.bubbleTimer > 0) {
      this.bubbleTimer--;
      this.y -= 0.25 + Math.sin(this.t * 0.2) * 0.2;
      return;
    }
    this.hurtTimer = this.hitFlashTimer;
    let p = player;
    if (typeof companion !== 'undefined' && companion && !companion.dead) {
      const dPlayer = Math.hypot((player.x + player.w / 2) - (this.x + this.w / 2), (player.y + player.h / 2) - (this.y + this.h / 2));
      const dComp = Math.hypot((companion.x + companion.w / 2) - (this.x + this.w / 2), (companion.y + companion.h / 2) - (this.y + this.h / 2));
      if (dComp < dPlayer) p = companion;
    }
    const dx = p ? (p.x + p.w / 2) - (this.x + this.w / 2) : 999, dy = p ? (p.y + p.h / 2) - (this.y + this.h / 2) : 999;

    // ----- MODO ESPECIAL PAC-OXE (1-4): Fantasmas do labirinto -----
    if (this.isPacGhost || (currentLevel && currentLevel.specialMode === 'pacman')) {
      const spd = this.scaredTimer > 0 ? 1.8 : 2.7;
      const dirSign = this.scaredTimer > 0 ? -1 : 1;
      if (this.timer % 26 === 0 || (this.vx === 0 && this.vy === 0)) {
        if (Math.abs(dx) > Math.abs(dy)) { this.vx = Math.sign(dx || 1) * dirSign * spd; this.vy = (Math.random() - 0.5) * spd * 0.7; }
        else { this.vy = Math.sign(dy || 1) * dirSign * spd; this.vx = (Math.random() - 0.5) * spd * 0.7; }
      }
      this.x = clamp(this.x + this.vx, 28, (currentLevel ? currentLevel.levelW : 1680) - this.w - 28);
      this.y = clamp(this.y + this.vy, 48, (currentLevel ? currentLevel.levelH : 540) - this.h - 44);
      this.facing = this.vx >= 0 ? 1 : -1;
      return;
    }

    // ----- MODO ESPECIAL BRAWL STARS (4-4, 6-4, 8-4): Arena vista de cima -----
    if (currentLevel && currentLevel.specialMode === 'brawlstars') {
      const dist = Math.hypot(dx, dy) || 1;
      const canSee = !(p && p.inBush && dist > 155);
      const spd = this.isBrawlBoss ? 2.15 : 1.75;
      if (canSee && dist < 560) {
        const keepDist = this.isBrawlBoss && dist < 120 ? -0.6 : 1;
        this.vx = (dx / dist) * spd * keepDist;
        this.vy = (dy / dist) * spd * keepDist;
        this.facing = dx >= 0 ? 1 : -1;
        if (this.timer % (this.isBrawlBoss ? 68 : 110) === 0) {
          const baseAng = Math.atan2(dy, dx);
          const count = this.isBrawlBoss ? 3 : 1;
          for (let k = 0; k < count; k++) {
            const a = baseAng + (k - (count - 1) / 2) * 0.24;
            projectiles.push(new Projectile(this.x + this.w / 2, this.y + this.h / 2, Math.cos(a) * 4.6, Math.sin(a) * 4.6, this.isBrawlBoss ? 'fire' : 'spine', { life: 95 }));
          }
          sfx('spine');
        }
      } else {
        this.vx = Math.cos(this.t * 0.03) * spd * 0.7;
        this.vy = Math.sin(this.t * 0.04) * spd * 0.7;
        this.facing = this.vx >= 0 ? 1 : -1;
      }
      this.x = clamp(this.x + this.vx, 42, (currentLevel.levelW || 2200) - this.w - 42);
      this.y = clamp(this.y + this.vy, 54, (currentLevel.levelH || 540) - this.h - 46);
      return;
    }

    // atordoado pelo golpe: recua um pouco e não ataca
    if (this.stagger > 0) {
      this.stagger--;
      if (!this.fly) { this.physics(); this.x += this.kbx; for (const pl of getPlatforms()) if (!pl.oneWay && checkAABB(this, pl) && pl.y < this.y + this.h - 10) { this.x -= this.kbx; this.kbx = 0; } }
      else this.x += this.kbx;
      this.kbx *= 0.82; return;
    }
    if (this.legend) { this.updateLegend(dx, dy); return; }
    // esquiva: alguns pulam quando o chicote vem
    if (!this.fly && this.onGround && p && p.whipTimer > 9 && !this.dodged && this.type !== 'cacto_atirador' && this.type !== 'bode_doido' &&
        Math.abs(dx) < 120 && Math.abs(dy) < 50) {
      this.dodged = true; if (this.worldIdx > 0 && Math.random() < 0.1 + this.worldIdx * 0.06) { this.vy = -7.5; this.onGround = false; }
    }
    if (p && p.whipTimer === 0) this.dodged = false;
    switch (this.type) {
      case 'calango': this.physics(); this.chase(dx, dy, this.speed + (Math.sin(this.t * 0.05) > 0.7 ? 1.2 : 0), 200); break;
      case 'tatu': this.physics(); this.rolling = Math.abs(dx) < 160 && Math.abs(dy) < 40; if (this.rolling) this.chase(dx, dy, 2.2, 160); else this.walk(this.speed); break;
      case 'caranguejo': this.physics(); this.chase(dx, dy, this.speed * (Math.sin(this.t * 0.04) > 0 ? 1 : 1.8), 220); break;
      case 'escorpiao': this.physics();
        if (this.st === 'sting') { this.vx = 0; if (this.timer - this.stT === 18) { sfx('whip'); projectiles.push(new Projectile(this.x + this.w / 2 + this.facing * 34, this.y + this.h / 2 - 4, 0, 0, 'slash', { life: 9, w: 40, h: 30 })); } if (this.timer - this.stT > 50) this.st = null; }
        else if (Math.abs(dx) < 75 && Math.abs(dy) < 40 && this.onGround) { this.st = 'sting'; this.stT = this.timer; this.facing = Math.sign(dx) || this.facing; }
        else this.chase(dx, dy, this.speed, 210); break;
      case 'urubu':
        if (this.st === 'swoop') { this.x += this.vx; this.y += this.vy; this.vy -= 0.16; if (this.y <= this.baseY) { this.y = this.baseY; this.st = null; } }
        else {
          this.x = this.baseX + Math.cos(this.t * 0.018) * this.range; this.y = this.baseY + Math.sin(this.t * 0.036) * 18; this.facing = -Math.sin(this.t * 0.018) >= 0 ? 1 : -1;
          if (Math.abs(dx) < 40 && dy > 40 && this.timer % 70 === 0) { sfx('spine'); projectiles.push(new Projectile(this.x + this.w / 2, this.y + this.h, 0, 1, 'bone', { gravity: 0.25 })); }
          if (Math.abs(dx) < 150 && dy > 60 && dy < 260 && this.timer % 160 === 0) { this.st = 'swoop'; this.vy = 5.5; this.vx = Math.sign(dx) * 2.4; this.baseX = this.x - Math.cos(this.t * 0.018) * this.range; }
        } break;
      case 'jacare': this.physics();
        if (this.st === 'lunge') { this.vx = this.facing * 6.2; this.walk(6.2); if (this.timer - this.stT > 36) { this.st = 'rest'; this.stT = this.timer; } }
        else if (this.st === 'rest') { this.vx = 0; if (this.timer - this.stT > 70) this.st = null; }
        else if (Math.abs(dx) < 220 && Math.abs(dy) < 50 && this.onGround) { this.facing = Math.sign(dx) || this.facing; if (this.groundAhead(this.facing)) { this.st = 'lunge'; this.stT = this.timer; sfx('bossRoar'); } }
        else this.walk(this.speed * 0.6); break;
      case 'salamandra': this.physics(); this.chase(dx, dy, this.speed, 180);
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
      // ---------- v3.0 ----------
      case 'prea': this.physics(); // corre em rajadas e dá pulinhos
        if (this.onGround && this.timer % 70 === 0 && Math.abs(dx) < 260) { this.vy = -5.5; }
        this.chase(dx, dy, this.speed * (Math.sin(this.t * 0.09) > 0.3 ? 1.9 : 0.6), 230); break;
      case 'cascavel': this.physics(); // chocalha (aviso) e dá o bote
        if (this.st === 'rattle') { this.vx = 0; if (this.timer % 8 === 0) sfx('bee'); if (this.timer - this.stT > 38) { this.st = 'strike'; this.stT = this.timer; } }
        else if (this.st === 'strike') { this.vx = this.facing * 6.4; this.walk(6.4); if (this.timer - this.stT > 12) { this.st = 'rest'; this.stT = this.timer; } }
        else if (this.st === 'rest') { this.vx = 0; if (this.timer - this.stT > 60) this.st = null; }
        else if (Math.abs(dx) < 150 && Math.abs(dy) < 50 && this.onGround) { this.st = 'rattle'; this.stT = this.timer; this.facing = Math.sign(dx) || this.facing; }
        else this.walk(this.speed); break;
      case 'caititu': this.physics(); // dispara em linha reta e para na beira
        if (this.st === 'dash') { this.vx = this.facing * 5; const bx = this.x; this.walk(5); if (this.timer % 4 === 0) spawnDust(this.x + this.w / 2, this.y + this.h, 1); if (this.timer - this.stT > 50 || Math.abs(this.x - bx) < 0.5 || Math.sign(this.vx) !== this.facing) { this.st = 'rest'; this.stT = this.timer; } }
        else if (this.st === 'rest') { this.vx = 0; if (this.timer - this.stT > 55) this.st = null; }
        else if (Math.abs(dx) < 260 && Math.abs(dy) < 50 && this.onGround) { this.facing = Math.sign(dx) || this.facing; if (this.groundAhead(this.facing)) { this.st = 'dash'; this.stT = this.timer; sfx('charge'); } }
        else this.walk(this.speed); break;
      case 'lacraia': this.physics(); this.chase(dx, dy, this.speed, 160); this.w = 22 + this.hp * 11; break;
      case 'onca_pintada': this.physics(); // espreita e dá o bote no ar
        if (!this.onGround) { this.x += this.vx; for (const pl of getPlatforms()) if (!pl.oneWay && checkAABB(this, pl) && pl.y < this.y + this.h - 10) { this.x -= this.vx; this.vx = 0; } }
        else if ((this._cd || 0) > 0) { this._cd--; this.vx = 0; }
        else if (Math.abs(dx) < 300 && Math.abs(dy) < 90) { this.facing = Math.sign(dx) || this.facing; this.crouch = (this.crouch || 0) + 1; this.walk(this.speed * 0.5);
          if (this.crouch > 50) { this.crouch = 0; this.vy = -9.2; this.vx = clamp(dx / 32, -5.5, 5.5); this.onGround = false; this._cd = 70; sfx('bossRoar'); } }
        else { this.crouch = 0; this.walk(this.speed); } break;
      case 'rola_bosta': this.physics(); this.walk(this.speed);
        if (this.timer % 150 === 60 && Math.abs(dx) < 380 && Math.abs(dy) < 80) { this.facing = Math.sign(dx) || -1; sfx('bonk'); projectiles.push(new Projectile(this.x + this.w / 2 + this.facing * 18, this.y + this.h - 10, this.facing * 3.2, 0, 'bosta', { life: 200 })); } break;
      case 'teju': this.physics(); // rabada: o rabo acerta quem chega perto
        if (this.st === 'tail') { this.vx = 0; if (this.timer - this.stT === 14) { sfx('whip'); projectiles.push(new Projectile(this.x + this.w / 2 + this.facing * 36, this.y + this.h / 2, 0, 0, 'slash', { life: 9, w: 46, h: 26 })); } if (this.timer - this.stT > 44) this.st = null; }
        else if (Math.abs(dx) < 80 && Math.abs(dy) < 40 && this.onGround && this.timer % 3 === 0) { this.st = 'tail'; this.stT = this.timer; this.facing = Math.sign(dx) || this.facing; }
        else this.chase(dx, dy, this.speed, 180); break;
      case 'ararinha_azul': this.x = this.baseX + Math.sin(this.t * 0.025) * this.range; this.y = this.baseY + Math.sin(this.t * 0.07) * 16; this.facing = Math.cos(this.t * 0.025) >= 0 ? 1 : -1;
        if (Math.abs(dx) < 50 && dy > 20 && this.timer % 60 === 0) projectiles.push(new Projectile(this.x + this.w / 2, this.y + this.h, 0, 1.5, 'semente', { gravity: 0.2 })); break;
      case 'rasga_mortalha': // coruja: grita e mergulha
        if (this.state === 'dive') { this.x += this.vx; this.y += this.vy; this.vy -= 0.15; if (this.y <= this.baseY) { this.y = this.baseY; this.state = 'patrol'; } }
        else { this.x = this.baseX + Math.sin(this.t * 0.015) * 50; this.y = this.baseY + Math.sin(this.t * 0.05) * 6; this.facing = Math.sign(dx) || 1;
          if (Math.abs(dx) < 200 && dy > 20 && dy < 280 && this.timer % 120 === 0) { this.state = 'dive'; this.vy = 6.5; this.vx = Math.sign(dx) * 2.6; sfx('whistle'); } } break;
      case 'alamoa': // assombração de Noronha: some e aparece (só a luz do candeeiro, a sanfona e o chocalho pegam quando ela some)
        this.ghost = (this.t % 240) > 140; this.facing = Math.sign(dx) || 1;
        if (Math.abs(dx) < 420) { this.x += Math.sign(dx) * this.speed * (this.ghost ? 1.3 : 0.7); this.y += clamp(dy, -1, 1) * 0.5; }
        this.y = Math.min(this.y, this.baseY + 60); this.y = Math.max(this.y, this.baseY - 40); break;
      case 'cumacanga': // cabeça de fogo que voa (lenda do Maranhão)
        this.x = this.baseX + Math.sin(this.t * 0.02) * this.range; this.y = this.baseY + Math.cos(this.t * 0.05) * 22; this.facing = Math.sign(dx) || 1;
        if (this.timer % 130 === 0 && Math.abs(dx) < 400) { const a = Math.atan2(dy, dx); sfx('fire'); projectiles.push(new Projectile(this.x + this.w / 2, this.y + this.h / 2, Math.cos(a) * 3.3, Math.sin(a) * 3.3, 'fire', { life: 120 })); } break;
      case 'muricoca': { // muriçoca: zune em volta do Tonho
        const near = Math.abs(dx) < 300 && Math.abs(dy) < 220; const tx = near ? dx + Math.sin(this.t * 0.11) * 40 : (this.baseX - this.x); const ty = near ? dy - 20 + Math.cos(this.t * 0.13) * 30 : (this.baseY - this.y);
        this.x += clamp(tx * 0.02, -this.speed, this.speed) + Math.sin(this.t * 0.7) * 0.6; this.y += clamp(ty * 0.02, -this.speed, this.speed) + Math.cos(this.t * 0.9) * 0.6; this.facing = Math.sign(dx) || 1; break; }
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
  updateLegend(dx, dy) {
    const T = this.type, near = Math.abs(dx) < 460 && Math.abs(dy) < 220;
    const LEGEND_CRIES = {
      caipora: 'OXE! QUEM ASSOBIOU NA MATA?!',
      cabra_cabriola: 'CORRE MENINO, É A CABRA-CABRIOLA!',
      perna_cabeluda: 'VIXE! LÁ VEM A PERNA CABELUDA!',
      cabeca_de_cuia: 'CUIDADO NA BEIRA DO RIO!',
      quibungo: 'ABRIU O BURACO NAS COSTAS!',
      labatut: 'VALEI-ME! É O MONSTRO LABATUT!'
    };
    if (this.st === 'intro') { this.physics(); if (near) { this.st = 'fight'; this.timer = 0; legendIntro = { name: this.name, sub: this.sub, timer: 170 }; sfx('bossRoar'); addScreenShake(5); if (LEGEND_CRIES[T]) spawnFloatingText(LEGEND_CRIES[T], this.x + this.w / 2, this.y - 32, '#FFE066'); } return; }
    const dir = Math.sign(dx) || this.facing;
    const shoot = (vx, vy, type, o) => projectiles.push(new Projectile(this.x + this.w / 2, this.y + this.h * 0.35, vx, vy, type, o || {}));
    const wave = () => { const gy = this.y + this.h; projectiles.push(new Projectile(this.x - 10, gy, -4.6, 0, 'shockwave', { groundY: gy, life: 150 })); projectiles.push(new Projectile(this.x + this.w + 10, gy, 4.6, 0, 'shockwave', { groundY: gy, life: 150 })); sfx('quake'); addScreenShake(6); spawnDust(this.x + this.w / 2, gy, 12); };
    const angry = this.hp <= this.maxHp / 2;
    if (T === 'caipora') {
      this.physics();
      if (this.st === 'vanish') { this.alpha = Math.max(0, this.alpha - 0.06); if (this.alpha <= 0) {
          const tx = player.x - player.facing * 170; const probe = { x: tx, y: player.y + player.h + 2, w: this.w, h: 8 };
          if (getPlatforms().some((pl) => !pl.oneWay && checkAABB(probe, pl))) { this.x = tx; this.y = player.y + player.h - this.h - 2; }
          spawnLeaves(this.x + this.w / 2, this.y + this.h / 2, 12); this.st = 'appear'; this.vy = 0; } }
      else if (this.st === 'appear') { this.alpha = Math.min(1, this.alpha + 0.08); if (this.alpha >= 1) { this.st = 'fight'; this.timer = 0; } }
      else {
        this.chase(dx, dy, this.speed * (angry ? 1.25 : 1), 600);
        if (this.timer % (angry ? 80 : 110) === 40) { sfx('leaf'); for (let i = -1; i <= 1; i++) shoot(dir * 3.4, -5 + i * 1.3, 'spine', { gravity: 0.2 }); }
        if (this.timer > 190) { this.st = 'vanish'; sfx('whistle'); }
      }
    } else if (T === 'cabra_cabriola') {
      this.physics();
      if (this.st === 'breath') { this.vx = 0; if (this.timer % 5 === 0 && this.timer < 46) { sfx('fire'); shoot(this.facing * (4 + Math.random()), -0.6 + Math.random() * 1.2, 'fire', { life: 55 }); } if (this.timer > 70) { this.st = 'fight'; this.timer = 0; } }
      else if (this.st === 'leap') { this.x += this.vx; if (this.onGround && this.timer > 8) { wave(); this.st = 'fight'; this.timer = 0; this.stagger = 30; } }
      else {
        this.chase(dx, dy, this.speed, 600);
        if (this.timer > (angry ? 90 : 130) && this.onGround) {
          this.facing = dir; this.timer = 0;
          if (Math.abs(dx) < 260) { this.st = 'breath'; } else { this.st = 'leap'; this.vy = -11; this.vx = clamp(dx / 45, -5, 5); this.onGround = false; sfx('jump'); }
        }
      }
    } else if (T === 'perna_cabeluda') {
      this.physics();
      if (!this.onGround) { this.x += this.vx; for (const pl of getPlatforms()) if (!pl.oneWay && checkAABB(this, pl) && pl.y < this.y + this.h - 12) { this.x -= this.vx; this.vx = -this.vx * 0.5; } }
      if (this.onGround && this.wasAir) { if (this.bigHop) wave(); else { spawnDust(this.x + this.w / 2, this.y + this.h, 6); addScreenShake(2); } this.bigHop = false; this.vx = 0; }
      this.wasAir = !this.onGround;
      if (this.onGround && this.timer > (angry ? 34 : 50)) {
        this.timer = 0; this.facing = dir; this.hops = (this.hops || 0) + 1;
        const big = this.hops % 3 === 0;
        const ahead = this.groundAhead(dir) || big;
        this.vy = big ? -13 : -8.5; this.vx = ahead ? clamp(dx / (big ? 52 : 40), -4.5, 4.5) : 0; this.bigHop = big; this.onGround = false; sfx('jump');
      }
    } else if (T === 'cabeca_de_cuia') {
      if (this.st === 'hidden') {
        this.physics(); this.alpha = 0.45; this.chase(dx, dy, this.speed, 700);
        if (this.timer > (angry ? 60 : 90) && Math.abs(dx) < 140) { this.st = 'pop'; this.timer = 0; this.vy = -11.5; this.vx = this.groundAhead(dir) ? dir * 2.6 : 0; this.onGround = false; this.alpha = 1; sfx('splash'); spawnBurst(this.x + this.w / 2, this.y + this.h, '#74C0FC', 14); }
      } else if (this.st === 'pop') {
        this.physics(); this.x += this.vx;
        if (this.timer === 18) { for (let i = -1; i <= 1; i++) shoot(dir * 3.2 + i * 0.8, -2.5, 'water', { gravity: 0.12 }); }
        if (this.onGround && this.timer > 10) { this.st = 'exposed'; this.timer = 0; this.vx = 0; }
      } else if (this.st === 'exposed') {
        this.physics(); this.facing = dir;
        if (this.timer % 40 === 20) shoot(dir * 3.8, -3, 'water', { gravity: 0.12 });
        if (this.timer > (angry ? 80 : 110)) { this.st = 'hidden'; this.timer = 0; sfx('splash'); }
      } else { this.st = 'hidden'; this.timer = 0; }
    } else if (T === 'quibungo') {
      // anda atrás do Tonho; dá um bote para frente e depois fica de costas: a boca das costas abre (cospe ossos)
      this.physics();
      if (this.st === 'lunge') { this.vx = this.facing * (angry ? 7 : 6); const bx = this.x; this.walk(Math.abs(this.vx)); if (this.timer % 4 === 0) spawnDust(this.x + this.w / 2, this.y + this.h, 2);
        if (this.timer > 40 || Math.abs(this.x - bx) < 0.5) { this.st = 'back'; this.timer = 0; this.vx = 0; addScreenShake(3); } }
      else if (this.st === 'back') { this.vx = 0; if (this.timer % 26 === 13) { sfx('spine'); for (let i = -1; i <= 1; i++) shoot(-this.facing * (2.8 + i * 0.7), -6 - Math.abs(i), 'bone', { gravity: 0.25 }); } if (this.timer > (angry ? 70 : 95)) { this.st = 'fight'; this.timer = 0; } }
      else { this.chase(dx, dy, this.speed * (angry ? 1.3 : 1), 700); if (this.timer > (angry ? 80 : 120) && this.onGround && this.groundAhead(dir)) { this.st = 'lunge'; this.timer = 0; this.facing = dir; sfx('bossRoar'); } }
    } else if (T === 'labatut') {
      this.physics();
      if (this.st === 'slash') { this.vx = 0; if (this.timer === 22) { sfx('whip'); addScreenShake(3); projectiles.push(new Projectile(this.x + this.w / 2 + this.facing * 58, this.y + this.h * 0.45, 0, 0, 'slash', { life: 12, w: 80, h: 70, damage: 1 })); } if (this.timer > 50) { this.st = 'fight'; this.timer = 0; } }
      else if (this.st === 'charge') { this.vx = this.facing * (angry ? 6.6 : 5.6); const bx = this.x; this.walk(Math.abs(this.vx)); if (this.timer % 4 === 0) spawnDust(this.x + this.w / 2, this.y + this.h, 2);
        if (this.timer > 60 || Math.sign(this.vx) !== this.facing || Math.abs(this.x - bx) < 1) { this.st = 'fight'; this.timer = 0; this.stagger = 40; addScreenShake(4); } }
      else {
        this.chase(dx, dy, this.speed * (angry ? 1.3 : 1), 700);
        if (Math.abs(dx) < 110 && Math.abs(dy) < 80 && this.timer > 30) { this.st = 'slash'; this.timer = 0; this.facing = dir; }
        else if (this.timer > (angry ? 130 : 180) && this.groundAhead(dir)) { this.st = 'charge'; this.timer = 0; this.facing = dir; sfx('bossRoar'); }
        if (this.timer % 150 === 75) { sfx('quake'); for (let i = 0; i < 3; i++) projectiles.push(new Projectile(player.x + (i - 1) * 120, -20, 0, 2, 'bone', { gravity: 0.22 })); }
      }
    }
  }
  canBeStomped() { if (this.type === 'alamoa' && this.ghost) return false; if (this.legend) return !(this.type === 'cabeca_de_cuia' && this.st === 'hidden') && this.st !== 'intro' && this.alpha > 0.5;
    return !(this.type === 'cacto_atirador' || (this.type === 'baiacu' && this.puffed) || (this.type === 'tatu' && this.rolling)); }
  takeHit(dmg = 1, dir = 1) { return this.hit(dmg, this.x - dir * 10); }
  drawHpPips(ctx, x, y) {
    if (this.dead || this.legend || this.hp >= this.maxHp) return;
    const n = this.maxHp, pw = 7, gap = 2, tw = n * pw + (n - 1) * gap, sx = x + this.w / 2 - tw / 2, sy = y - 24;
    for (let i = 0; i < n; i++) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(sx + i * (pw + gap) - 1, sy - 1, pw + 2, 6); ctx.fillStyle = i < this.hp ? '#FF6B6B' : '#495057'; ctx.fillRect(sx + i * (pw + gap), sy, pw, 4); }
    // v3.0: depois do 1º golpe, mostra (pequeno) a arma que é a fraqueza do bicho
    const wi = weakIcon(this.type); if (wi) { ctx.save(); ctx.font = '12px sans-serif'; ctx.textAlign = 'left'; ctx.globalAlpha = 0.9; ctx.fillText(wi, sx + tw + 3, sy + 5); ctx.restore(); }
  }
  hit(dmg = 1, fromX, weapon) {
    if (this.dead || this.hitCd > 0 || this.respawnTimer > 0) return false;
    if (this.type === 'alamoa' && this.ghost && !(weapon === 'candeeiro' || weapon === 'sanfona' || weapon === 'chocalho' || weapon === 'espelho' || weapon === 'triangulo' || weapon === 'uniao')) { spawnSparks(this.x + this.w / 2, this.y + this.h / 2, 3, '#E7F5FF'); this.hitCd = 8; return false; }
    // v3.0: fraqueza = dano dobrado
    const weak = isWeak(this.type, weapon);
    if (weapon === 'fita' && !this.legend) this.lassoed = 110;
    if (weapon === 'tapioca' && !this.legend) { this.lassoed = 240; this.bubbleTimer = 180; spawnFloatingText('BOLHA DE CHICLETE! 🫧', this.x + this.w / 2, this.y - 18, '#FF85C0'); }
    if (weak) { dmg = dmg * 2; this.weakShown = 60; spawnFloatingText('FRAQUEZA! ×2', this.x + this.w / 2, this.y - 26, '#FF8787'); }
    if (this.vulnerable > 0 && weapon !== 'chocalho') { dmg += 1; this.vulnerable = 0; spawnFloatingText('ASSUSTADO! +1', this.x + this.w / 2, this.y - 16, '#FFE066'); }
    if (weapon === 'laco' && !this.legend) { this.lassoed = 180; }
    if (this.type === 'tatu' && this.rolling && dmg < 2 && !weak && weapon !== 'porrete') { spawnSparks(this.x + this.w / 2, this.y, 4, '#ADB5BD'); sfx('clank'); this.hitCd = 10; return false; }
    if (this.legend && (this.st === 'intro' || (this.type === 'cabeca_de_cuia' && this.st === 'hidden') || this.alpha < 0.5)) { spawnSparks(this.x + this.w / 2, this.y + 8, 5, '#ADB5BD'); sfx('clank'); this.hitCd = 10; return false; }
    if (currentLevel && currentLevel.specialMode === 'brawlstars' && player) {
      player.brawlSuper = Math.min(100, (player.brawlSuper || 0) + 20);
    }
    this.hp -= dmg; this.hitFlashTimer = 10; this.hitCd = (this.legend || this.isBrawlBoss) ? 20 : 14; sfx('hit'); hitstopFrames = Math.max(hitstopFrames, 3);
    const kdir = fromX !== undefined ? (Math.sign(this.x + this.w / 2 - fromX) || 1) : -this.facing;
    this.kbx = (weapon === 'laco' ? -kdir * 5.5 : kdir * ((this.legend || this.isBrawlBoss) ? 2.5 : (weapon === 'porrete' ? 6.5 : 4)));
    this.stagger = (this.legend || this.isBrawlBoss) ? 10 : (this.lassoed > 0 ? 180 : (weapon === 'zabumba' ? 45 : 18));
    if (this.lassoed > 0) { if (weapon !== 'laco') this.kbx *= 0.3; this.lassoed = 0; this.tied = 180; }
    if (!this.fly && this.onGround && !this.legend && !(currentLevel && currentLevel.specialMode === 'brawlstars')) this.vy = weapon === 'zabumba' ? -6.5 : (weapon === 'porrete' ? -4.8 : -3.5);
    spawnSparks(this.x + this.w / 2, this.y + this.h / 2, 6, '#FFF');
    if (this.hp > 0) addScore(10);
    if (this.hp <= 0) {
      this.dead = true; this.deathTimer = (this.legend || this.isBrawlBoss) ? 70 : 40; this.deathVy = -6.5; addScore(this.scoreValue);
      if (typeof addUnionProgress === 'function') addUnionProgress(3.2);
      spawnSparks(this.x + this.w / 2, this.y + this.h / 2, (this.legend || this.isBrawlBoss) ? 30 : 14, this.color);
      spawnFloatingText('+' + this.scoreValue, this.x + this.w / 2, this.y, (this.legend || this.isBrawlBoss) ? '#FFE066' : '#FFD43B');
      if (this.isBrawlBoss && currentLevel) {
        currentLevel.brawlBossesKilled = (currentLevel.brawlBossesKilled || 0) + 1;
        if (player) {
          player.powerCubes = (player.powerCubes || 0) + 2;
          player.brawlPower = player.powerCubes;
        }
        sfx('bossdefeat'); addScreenShake(8);
        const k = currentLevel.brawlBossesKilled, tot = currentLevel.brawlBossesTotal || 2;
        spawnFloatingText(k >= tot ? 'PORTÃO DE SAÍDA ABERTO! ⭐' : `BRAWLER DERROTADO (${k}/${tot})! +2 ⚡`, this.x + this.w / 2, this.y - 28, '#51CF66');
      } else if (this.legend) {
        sfx('bossdefeat'); addScreenShake(8); spawnFloatingText('LENDA VENCIDA!', this.x + this.w / 2, this.y - 26, '#FFF');
      }
    }
    return true;
  }
  draw(ctx, camX, camY) {
    if ((this.dead && !(this.deathTimer > 0)) || this.respawnTimer > 0) return;
    const ix = lerp(this.prevX, this.x, renderAlpha) - camX, iy = lerp(this.prevY, this.y, renderAlpha) - camY;
    if (ix + this.w < -120 || ix > VIEW_W + 120) return;
    const sm = typeof window !== 'undefined' && window._oxeSpecialMode;
    // Em Pac-Oxe, OxeCraft e Brawl Stars, drawEnemyHD desenha fantasmas azuis, mobs em blocos 3D e chefes Brawl Stars!
    if ((sm === 'pacman' || sm === 'minecraft' || sm === 'brawlstars') && typeof window !== 'undefined' && window.OxeHD && window.OxeHD.drawEnemyHD) {
      window.OxeHD.drawEnemyHD(ctx, camX, camY, this, renderAlpha, frameCount);
      if (this.bubbleTimer > 0) {
        ctx.save(); ctx.fillStyle = 'rgba(255,133,192,0.45)'; ctx.strokeStyle = '#FF85C0'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(ix + this.w / 2, iy + this.h / 2, Math.max(this.w, this.h) * 0.72, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
      }
      return;
    }
    if (this.legend) { drawLegend(ctx, this, ix, iy); this.drawHpPips(ctx, ix, iy); return; }
    const A3 = typeof window !== 'undefined' && window.OxeArt3;
    if (A3 && A3.hasEnemy(this.type)) { A3.drawEnemy(ctx, camX, camY, this, renderAlpha, frameCount); this.drawHpPips(ctx, ix, iy); return; }
    if (typeof window !== 'undefined' && window.OxeHD && window.OxeHD.drawEnemyHD) {
      const st = (!this.fly && !this.dead) ? clamp(-this.vy * 0.025, -0.14, 0.16) : 0;
      if (st) { const fx = ix + this.w / 2, fy = iy + this.h; ctx.save(); ctx.translate(fx, fy); ctx.scale(1 - st * 0.6, 1 + st); ctx.translate(-fx, -fy); }
      window.OxeHD.drawEnemyHD(ctx, camX, camY, this, renderAlpha, frameCount);
      if (st) ctx.restore();
      if (this.bubbleTimer > 0) {
        ctx.save(); ctx.fillStyle = 'rgba(255,133,192,0.45)'; ctx.strokeStyle = '#FF85C0'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(ix + this.w / 2, iy + this.h / 2, Math.max(this.w, this.h) * 0.72, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
      }
      this.drawHpPips(ctx, ix, iy);
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

// ==================== DESENHO DAS LENDAS (v2.4) ====================
function drawLegend(ctx, e, x, y) {
  const w = e.w, h = e.h, t = e.t || 0, cx = x + w / 2, by = y + h, flash = e.hitFlashTimer > 0 && Math.floor(e.hitFlashTimer / 2) % 2 === 0;
  const O = '#1A1A1A';
  // sombra
  if (!e.dead) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(cx, by + 1, w * 0.6, 6, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.save();
  ctx.translate(cx, by); ctx.scale(1.60, 1.60); // escala aumentada das Lendas do Nordeste
  if (e.dead) { ctx.globalAlpha = clamp(e.deathTimer / 40, 0, 1); ctx.rotate((70 - e.deathTimer) * 0.08 * (e.kbx >= 0 ? 1 : -1)); }
  ctx.globalAlpha *= clamp(e.alpha == null ? 1 : e.alpha, 0, 1);
  ctx.scale(e.facing >= 0 ? 1 : -1, 1);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = O; ctx.lineWidth = 2.5;
  const F = (c) => flash ? '#FFFFFF' : c;
  const blob = (bx, bY, rx, ry, col, rot = 0) => { ctx.beginPath(); ctx.ellipse(bx, bY, rx, ry, rot, 0, Math.PI * 2); ctx.fillStyle = F(col); ctx.fill(); ctx.stroke(); };
  const eye = (ex, ey, r, iris = '#1A1A1A', glow) => { ctx.save(); if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 10; } ctx.fillStyle = '#FFF'; ctx.beginPath(); ctx.arc(ex, ey, r, 0, Math.PI * 2); ctx.fill(); ctx.restore(); ctx.lineWidth = 1.5; ctx.stroke(); ctx.lineWidth = 2.5; ctx.fillStyle = iris; ctx.beginPath(); ctx.arc(ex + r * 0.3, ey, r * 0.5, 0, Math.PI * 2); ctx.fill(); };
  const run = Math.abs(e.vx) > 0.3 && e.onGround ? Math.sin(t * 0.35) : 0;
  if (e.type === 'quibungo' && window.OxeArt3) { window.OxeArt3.drawQuibungo(ctx, e, t, F, blob, eye); ctx.restore(); return; }
  switch (e.type) {
    case 'caipora': {
      // pés virados para trás (marca da lenda)
      [[-6, run], [6, -run]].forEach(([lx, ph]) => { ctx.save(); ctx.translate(lx, -14); ctx.rotate(ph * 0.4); ctx.fillStyle = F('#5A8F3A'); ctx.fillRect(-3, 0, 6, 12); ctx.strokeRect(-3, 0, 6, 12); blob(-5, 12, 7, 3.5, '#4A7A30'); ctx.restore(); });
      ctx.fillStyle = F('#7A4A1E'); ctx.beginPath(); ctx.moveTo(-12, -14); ctx.lineTo(12, -14); ctx.lineTo(9, -30); ctx.lineTo(-9, -30); ctx.closePath(); ctx.fill(); ctx.stroke();
      for (let i = -10; i <= 10; i += 5) { ctx.fillStyle = F(i % 2 ? '#2F9E44' : '#51CF66'); ctx.beginPath(); ctx.ellipse(i, -13, 3, 7, 0, 0, Math.PI * 2); ctx.fill(); }
      blob(0, -36, 9, 9, '#6BAA4A');
      ctx.save(); ctx.translate(0, -40); for (let i = 0; i < 7; i++) { const a = -Math.PI + i * (Math.PI / 6); const l = 10 + Math.sin(t * 0.3 + i) * 3; ctx.fillStyle = F(i % 2 ? '#FF6B1A' : '#FFD43B'); ctx.beginPath(); ctx.moveTo(Math.cos(a) * 6, Math.sin(a) * 6); ctx.lineTo(Math.cos(a) * (6 + l), Math.sin(a) * (6 + l) - 3); ctx.lineTo(Math.cos(a + 0.4) * 6, Math.sin(a + 0.4) * 6); ctx.fill(); } ctx.restore();
      eye(4, -37, 3, '#C92A2A');
      ctx.strokeStyle = '#5C3D2E'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(12, -8); ctx.lineTo(16, -46); ctx.stroke(); ctx.fillStyle = F('#FFD43B'); ctx.beginPath(); ctx.arc(16, -48, 3.5, 0, Math.PI * 2); ctx.fill();
      break; }
    case 'cabra_cabriola': {
      const bob = run * 2;
      [[-18, run], [-8, -run], [10, run], [20, -run]].forEach(([lx, ph]) => { ctx.fillStyle = F('#3B2414'); ctx.fillRect(lx - 3, -16 + ph * 2, 6, 16 - ph * 2); ctx.strokeRect(lx - 3, -16 + ph * 2, 6, 16 - ph * 2); ctx.fillStyle = '#111'; ctx.fillRect(lx - 3, -3, 6, 3); });
      blob(-2, -24 + bob, 24, 12, '#4A3020');
      ctx.fillStyle = F('#2B1A10'); for (let i = -20; i < 16; i += 6) { ctx.beginPath(); ctx.moveTo(i, -34 + bob); ctx.lineTo(i + 3, -42 + bob - (i % 4)); ctx.lineTo(i + 6, -34 + bob); ctx.fill(); }
      blob(22, -34 + bob, 11, 9, '#5C3D2E', -0.3);
      ctx.strokeStyle = F('#D9C9A3'); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(18, -42 + bob); ctx.quadraticCurveTo(8, -58 + bob, 2, -46 + bob); ctx.stroke(); ctx.beginPath(); ctx.moveTo(24, -42 + bob); ctx.quadraticCurveTo(20, -60 + bob, 10, -52 + bob); ctx.stroke();
      ctx.strokeStyle = O; ctx.lineWidth = 2.5;
      ctx.fillStyle = '#FF3B30'; ctx.save(); ctx.shadowColor = '#FF3B30'; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(25, -37 + bob, 2.6, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.fillStyle = F('#D9C9A3'); ctx.beginPath(); ctx.moveTo(26, -27 + bob); ctx.lineTo(29, -18 + bob); ctx.lineTo(23, -26 + bob); ctx.fill();
      if (e.st === 'breath') { ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (let i = 0; i < 5; i++) { ctx.fillStyle = i % 2 ? 'rgba(255,140,40,0.7)' : 'rgba(255,220,80,0.7)'; ctx.beginPath(); ctx.arc(36 + i * 7 + Math.sin(t + i) * 2, -30 + bob + Math.cos(t * 0.7 + i) * 3, 6 - i * 0.6, 0, Math.PI * 2); ctx.fill(); } ctx.restore(); }
      break; }
    case 'perna_cabeluda': {
      const sq = e.onGround ? 0 : -4;
      ctx.fillStyle = F('#1C4E80'); ctx.beginPath(); ctx.moveTo(-17, -h); ctx.lineTo(17, -h); ctx.lineTo(19, -h + 22); ctx.lineTo(-19, -h + 22); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = F('#E7F5FF'); for (let i = -14; i < 16; i += 8) ctx.fillRect(i, -h + 18, 4, 3);
      ctx.fillStyle = F('#C68B59'); ctx.beginPath(); ctx.moveTo(-15, -h + 22); ctx.quadraticCurveTo(-18, -h * 0.5, -10, -22 + sq); ctx.lineTo(10, -22 + sq); ctx.quadraticCurveTo(16, -h * 0.5, 15, -h + 22); ctx.closePath(); ctx.fill(); ctx.stroke();
      blob(0, -h * 0.48, 10, 8, '#B87A4A');
      ctx.strokeStyle = '#3B2414'; ctx.lineWidth = 1.6; for (let i = 0; i < 16; i++) { const hy = -h + 30 + (i * 37 % (h - 54)), hx = -12 + (i * 53 % 24); ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo(hx + 3, hy - 3, hx + 1 + Math.sin(t * 0.2 + i), hy - 7); ctx.stroke(); }
      ctx.strokeStyle = O; ctx.lineWidth = 2.5;
      blob(8, -10, 20, 10, '#D9A066'); for (let i = 0; i < 5; i++) blob(24 + (i < 2 ? 0 : 1), -14 + i * 4, 4 - i * 0.4, 3, '#E0A872');
      break; }
    case 'cabeca_de_cuia': {
      const hidden = e.st === 'hidden';
      if (hidden) { ctx.save(); ctx.beginPath(); ctx.rect(-60, -200, 120, 200 - 30); ctx.clip(); }
      if (!hidden) { ctx.fillStyle = F('#8D5A3B'); ctx.fillRect(-8, -18, 7, 18); ctx.fillRect(3, -18, 7, 18); ctx.strokeRect(-8, -18, 7, 18); ctx.strokeRect(3, -18, 7, 18); blob(0, -22, 13, 9, '#A0522D'); }
      const hy = hidden ? -20 : -36;
      ctx.fillStyle = F('#111'); ctx.beginPath(); ctx.moveTo(-26, hy - 4); ctx.quadraticCurveTo(-34, hy + 22, -24, hy + 30); ctx.lineTo(-10, hy + 8); ctx.closePath(); ctx.fill();
      blob(0, hy - 6, 26, 22, '#E0A872');
      ctx.fillStyle = F('#111'); ctx.beginPath(); ctx.ellipse(-6, hy - 20, 22, 10, -0.2, Math.PI, Math.PI * 2.05); ctx.fill();
      eye(8, hy - 8, 5, '#1A1A1A'); eye(-6, hy - 8, 4.5, '#1A1A1A');
      ctx.beginPath(); ctx.arc(2, hy + 4, 7, 0.1, Math.PI - 0.1); ctx.stroke();
      if (hidden) { ctx.restore(); ctx.strokeStyle = 'rgba(160,220,255,0.8)'; ctx.lineWidth = 2; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(0, -30, 20 + i * 9 + (t % 20), 4 + i * 1.5, 0, 0, Math.PI * 2); ctx.stroke(); } }
      break; }
    case 'labatut': {
      const sw = run;
      [[-12, sw], [12, -sw]].forEach(([lx, ph]) => { ctx.fillStyle = F('#3B2A20'); ctx.fillRect(lx - 7, -30, 14, 30 - Math.abs(ph) * 2); ctx.strokeRect(lx - 7, -30, 14, 30); blob(lx + 4, -2, 11, 4, '#2B1A10'); });
      ctx.fillStyle = F('#5C4033'); ctx.beginPath(); ctx.moveTo(-26, -30); ctx.lineTo(26, -30); ctx.lineTo(22, -76); ctx.lineTo(-20, -78); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = F('#3B2A20'); for (let i = -22; i < 24; i += 9) ctx.fillRect(i, -34, 5, 6);
      const armA = e.st === 'slash' ? -1.6 + Math.min(e.timer, 22) * 0.12 : Math.sin(t * 0.08) * 0.2;
      ctx.save(); ctx.translate(18, -70); ctx.rotate(armA); ctx.fillStyle = F('#8D6E63'); ctx.fillRect(-5, 0, 10, 34); ctx.strokeRect(-5, 0, 10, 34);
      ctx.strokeStyle = F('#F1F3F5'); ctx.lineWidth = 3; for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(k * 3, 34); ctx.lineTo(k * 5 + 4, 48); ctx.stroke(); } ctx.restore();
      ctx.strokeStyle = O; ctx.lineWidth = 2.5;
      blob(2, -84, 17, 15, '#8D6E63');
      ctx.fillStyle = F('#212529'); ctx.beginPath(); ctx.moveTo(-16, -90); ctx.quadraticCurveTo(-8, -106, 12, -100); ctx.quadraticCurveTo(22, -96, 18, -86); ctx.lineTo(-18, -70); ctx.closePath(); ctx.fill();
      eye(8, -86, 7.5, '#C92A2A', angryGlow(e));
      ctx.fillStyle = '#FFF'; ctx.beginPath(); ctx.moveTo(4, -74); ctx.lineTo(7, -69); ctx.lineTo(10, -74); ctx.fill(); ctx.beginPath(); ctx.moveTo(12, -74); ctx.lineTo(15, -69); ctx.lineTo(17, -74); ctx.fill();
      break; }
  }
  ctx.restore();
}
function angryGlow(e) { return e.hp <= e.maxHp / 2 ? '#FF3B30' : null; }

// ==================== CHEFÕES ====================
const ARENA = { left: 40, right: 1360, width: 1400 };
class BossBase {
  constructor(x, y, opts) {
    this.x = x; this.y = y; this.prevX = x; this.prevY = y; this.w = opts.w; this.h = opts.h; this.maxHp = Math.max(3, Math.round(opts.hp * (1 - oxeEase(currentLevel ? currentLevel.diffIdx : 0)))); this.hp = this.maxHp; this.name = opts.name; this.hint = opts.hint || '';
    this.vx = 0; this.vy = 0; this.facing = -1; this.state = 'idle'; this.timer = 90; this.onGround = false; this.dead = false; this.invuln = 0; this.hitFlashTimer = 0; this.t = 0;
    this.gravityOn = true; this.deathTimer = 0; this.isBoss = true; this.attackCount = 0;
  }
  // v2.4: os chefes dos mundos 4, 5 e 6 gravavam 'phase' e o jogo travava (propriedade só de leitura)
  get phase() { if (this._phase != null) return this._phase; const r = this.hp / this.maxHp; return r > 0.67 ? 1 : (r > 0.34 ? 2 : 3); }
  set phase(v) { this._phase = v; }
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
    // v3.4: bater fora da hora não é perdido — 4 golpes "de raspão" valem 1 de vida do chefe
    if (!this.isVulnerable()) {
      if (this.invuln > 0 || this.dead) return false;
      this.chip = (this.chip || 0) + dmg; spawnSparks(this.x + this.w / 2, this.y + 10, 5, '#FFE066'); sfx('clank'); this.hitFlashTimer = 4;
      if (!this._chipTip) { this._chipTip = true; spawnFloatingText('Bata quando ele ficar tonto!', this.x + this.w / 2, this.y - 26, '#FFE066'); }
      if (this.chip < 4) return false;
      this.chip = 0; const r0 = this.hp / this.maxHp; this.hp -= 1; this.invuln = 30; this.hitFlashTimer = 10; sfx('bosshit'); score += 250; spawnFloatingText('-1', this.x + this.w / 2, this.y - 10, '#FFD43B');
      this.healOnPhase(r0);
      if (this.hp <= 0) { this.hp = 0; this.dead = true; this.deathTimer = 120; sfx('bossdefeat'); addScreenShake(20); }
      return true;
    }
    const r0 = this.hp / this.maxHp;
    this.hp -= dmg; this.invuln = 22; this.stunHits = (this.stunHits || 0) + 1; this.hitFlashTimer = 10; hitstopFrames = 8; addScreenShake(12); triggerHaptic(70); sfx('bosshit');
    spawnSparks(this.x + this.w / 2, this.y + this.h / 3, 18, '#FFD43B'); score += 500; spawnFloatingText('+500', this.x + this.w / 2, this.y - 10, '#FFD43B');
    this.healOnPhase(r0);
    if (this.hp <= 0) { this.hp = 0; this.dead = true; this.deathTimer = 120; sfx('bossdefeat'); addScreenShake(20); }
    else if (this.stunHits < 3) { this.timer = Math.max(this.timer, 45); } // continua tonto: dá para emendar até 3 golpes
    else { this.state = 'recover'; this.timer = 50; this.vx = 0; this.vy = -5; }
    return true;
  }
  // v3.4: a cada terço de vida que o chefe perde, o jogador recupera 1 coração
  healOnPhase(r0) {
    const r1 = Math.max(0, this.hp) / this.maxHp, crossed = (r0 > 0.67 && r1 <= 0.67) || (r0 > 0.34 && r1 <= 0.34);
    if (crossed && this.hp > 0 && typeof health !== 'undefined' && health < maxHealth) { health = Math.min(maxHealth, health + 1); sfx('checkpoint'); if (player) spawnFloatingText('+1 CORAÇÃO', player.x + player.w / 2, player.y - 20, '#FF8787'); }
  }
  update() {
    this.prevX = this.x; this.prevY = this.y; this.t++;
    if (this.invuln > 0) this.invuln--; if (this.hitFlashTimer > 0) this.hitFlashTimer--;
    if (this.dead) { if (this.deathTimer > 0) { this.deathTimer--; if (this.deathTimer % 8 === 0) spawnSparks(this.x + Math.random() * this.w, this.y + Math.random() * this.h, 8, '#FFD43B'); } return; }
    if (bossIntroTimer > 0) { this.physicsY(); return; }
    this.timer--;
    if (this.state !== 'stunned') this.stunHits = 0;
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

// ----- v3.0 · Mundo 7: Corpo-Seco (sai da terra rachada) -----
class BossCorpoSeco extends BossBase {
  constructor(x, y) { super(x, y, { w: 70, h: 112, hp: 7, name: 'O Corpo-Seco', hint: 'Quando ele afundar, corra! Depois faça ele bater na parede.' }); this.alpha = 1; this.guideText = 'Fuja quando ele afundar na terra e faça ele investir contra a parede!'; }
  ai() {
    const dx = this.playerDX(); const ph = this.phase;
    switch (this.state) {
      case 'idle': this.vx *= 0.8; this.facing = Math.sign(dx) || this.facing; this.alpha = Math.min(1, this.alpha + 0.08);
        if (this.timer <= 0) { this.attackCount++; const k = this.attackCount % 3;
          if (k === 1) { this.state = 'windup'; this.timer = ph === 1 ? 46 : 32; sfx('bossRoar'); }
          else if (k === 2) { this.state = 'burrow'; this.timer = 70; sfx('quake'); spawnDust(this.x + this.w / 2, this.y + this.h, 16, '#8D7B68'); }
          else { this.state = 'branches'; this.timer = 16; this.shots = 2 + ph; } } break;
      case 'windup': this.facing = Math.sign(dx) || this.facing; if (this.timer % 6 === 0) spawnDust(this.x + this.w / 2 - this.facing * 30, this.y + this.h, 2, '#8D7B68');
        if (this.timer <= 0) { this.state = 'charge'; this.vx = this.facing * (ph === 1 ? 6 : 7.8); sfx('charge'); } break;
      case 'charge': if (this.t % 3 === 0) spawnDust(this.x + this.w / 2, this.y + this.h, 2, '#8D7B68'); if (this.moveX()) this.wallStun(160); break;
      case 'burrow': // afunda e anda por baixo da terra até o Tonho
        this.alpha = Math.max(0.12, this.alpha - 0.06); this.vx = clamp(dx * 0.05, -4.2, 4.2); this.moveX(); if (this.t % 5 === 0) spawnDust(this.x + this.w / 2, this.y + this.h, 2, '#6F5B48');
        if (this.timer <= 0) { this.state = 'emerge'; this.timer = 26; this.vx = 0; sfx('quake'); addScreenShake(8); const gy = this.y + this.h;
          for (let i = -2; i <= 2; i++) projectiles.push(new Projectile(this.x + this.w / 2 + i * 26, gy - 10, i * 0.9, -8.5 - (2 - Math.abs(i)) * 1.2, 'spine', { gravity: 0.3, w: 10, h: 10 }));
          if (ph >= 2) { projectiles.push(new Projectile(this.x - 10, gy, -4.5, 0, 'shockwave', { groundY: gy })); projectiles.push(new Projectile(this.x + this.w + 10, gy, 4.5, 0, 'shockwave', { groundY: gy })); } } break;
      case 'emerge': this.alpha = Math.min(1, this.alpha + 0.1); if (this.timer <= 0) { this.state = 'idle'; this.timer = 50; } break;
      case 'branches': this.vx = 0; if (this.timer <= 0) { sfx('spine'); const a = Math.atan2(-1.2, dx); projectiles.push(new Projectile(this.x + this.w / 2, this.y + 30, Math.sign(dx) * (3 + Math.random() * 2), -6 - Math.random() * 2, 'bone', { gravity: 0.25 })); this.shots--; this.timer = 22; if (this.shots <= 0) { this.state = 'idle'; this.timer = 60; } } break;
    }
  }
  draw(ctx, camX, camY) { ctx.save(); ctx.globalAlpha = this.alpha == null ? 1 : this.alpha; super.draw(ctx, camX, camY); ctx.restore(); }
}
// ----- v3.0 · Mundo ★: Boi Encantado (Bumba-meu-boi do Maranhão) -----
class BossBoiEncantado extends BossBase {
  constructor(x, y) { super(x, y, { w: 104, h: 84, hp: 6, name: 'O Boi Encantado', hint: 'Fuja das fitas e faça o Boi bater na parede!' }); this.guideText = 'Fuja das fitas coloridas e faça o Boi trombar na parede!'; this.spin = 0; }
  ai() {
    const dx = this.playerDX(); const ph = this.phase;
    switch (this.state) {
      case 'idle': this.vx *= 0.8; this.facing = Math.sign(dx) || this.facing;
        if (this.timer <= 0) { this.attackCount++; const k = this.attackCount % 3;
          if (k === 1) { this.state = 'dance'; this.timer = 70; this.shots = 0; sfx('whistle'); }
          else if (k === 2 && ph >= 2) { this.state = 'leap'; this.vy = -12.5; this.leapTarget = clamp((player ? player.x : this.x) - this.w / 2, ARENA.left + 10, ARENA.right - this.w - 10); this.timer = 0; sfx('jump'); }
          else { this.state = 'windup'; this.timer = ph === 1 ? 48 : 34; sfx('bossRoar'); } } break;
      case 'dance': this.vx = 0; this.spin += 0.3; if (this.timer % 18 === 0) { sfx('leaf'); const n = 6 + ph * 2; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + this.timer * 0.05; projectiles.push(new Projectile(this.x + this.w / 2, this.y + this.h * 0.4, Math.cos(a) * 3, Math.sin(a) * 3 - 0.5, 'fita', { life: 110 })); } }
        if (this.timer <= 0) { this.state = 'idle'; this.timer = 55; } break;
      case 'windup': this.facing = Math.sign(dx) || this.facing; if (this.timer % 5 === 0) spawnDust(this.x + this.w / 2 - this.facing * 34, this.y + this.h, 2); if (this.timer <= 0) { this.state = 'charge'; this.vx = this.facing * (ph === 1 ? 6.4 : 8); sfx('charge'); } break;
      case 'charge': if (this.t % 3 === 0) spawnDust(this.x + this.w / 2, this.y + this.h, 2); if (this.moveX()) this.wallStun(170); break;
      case 'leap': this.x += (this.leapTarget - this.x) * 0.07;
        if (this.onGround && this.vy === 0 && this.timer < -8) { sfx('quake'); addScreenShake(10); const gy = this.y + this.h; projectiles.push(new Projectile(this.x - 10, gy, -5, 0, 'shockwave', { groundY: gy })); projectiles.push(new Projectile(this.x + this.w + 10, gy, 5, 0, 'shockwave', { groundY: gy })); this.state = 'idle'; this.timer = 50; } break;
    }
  }
}

function createBoss(bossType, x, y) { const b = createBossRaw(bossType, x, y); if (b) b.kind = b.kindName || BOSS_KIND[bossType] || 'BossBull'; return b; }
const BOSS_KIND = { bull: 'BossBull', fulozinha: 'BossFulozinha', papa_figo: 'BossPapaFigo', serpente: 'BossSerpente', guardiao: 'BossGuardiaoBrasa', sombra: 'BossSombraSeca', corpo_seco: 'BossCorpoSeco', boi_encantado: 'BossBoiEncantado' };
function createBossRaw(bossType, x, y) {
  switch (bossType) {
    case 'bull': case 'BossBull': return new BossBull(x, y);
    case 'fulozinha': case 'BossFulozinha': return new BossFulozinha(x, y);
    case 'papa_figo': case 'papafigo': case 'papaFigo': case 'BossPapaFigo': return new BossPapaFigo(x, y);
    case 'serpente': case 'BossSerpente': return new BossSerpente(x, y);
    case 'guardiao': case 'guardiao_brasa': case 'guardiaoBrasa': case 'brasa': case 'BossGuardiaoBrasa': return new BossGuardiaoBrasa(x, y);
    case 'sombra': case 'sombra_seca': case 'sombraSeca': case 'BossSombraSeca': return new BossSombraSeca(x, y);
    case 'corpo_seco': case 'BossCorpoSeco': return new BossCorpoSeco(x, y);
    case 'boi_encantado': case 'BossBoiEncantado': return new BossBoiEncantado(x, y);
    default: return null;
  }
}

function drawBossGuide(ctx, boss, camX, camY) {
  if (!boss || boss.dead || boss.hp <= 0) return;
  // v2.5.1: a dica agora fica num texto fixo embaixo da barra do chefe (antes era desenhada por cima do HUD e parecia tremer)
  const t = boss.t || 0;
  const hint = document.getElementById('bossHint');
  if (hint) { const txt = boss.state === 'stunned' ? 'AGORA! Bata no chefe!' : (boss.guideText || boss.hint || 'Desvie dos ataques e bata quando ele ficar tonto!'); if (hint._t !== txt) { hint._t = txt; hint.textContent = txt; hint.classList.toggle('now', boss.state === 'stunned'); } }
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
    fxParts.forEach((p) => { ctx.globalAlpha = Math.min(1, p.life / 30); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x - camX, p.y - camY, p.s * 0.6, 0, 6.283); ctx.fill(); });
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
        if (typeof addUnionProgress === 'function') addUnionProgress(1.8);
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
        if (typeof addUnionProgress === 'function') addUnionProgress(15);
        if (currentLevel && currentLevel.specialMode === 'pacman') {
          window._pacPowerTimer = 480;
          currentLevel.enemies.forEach((e) => { if (!e.dead) e.scaredTimer = 480; });
          floatText(this.x + 14, this.y - 16, 'FANTASMAS AZUIS! COMA ELES!', '#4DABF7');
        }
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
        if (typeof addUnionProgress === 'function') addUnionProgress(20);
        player.starTimer = 600; player.asaBrancaTimer = 600; // v2.2: o poder da estrela agora funciona de verdade
        if (currentLevel && currentLevel.specialMode === 'pacman') {
          window._pacPowerTimer = 600;
          currentLevel.enemies.forEach((e) => { if (!e.dead) e.scaredTimer = 600; });
        }
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

  // ===================== ITENS: 7 HERÓIS, MONTARIAS E UNIÃO DA DUPLA (v4.0) =====================
  const ITEM_INFO = {
    baleadeira: { label: 'BALEADEIRA! Atira pedras que ricocheteiam', ammo: 15 },
    pandeiro: { label: 'PANDEIRO! Vai e volta', ammo: 10 },
    rojao: { label: 'ROJÃO! Explode tudo perto', ammo: 6 },
    sanfona: { label: 'SANFONA! Onda de forró', ammo: 4 },
    porrete: { label: 'PEDAÇO DE PAU! Pancada forte', ammo: 12 },
    laco: { label: 'LAÇO! Amarra e puxa', ammo: 8 },
    zabumba: { label: 'ZABUMBA! Onda pelo chão', ammo: 5 },
    candeeiro: { label: 'CANDEEIRO! Fogo e luz', ammo: 6 },
    chocalho: { label: 'CHOCALHO! Assusta todo mundo', ammo: 5 },
    triangulo: { label: 'TRIÂNGULO! Nota que atravessa', ammo: 10 },
    peixeira: { label: 'PEIXEIRA DE LAMPIÃO! Corte veloz + adaga', ammo: 14 },
    bacamarte: { label: 'BACAMARTE! Estouro de 5 chumbos', ammo: 7 },
    berimbau: { label: 'BERIMBAU! Onda sonora teleguiada', ammo: 10 },
    rede: { label: 'REDE DE DORMIR! Prende inimigos e rebate', ammo: 7 },
    jegue: { label: 'JEGUE! Montaria (3❤️): use suas armas ou escolha Coice/Disparada!' },
    bode_toddy_mount: { label: 'BODE TODDY MONTARIA! Pula duplo, imune a espinhos e chifra tudo!' },
    reliquia_uniao: { label: 'RELÍQUIA DA UNIÃO! Especial Supremo da Dupla (18s)!' },
    especial_milho: { label: 'METRALHADORA DE MILHO! 20 segundos' },
    especial_pamonha: { label: 'CANHÃO DE PAMONHA! 20 segundos' },
    especial_tapioca: { label: 'TAPIOCA GRUDENTA! Prende os bichos' },
    fantasia_cacto: { label: 'FANTASIA DE MANDACARU! Atira espinhos e espeta quem encosta' },
    fantasia_boi: { label: 'FANTASIA DE BOI-BUMBÁ! Investida que derruba tudo' },
    fantasia_sol: { label: 'FANTASIA DE SOL DO SERTÃO! Aura de fogo' },
    // Zefinha
    presilha: { label: 'PRESILHA! (Zefinha) atravessa 2 bichos', ammo: 20 },
    chapeu: { label: 'CHAPÉU DE PALHA! (Zefinha) vai e volta', ammo: 8 },
    fita: { label: 'FITA DE CHITA! (Zefinha) amarra o bicho', ammo: 15 },
    sombrinha: { label: 'SOMBRINHA DE FREVO! (Zefinha) escudo e planar', ammo: 6 },
    espelho: { label: 'ESPELHINHO! (Zefinha) luz contra assombração', ammo: 6 },
    boneca_pano: { label: 'BONECA DE PANO! (Zefinha) atrai e explode', ammo: 7 },
    corda: { label: 'CORDA DE PULAR! (Zefinha) giro duplo', ammo: 10 },
    bilro: { label: 'RENDA DE BILRO! (Zefinha) leque de 3 fusos', ammo: 12 },
    cajuina: { label: 'CAJUÍNA DOURADA! (Zefinha) cura +1❤️ e explode', ammo: 5 },
    // Menino Cabeça de Vento
    pipa: { label: 'PIPA VOADORA! (Cabeça de Vento) solta bombinhas do céu', ammo: 10 },
    chiclete: { label: 'CHICLETE BOLA! (Cabeça de Vento) prende na bolha rosa', ammo: 12 },
    piao: { label: 'PIÃO DE MADEIRA! (Cabeça de Vento) gira no chão', ammo: 10 },
    bolinha_gude: { label: 'BOLINHAS DE GUDE! (Cabeça de Vento) 5 bolinhas quicantes', ammo: 12 },
    bombinha: { label: 'BOMBINHA SÃO JOÃO! (Cabeça de Vento) explosão em cadeia', ammo: 8 },
    aviao_papel: { label: 'AVIÃO DE PAPEL! (Cabeça de Vento) 3 aviões teleguiados', ammo: 12 },
    ioio: { label: 'IOIÔ TURBO! (Cabeça de Vento) golpeia ida e volta', ammo: 14 },
    // Galinha Melindrosa
    ciscar: { label: 'CISCAR FURIOSO! (Galinha) furacão 360° ao redor', ammo: 10 },
    ovo_ouro: { label: 'OVO DE OURO! (Galinha) explode em ouro', ammo: 8 },
    cacarejo: { label: 'CACAREJO SÔNICO! (Galinha) grito que atordoa tudo', ammo: 8 },
    bicada_furadeira: { label: 'BICADA FURADEIRA! (Galinha) avanço aéreo', ammo: 10 },
    ninho_pintinhos: { label: 'NINHO DE PINTINHOS! (Galinha) 3 pintinhos atacam', ammo: 7 },
    redemoinho_penas: { label: 'TORNADO DE PENAS! (Galinha) furacão que levanta bichos', ammo: 6 },
    // Bode Toddy
    berro_bode: { label: 'BERRO DO BODE! (Bode Toddy) onda que empurra longe', ammo: 9 },
    cabecada_sismica: { label: 'CABEÇADA SÍSMICA! (Bode Toddy) racha o chão', ammo: 8 },
    coice_bode: { label: 'COICE DUPLO! (Bode Toddy) patada para os dois lados', ammo: 12 },
    lata_toddy: { label: 'LATA DE TODDY TURBO! (Bode Toddy) rola e explode', ammo: 9 },
    salto_cabrito: { label: 'SALTO CABRITO! (Bode Toddy) super pulo meteoro', ammo: 9 },
    furia_toddy: { label: 'FÚRIA CHIFRUDA! (Bode Toddy) velocidade e chifrada total', ammo: 5 },
    // Mestre Seu Lunga
    resposta_braba: { label: 'RESPOSTA BRABA! (Seu Lunga) letras gigantes', ammo: 12 },
    bengala_couro: { label: 'BENGALA DE COURO! (Seu Lunga) golpe crítico', ammo: 12 },
    cachimbo_fumaca: { label: 'FUMAÇA DE CACHIMBO! (Seu Lunga) nuvem que cega inimigos', ammo: 8 },
    espora_prata: { label: 'ESPORA DE PRATA! (Seu Lunga) giro cortante', ammo: 10 },
    forro_trovao: { label: 'FORRÓ TROVÃO! (Seu Lunga) raios musicais do céu', ammo: 6 },
    // Tatu-Bola Cascudo
    placa_casco: { label: 'PLACA DE CASCO! (Tatu-Bola) bumerangue blindado', ammo: 12 },
    cavada_sertaneja: { label: 'CAVADA SERTANEJA! (Tatu-Bola) mergulho subterrâneo', ammo: 9 },
    terremoto_tatu: { label: 'TERREMOTO TATU! (Tatu-Bola) pancada sísmica', ammo: 8 },
    espinho_mandacaru: { label: 'ESPINHO MANDACARU! (Tatu-Bola) 8 espinhos em 360°', ammo: 9 },
    tatu_foguete: { label: 'TATU FOGUETE! (Tatu-Bola) rola em chama máxima', ammo: 7 },
    gibao: { label: 'GIBÃO DE COURO! Aguenta 1 golpe' },
    cuscuz: { label: 'CUSCUZ! +1 coração' }
  };

  function addUnionProgress(amt) {
    unionGauge = Math.min(100, (unionGauge || 0) + amt);
    window._unionGaugePct = unionGauge;
    if (unionGauge >= 75 && !unionReady) {
      unionReady = true;
      sfx('powerup');
      if (player) floatText(player.x + player.w / 2, player.y - 36, '☯️ UNIÃO DA DUPLA DESBLOQUEADA!', '#FFD43B');
      toast('☯️ Barra de União pronta! Pegue a Relíquia da União ou aperte U para ativar o Especial da Dupla!');
    }
  }

  function triggerUnionSpecial() {
    if (!player) return;
    if (!companion && currentLevel && currentLevel.partner) {
      const pKind = (currentLevel.partner.kind && HERO_META[currentLevel.partner.kind]) ? currentLevel.partner.kind : 'zefinha';
      companion = makeHero(pKind, player.x - 36, player.y);
      duoJoined = true;
    }
    unionTimer = 18 * 60;
    unionGauge = 100;
    window._unionGaugePct = 100;
    unionReady = true;
    health = maxHealth;
    sfx('victory');
    addScreenShake(8);
    spawnBurst(player.x + player.w / 2, player.y + player.h / 2, '#FFD43B', 32);
    spawnBurst(player.x + player.w / 2, player.y + player.h / 2, '#74C0FC', 26);
    floatText(player.x + player.w / 2, player.y - 44, '☯️ ESPECIAL SUPREMO DA DUPLA!', '#FFD43B');
    if (currentLevel) {
      currentLevel.enemies.forEach((e) => {
        if (!e.dead && Math.hypot(e.x - player.x, e.y - player.y) < 340) e.hit(4, player.x, 'sanfona');
      });
    }
    updateWeaponUI();
    updateHUD();
  }
  window.oxeTriggerUnion = triggerUnionSpecial;

  function giveItem(type) {
    const info = ITEM_INFO[type] || { ammo: 10 };
    addUnionProgress(6);
    const routeHeroWeapon = (order, inv, heroKey, heroName, color) => {
      if (order.indexOf(type) > 0) {
        const am = info.ammo || 10;
        inv[type] = Math.min((inv[type] | 0) + am, am * 2);
        if (player && player.hero === heroKey) setSel(player, type);
        else if (player) floatText(player.x, player.y - 30, `Guardado para ${heroName}!`, color);
        return true;
      }
      return false;
    };
    if (routeHeroWeapon(ZEF_ORDER, zefInv, 'zefinha', 'Zefinha', '#FFC9DE')) {}
    else if (routeHeroWeapon(CAB_ORDER, cabInv, 'cabeca_vento', 'Cabeça de Vento', '#74C0FC')) {}
    else if (routeHeroWeapon(GAL_ORDER, galInv, 'galinha', 'Galinha Melindrosa', '#FFE066')) {}
    else if (routeHeroWeapon(BOD_ORDER, bodInv, 'bode_toddy', 'Bode Toddy', '#D0BFFF')) {}
    else if (routeHeroWeapon(LUN_ORDER, lunInv, 'seu_lunga', 'Seu Lunga', '#FFD8A8')) {}
    else if (routeHeroWeapon(TAT_ORDER, tatInv, 'tatu_bola', 'Tatu-Bola', '#E9FAC8')) {}
    else if (WEAPON_ORDER.indexOf(type) > 0) {
      const am = info.ammo || 10;
      inventory[type] = Math.min((inventory[type] | 0) + am, am * 2);
      if (player && player.hero === 'tonho') selectedWeapon = type;
      else if (player) floatText(player.x, player.y - 30, 'Guardado para o Tonho!', '#FFE066');
    } else if (type === 'gibao') heldArmor = 1;
    else if (type === 'jegue') { if (player) player.setMount('jegue'); }
    else if (type === 'bode_toddy_mount') { if (player) player.setMount('bode_toddy'); }
    else if (type === 'reliquia_uniao') { triggerUnionSpecial(); }
    else if (/^especial_/.test(type)) { if (player) { player.special = { type: type.slice(9), t: SPECIAL_FRAMES }; sfx('checkpoint'); addScreenShake(4); bichosBrabos(); } }
    else if (/^fantasia_/.test(type)) { if (player) { player.costume = { type: type.slice(9), t: COSTUME_FRAMES }; sfx('checkpoint'); addScreenShake(3); spawnSparks(player.x + player.w / 2, player.y + player.h / 2, 24, '#FFE066'); bichosBrabos(3); } }
    else if (type === 'cuscuz') health = Math.min(maxHealth, health + 1);
    updateWeaponUI(); updateHUD();
  }

  // Montar/descer do Bode Toddy quando ele é parceiro na fase!
  function toggleMountPartner() {
    if (!player || player.dead) return;
    if (player.mount && player._mountedCompanion) {
      companion = player._mountedCompanion;
      companion.x = player.x - (player.facing || 1) * 38;
      companion.y = player.y + player.h - companion.h;
      companion.vx = 0; companion.vy = -3;
      player._mountedCompanion = null;
      player.setMount(false);
      floatText(player.x, player.y - 24, '🐐 BODE TODDY SOLTO AO SEU LADO!', '#D0BFFF');
      updateWeaponUI();
      return;
    }
    if (companion && companion.hero === 'bode_toddy' && !player.mount) {
      player._mountedCompanion = companion;
      companion = null;
      player.setMount('bode_toddy');
      floatText(player.x, player.y - 24, '🐐 MONTOU NO BODE TODDY! (Use suas armas ou as do Bode)', '#FFE066');
      updateWeaponUI();
    }
  }
  window.oxeToggleMountPartner = toggleMountPartner;

  // Barra de armas: inclui TODAS as armas do herói atual + os slots da montaria quando montado!
  function ownedOf(h) {
    const inv = invOf(h), d = defOf(h);
    const base = orderOf(h).filter((k) => k === d || (inv[k] | 0) > 0);
    if (h && h.mount) {
      const mSlots = h.mount.type === 'bode_toddy' ? MOUNT_TODDY_SLOTS : MOUNT_JEGUE_SLOTS;
      return base.concat(mSlots);
    }
    return base;
  }
  function selectWeapon(type) {
    const h = player; if (!h) return;
    const owned = ownedOf(h);
    if (owned.includes(type)) {
      setSel(h, type); sfx('select'); updateWeaponUI();
      if (WEAPON_INFO[type] && WEAPON_INFO[type].style) {
        spawnFloatingText(`${WEAPON_INFO[type].ico} ${WEAPON_INFO[type].style}`, h.x + h.w / 2, h.y - 18, '#FFE8A3');
      }
    }
  }
  function cycleWeapon(dir) {
    const owned = ownedOf(player);
    const i = owned.indexOf(selOf(player)); selectWeapon(owned[(i + dir + owned.length) % owned.length]);
  }
  window.oxeSelectWeapon = selectWeapon;
  function updateWeaponUI() {
    if (!player) return;
    const owned = ownedOf(player);
    const curSel = selOf(player);
    if (!owned.includes(curSel)) setSel(player, defOf(player));
    const sel = selOf(player), def = defOf(player), inv = invOf(player);
    const info = WEAPON_INFO[sel] || WEAPON_INFO.chicote;
    const bar = $('weaponBar'), btn = $('btnWhip');
    const compMeta = companion ? (HERO_META[companion.hero] || HERO_META.zefinha) : null;
    const swapChip = companion ? `<button type="button" class="wslot hero" data-swap="1" title="Trocar para ${compMeta.label} (C)" aria-label="Trocar de personagem"><span class="wi">${compMeta.ico}</span><span class="wa">⇄</span></button>` : '';
    const mountPartnerChip = (companion && companion.hero === 'bode_toddy' && !player.mount)
      ? `<button type="button" class="wslot hero" data-mount="1" title="Montar no Bode Toddy (M)"><span class="wi">🐐</span><span class="wa">MONTAR</span></button>`
      : (player.mount && player._mountedCompanion)
      ? `<button type="button" class="wslot hero" data-mount="1" title="Descer do Bode Toddy (M)"><span class="wi">🐐</span><span class="wa">DESCER</span></button>`
      : '';
    const mountHpChip = player.mount
      ? `<span class="wslot armor" title="${player.mount.type === 'bode_toddy' ? 'Bode Toddy' : 'Jegue'} (${player.mount.hp}/${player.mount.maxHp} corações)">${player.mount.type === 'bode_toddy' ? '🐐' : '🫏'}<span class="wa">❤️${player.mount.hp}</span></span>`
      : '';
    if (bar) {
      const html = swapChip + mountPartnerChip + mountHpChip + owned.map((k) => {
        const wi = WEAPON_INFO[k] || { ico: '⚡', name: k, style: '' };
        const isInf = (k === def) || wi.isMountSlot;
        return `<button type="button" class="wslot${k === sel ? ' on' : ''}" data-w="${k}" title="${wi.name}: ${wi.style || ''}" aria-label="${wi.name}"><span class="wi">${wi.ico}</span>${isInf ? '<span class="wa">∞</span>' : `<span class="wa">${inv[k] | 0}</span>`}</button>`;
      }).join('') + (heldArmor ? '<span class="wslot armor" title="Gibão de couro: aguenta 1 golpe">🦺</span>' : '');
      if (bar._h !== html) { bar._h = html; bar.innerHTML = html; }
    }
    const pc = player && player.costume, ps = player && player.special;
    const costumeChip = (ps ? `<span class="wslot armor" title="Especial">${SPECIAL_INFO[ps.type].ico}<span class="wa">${Math.ceil(ps.t / 60)}s</span></span>` : '') +
      (pc ? `<span class="wslot armor" title="Fantasia">${COSTUME_INFO[pc.type].ico}<span class="wa">${Math.ceil(pc.t / 60)}s</span></span>` : '') +
      (unionTimer > 0 ? `<span class="wslot armor" title="Especial Supremo da Dupla">☯️<span class="wa">${Math.ceil(unionTimer / 60)}s</span></span>` : '');
    if (bar) { const html2 = costumeChip + (bar._h || ''); if (bar._h2 !== html2) { bar._h2 = html2; bar.innerHTML = html2; } }
    if (btn && (ps || pc)) { const h = `${ps ? SPECIAL_INFO[ps.type].ico : COSTUME_INFO[pc.type].ico}<span class="lbl">PODER</span>`; if (btn._h !== h) { btn._h = h; btn.innerHTML = h; } }
    else if (btn) {
      const isInf = (sel === def) || (info && info.isMountSlot);
      const h = `${info.ico}<span class="lbl">${isInf ? info.name.split(' ')[0].toUpperCase() : '×' + (inv[sel] | 0)}</span>`;
      if (btn._h !== h) { btn._h = h; btn.innerHTML = h; }
    }
  }
  (function bindWeaponBar() {
    const bar = $('weaponBar'); if (!bar) return;
    const pick = (e) => {
      const sw = e.target.closest && e.target.closest('.wslot[data-swap]');
      if (sw) { e.preventDefault(); e.stopPropagation(); swapHero(); return; }
      const mt = e.target.closest && e.target.closest('.wslot[data-mount]');
      if (mt) { e.preventDefault(); e.stopPropagation(); toggleMountPartner(); return; }
      const b = e.target.closest && e.target.closest('.wslot[data-w]');
      if (!b) return;
      e.preventDefault(); e.stopPropagation(); selectWeapon(b.dataset.w);
    };
    bar.addEventListener('pointerdown', pick);
    window.addEventListener('keydown', (e) => {
      if (currentState !== GAME_STATE.PLAYING && currentState !== GAME_STATE.CHALLENGE) return;
      if (e.code === 'KeyQ') cycleWeapon(-1); else if (e.code === 'KeyE') cycleWeapon(1);
      else if (/^Digit[0-9]$/.test(e.code)) { const n = +e.code.slice(5); const owned = ownedOf(player); const k = owned[(n === 0 ? 10 : n) - 1]; if (k) selectWeapon(k); }
      else if (e.code === 'KeyC' || e.code === 'Tab') { e.preventDefault(); if (typeof swapHero === 'function') swapHero(); }
      else if (e.code === 'KeyM') { e.preventDefault(); toggleMountPartner(); }
      else if (e.code === 'KeyU' && unionReady && unionTimer <= 0) { e.preventDefault(); triggerUnionSpecial(); }
    });
  })();
  function sanfonaBlast(p) {
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2, R = 200;
    sanfonaRings.push({ x: cx, y: cy, r: 12, life: 34 });
    sfx('checkpoint'); addScreenShake(4); triggerHaptic(30);
    const L = currentLevel; if (!L) return;
    L.enemies.forEach((e) => { if (!e.dead && Math.hypot(e.x + e.w / 2 - cx, e.y + e.h / 2 - cy) < R) e.hit(2, cx, 'sanfona'); });
    if (L.boss && !L.boss.dead && Math.hypot(L.boss.x + L.boss.w / 2 - cx, L.boss.y + L.boss.h / 2 - cy) < R + 40) L.boss.takeHit(1);
    for (const pr of projectiles) if (pr.hostile && pr.type !== 'shockwave' && Math.hypot(pr.x - cx, pr.y - cy) < R) { pr.dead = true; spawnSparks(pr.x, pr.y, 3, '#FFE066'); }
  }
  function explodeRojao(pr) {
    const cx = pr.x + pr.w / 2, cy = pr.y + pr.h / 2, R = 120, L = currentLevel;
    sfx('quake'); addScreenShake(6); spawnSparks(cx, cy, 32, '#FFD43B'); spawnSparks(cx, cy, 20, '#FF6B6B'); spawnBurst(cx, cy, '#74C0FC', 14);
    sanfonaRings.push({ x: cx, y: cy, r: 10, life: 20, boom: true });
    // Solta 3 bombinhas de São João ("estalos") que quicam e explodem
    if (!pr.isMini) {
      [-3.2, 0, 3.2].forEach((vx, idx) => {
        const mini = new Projectile(cx, cy - 4, vx + (Math.random() - 0.5), -4.5 - idx * 0.6, 'estalo', { hostile: false, gravity: 0.24, life: 36, damage: 2, weapon: 'rojao', bounces: 1 });
        mini.isMini = true; mini.owner = pr.owner || player; projectiles.push(mini);
      });
    }
    if (!L) return;
    L.enemies.forEach((e) => { if (!e.dead && Math.hypot(e.x + e.w / 2 - cx, e.y + e.h / 2 - cy) < R) e.hit(4, cx, 'rojao'); });
    if (L.boss && !L.boss.dead && Math.hypot(L.boss.x + L.boss.w / 2 - cx, L.boss.y + L.boss.h / 2 - cy) < R + 40) L.boss.takeHit(1);
  }
  // v3.0: candeeiro explode em fogo, clareia a escuridão e deixa poça de fogo no chão!
  function fireBurst(pr) {
    const cx = pr.x + pr.w / 2, cy = pr.y + pr.h / 2, R = 95, L = currentLevel;
    sfx('fire'); addScreenShake(3); spawnSparks(cx, cy, 24, '#FFA94D'); spawnSparks(cx, cy, 14, '#FFE066');
    sanfonaRings.push({ x: cx, y: cy, r: 8, life: 18, boom: true }); lightBoost = Math.max(lightBoost, 200);
    const fz = new Projectile(cx, cy, 0, 1, 'fireZone', { hostile: false, life: 180, damage: 1, weapon: 'candeeiro', pierce: true });
    fz.hitSet = new Set(); fz.owner = pr.owner || player; projectiles.push(fz);
    if (!L) return;
    L.enemies.forEach((e) => { if (!e.dead && Math.hypot(e.x + e.w / 2 - cx, e.y + e.h / 2 - cy) < R) e.hit(2, cx, 'candeeiro'); });
    if (L.boss && !L.boss.dead && Math.hypot(L.boss.x + L.boss.w / 2 - cx, L.boss.y + L.boss.h / 2 - cy) < R + 40) L.boss.takeHit(1);
  }
  function pamonhaBoom(pr) {
    const cx = pr.x + pr.w / 2, cy = pr.y + pr.h / 2, R = 115, L = currentLevel;
    sfx('quake'); addScreenShake(7); spawnSparks(cx, cy, 30, '#C9E265'); spawnSparks(cx, cy, 18, '#FFE066');
    sanfonaRings.push({ x: cx, y: cy, r: 10, life: 18, boom: true });
    if (!L) return;
    L.enemies.forEach((e) => { if (!e.dead && Math.hypot(e.x + e.w / 2 - cx, e.y + e.h / 2 - cy) < R) e.hit(4, cx, 'especial'); });
    if (L.boss && !L.boss.dead && Math.hypot(L.boss.x + L.boss.w / 2 - cx, L.boss.y + L.boss.h / 2 - cy) < R + 40) L.boss.takeHit(1);
  }
  // proporcional: pegou um especial, chega uma leva de bichos mais brabos pela frente
  function bichosBrabos(nFix) {
    const L = currentLevel; if (!L || !player || L.boss) return;
    const pool = [...new Set(L.enemies.filter((e) => !e.legend && !e.fly && e.type !== 'bode_doido' && e.type !== 'cacto_atirador').map((e) => e.type))];
    const flyers = [...new Set(L.enemies.filter((e) => e.fly && !e.legend).map((e) => e.type))];
    const n = (nFix || (4 + Math.floor((L.diffIdx || 0) / 2))) + (companion ? 1 : 0); let made = 0;
    for (let i = 0; i < n * 3 && made < n; i++) {
      const x = player.x + 480 + i * 110 + Math.random() * 60;
      const pl = getPlatforms().filter((p) => !p.oneWay && !p.falling && !p.thornField && x > p.x + 20 && x < p.x + p.w - 40).sort((a, b) => a.y - b.y)[0];
      if (!pl) continue;
      const fly = flyers.length && (made % 3 === 2);
      const t = fly ? flyers[made % flyers.length] : (pool[made % Math.max(1, pool.length)] || 'calango');
      const e = new Enemy(x, fly ? pl.y - 170 : pl.y - 40, t, { worldIdx: Math.min(7, (L.diffIdx || 0) + 1), elite: true, patrol: { minX: pl.x, maxX: pl.x + pl.w } });
      e.baseX = e.x; e.baseY = e.y; L.enemies.push(e); made++;
      spawnSparks(e.x + e.w / 2, e.y + e.h / 2, 8, '#FF6B6B');
    }
    if (made) spawnFloatingText('OS BICHOS FICARAM BRABOS!', player.x + player.w / 2, player.y - 34, '#FF8787');
  }
  // v3.1: espelhinho da Zefinha: raio de luz longo para frente (forte contra assombração) e clareia a escuridão
  function espelhoBeam(h) {
    const L = currentLevel, cx = h.x + h.w / 2, cy = h.y + 16, len = 300, dir = h.facing || 1;
    sanfonaRings.push({ beam: true, x: cx, y: cy, dir, len, life: 18 }); sfx('coin'); lightBoost = Math.max(lightBoost, 220);
    if (!L) return;
    L.enemies.forEach((e) => { if (e.dead) return; const ex = e.x + e.w / 2 - cx, ey = e.y + e.h / 2 - cy; if (ex * dir > -10 && ex * dir < len && Math.abs(ey) < 52) { const d = (e.type === 'alamoa' || e.type === 'cangaceiro_sombra' || e.type === 'papa_figo') ? 2 : 1; e.hit(d, cx, 'espelho'); if (!e.dead && !e.legend) e.stagger = Math.max(e.stagger, 85); } });
    if (L.boss && !L.boss.dead) { const ex = L.boss.x + L.boss.w / 2 - cx; if (ex * dir > 0 && ex * dir < len + 40 && Math.abs(L.boss.y + L.boss.h / 2 - cy) < 80) L.boss.takeHit(1); }
  }
  // v3.0: chocalho assusta todos os bichos por perto (ficam parados e vulneráveis a +1 de dano no próximo golpe!)
  function chocalhoBlast(p) {
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2, R = 250, L = currentLevel;
    sanfonaRings.push({ x: cx, y: cy, r: 12, life: 32, bell: true }); sfx('whistle'); triggerHaptic(25);
    if (!L) return;
    L.enemies.forEach((e) => { if (!e.dead && Math.hypot(e.x + e.w / 2 - cx, e.y + e.h / 2 - cy) < R) { e.hit(1, cx, 'chocalho'); if (!e.dead) { e.stagger = e.legend ? 50 : 165; e.vulnerable = 240; e.kbx = 0; } } });
    for (const pr of projectiles) if (pr.hostile && pr.type !== 'shockwave' && Math.hypot(pr.x - cx, pr.y - cy) < R * 0.8) pr.dead = true;
  }
  class PowerItem {
    constructor(x, y, type) { this.x = x; this.y = y; this.w = 30; this.h = 30; this.type = type; this.t = Math.random() * 6; this.collected = false; }
    update() {
      if (this.collected) return; this.t += 0.06;
      if (player && !player.dead && checkAABB(this, playerBox())) {
        if ((this.type === 'jegue' || this.type === 'bode_toddy_mount') && player.mount && player.mount.type === (this.type === 'bode_toddy_mount' ? 'bode_toddy' : 'jegue') && player.mount.hp >= player.mount.maxHp) {
          if (!this._warn || frameCount - this._warn > 150) { this._warn = frameCount; floatText(this.x + 15, this.y - 6, 'Já está montado!', '#FFF3BF'); }
          return;
        }
        if (this.type === 'reliquia_uniao' && !unionReady && (unionGauge || 0) < 75) {
          if (!this._warn || frameCount - this._warn > 110) {
            this._warn = frameCount;
            floatText(this.x + 15, this.y - 12, `☯️ União em ${Math.floor(unionGauge || 0)}%/75%! Pegue mais itens da fase!`, '#FFD43B');
          }
          return;
        }
        this.collected = true; giveItem(this.type); sfx('powerup'); addScore(250);
        spawnBurst(this.x + 15, this.y + 15, '#FFE066', 18); floatText(this.x + 15, this.y - 6, (ITEM_INFO[this.type] || {}).label || 'ITEM!', '#FFF3BF');
      }
    }
    draw(ctx, cx, cy) {
      if (this.collected) return;
      const x = this.x - cx + 15, y = this.y - cy + 15 + Math.sin(this.t * 2) * 4;
      ctx.save();
      if (this.type === 'reliquia_uniao') {
        const ready = unionReady || (unionGauge || 0) >= 75;
        const g = ctx.createRadialGradient(x, y, 2, x, y, ready ? 36 : 22);
        g.addColorStop(0, ready ? 'rgba(255,212,59,0.95)' : 'rgba(180,180,200,0.45)');
        g.addColorStop(0.5, ready ? 'rgba(116,192,252,0.65)' : 'rgba(120,120,140,0.2)');
        g.addColorStop(1, 'rgba(255,200,80,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, ready ? 36 : 22, 0, 7); ctx.fill();
      } else {
        const g = ctx.createRadialGradient(x, y, 2, x, y, 26); g.addColorStop(0, 'rgba(255,240,180,0.85)'); g.addColorStop(1, 'rgba(255,200,80,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 26, 0, 7); ctx.fill();
      }
      ctx.lineWidth = 2; ctx.strokeStyle = '#1A1A1A'; ctx.lineJoin = 'round';
      if (window.OxeArt3 && window.OxeArt3.drawItem(ctx, this.type, x, y, this.t)) { ctx.restore(); return; }
      if (this.type === 'baleadeira') {
        ctx.strokeStyle = '#6B3E1E'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x, y + 13); ctx.lineTo(x, y); ctx.lineTo(x - 9, y - 11); ctx.moveTo(x, y); ctx.lineTo(x + 9, y - 11); ctx.stroke();
        ctx.strokeStyle = '#C92A2A'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 9, y - 11); ctx.quadraticCurveTo(x, y - 2 + Math.sin(this.t * 3) * 2, x + 9, y - 11); ctx.stroke();
      } else if (this.type === 'sanfona') {
        ctx.fillStyle = '#C92A2A'; ctx.fillRect(x - 13, y - 9, 8, 18); ctx.strokeRect(x - 13, y - 9, 8, 18); ctx.fillStyle = '#1C4E80'; ctx.fillRect(x + 5, y - 9, 8, 18); ctx.strokeRect(x + 5, y - 9, 8, 18);
        ctx.fillStyle = '#F8F0E3'; const sq = Math.sin(this.t * 3) * 2; for (let i = 0; i < 4; i++) { ctx.fillRect(x - 5 + i * 2.5, y - 8 + sq * 0.3, 2, 16 - sq * 0.6); }
        ctx.fillStyle = '#FFF'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x + 9, y - 5 + i * 5, 1.4, 0, 7); ctx.fill(); }
      } else if (this.type === 'pandeiro') {
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(this.t) * 0.3); ctx.beginPath(); ctx.arc(0, 0, 12, 0, 7); ctx.fillStyle = '#C68B59'; ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 9, 0, 7); ctx.fillStyle = '#F8E1A8'; ctx.fill();
        ctx.fillStyle = '#FFD43B'; for (let k = 0; k < 5; k++) { const a = k * 1.2566; ctx.beginPath(); ctx.arc(Math.cos(a) * 11, Math.sin(a) * 11, 2.6, 0, 7); ctx.fill(); ctx.stroke(); } ctx.restore();
      } else if (this.type === 'rojao') {
        ctx.save(); ctx.translate(x, y); ctx.rotate(-0.6); ctx.fillStyle = '#E03131'; ctx.fillRect(-5, -10, 10, 20); ctx.strokeRect(-5, -10, 10, 20); ctx.fillStyle = '#FFD43B'; ctx.beginPath(); ctx.moveTo(-6, -10); ctx.lineTo(0, -18); ctx.lineTo(6, -10); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#FFF'; ctx.fillRect(-5, -2, 10, 3); ctx.strokeStyle = '#8B5A2B'; ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(0, 16); ctx.stroke(); ctx.fillStyle = Math.floor(this.t * 4) % 2 ? '#FFA94D' : '#FFE066'; ctx.beginPath(); ctx.arc(0, 17, 2.5, 0, 7); ctx.fill(); ctx.restore();
      } else if (this.type === 'gibao') {
        ctx.fillStyle = '#A0522D'; ctx.beginPath(); ctx.moveTo(x - 12, y - 10); ctx.lineTo(x - 4, y - 13); ctx.lineTo(x, y - 6); ctx.lineTo(x + 4, y - 13); ctx.lineTo(x + 12, y - 10); ctx.lineTo(x + 10, y + 12); ctx.lineTo(x - 10, y + 12); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#FFD43B'; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(x + i * 5, y + 3, 1.6, 0, 7); ctx.fill(); }
      } else {
        ctx.fillStyle = '#F8F0E3'; ctx.beginPath(); ctx.ellipse(x, y + 9, 15, 4, 0, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#FFD43B'; ctx.beginPath(); ctx.moveTo(x - 11, y + 8); ctx.quadraticCurveTo(x - 10, y - 10, x, y - 11); ctx.quadraticCurveTo(x + 10, y - 10, x + 11, y + 8); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#FAB005'; for (let i = 0; i < 5; i++) ctx.fillRect(x - 7 + i * 3, y - 2 + (i % 2) * 4, 2, 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x + i * 5, y - 14); ctx.quadraticCurveTo(x + i * 5 + 3, y - 18 - Math.sin(this.t * 2 + i) * 2, x + i * 5, y - 22); ctx.stroke(); }
      }
      ctx.restore();
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

  // ===================== v4.0: DUPLA INTELIGENTE, 7 HERÓIS, MONTARIAS E MODOS ESPECIAIS =====================
  function swapHero() {
    if (!companion || !player || player.dead || swapCd > 0) return;
    if (currentState !== GAME_STATE.PLAYING && currentState !== GAME_STATE.CHALLENGE) return;
    const a = player; player = companion; companion = a;
    player.dazed = 0; player.invuln = Math.max(player.invuln, 30); player.swapMark = 50; player.jumpBuffer = 0; companion.whipTimer = 0; companion.gliding = false;
    heroKind = player.hero; swapCd = 18; sfx('select'); triggerHaptic(15);
    const meta = HERO_META[player.hero] || HERO_META.tonho;
    spawnSparks(player.x + player.w / 2, player.y, 10, meta.color);
    floatText(player.x + player.w / 2, player.y - 16, `${meta.ico} ${meta.label}!`, meta.color);
    updateWeaponUI();
  }
  window.oxeSwapHero = swapHero;
  function teleportCompanion() {
    if (!companion || !player) return;
    const c = companion; c.x = player.x - (player.facing || 1) * 38; c.y = player.y + player.h - c.h; c.vx = 0; c.vy = 0; c.dazed = 0; c.onVine = null;
    c.prevX = c.x; c.prevY = c.y; c._stuck = 0; c._rescuedPit = false; spawnSparks(c.x + c.w / 2, c.y + c.h / 2, 10, '#FFFFFF');
  }
  function heroGroundAhead(c, dir) {
    const probe = { x: dir > 0 ? c.x + c.w + 4 : c.x - 28, y: c.y + c.h - 4, w: 24, h: 64 };
    return getPlatforms().some((pl) => pl.state !== 'fallen' && checkAABB(probe, pl));
  }
  function heroGroundAtX(x, footY) {
    const probe = { x: x - 12, y: footY - 8, w: 24, h: 90 };
    return getPlatforms().some((pl) => pl.state !== 'fallen' && checkAABB(probe, pl));
  }
  // IA aprimorada do parceiro (v4.0): não cai em buracos, mantém impulso no pulo, desvia de espinhos/projéteis e usa o arsenal próprio!
  function companionInputs(c, lead, L) {
    const inp = { left: false, right: false, up: false, down: false, jump: false, jumpJustPressed: false, whip: false, whipJustPressed: false, glide: false };
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2, lx = lead.x + lead.w / 2, ly = lead.y + lead.h / 2;
    if (c.onGround) c._rescuedPit = false;

    // Resgate automático de emergência se estiver caindo num buraco fundo
    if (!c.onGround && c.y > L.levelH - 72) {
      teleportCompanion();
      return inp;
    }

    const rangedHero = ['zefinha', 'cabeca_vento', 'galinha', 'seu_lunga'].includes(c.hero);
    const range = rangedHero ? 225 : 125;
    let tgt = null, best = 1e9;
    for (const e of L.enemies) {
      if (e.dead || (e.type === 'alamoa' && e.ghost && !(zefInv.espelho > 0 && c.hero === 'zefinha'))) continue;
      const ex = e.x + e.w / 2 - cx, ey = e.y + e.h / 2 - cy, adx = Math.abs(ex);
      const coming = Math.sign(e.vx || 0) === -Math.sign(ex) && Math.abs(e.vx || 0) > 0.3;
      if (adx < range && Math.abs(ey) < (rangedHero ? 72 : 54) && (adx < 160 || coming || e.legend || e.isBrawlBoss)) {
        const d = adx + Math.abs(ey) * 1.8;
        if (d < best) { best = d; tgt = e; }
      }
    }
    if (L.boss && !L.boss.dead && (!L.boss.isVulnerable || L.boss.isVulnerable()) && Math.abs(L.boss.x + L.boss.w / 2 - cx) < range + 50) tgt = L.boss;

    // Define destino seguro (nunca escolhe wantX sobre um buraco!)
    let wantX = lx - (lead.facing || 1) * 46;
    if (tgt && !rangedHero && Math.abs(tgt.x - c.x) < 160) {
      const candX = tgt.x + tgt.w / 2 - Math.sign(tgt.x - c.x || 1) * 44;
      if (heroGroundAtX(candX, c.y + c.h)) wantX = candX;
    }
    if (!heroGroundAtX(wantX, lead.y + lead.h)) wantX = lx;

    const dx = wantX - cx, dir = Math.sign(dx);
    if (Math.abs(dx) > 24) { if (dir > 0) inp.right = true; else inp.left = true; }

    // Top-down / Shmup / Pacman acompanhamento vertical
    if (L.specialMode === 'pacman' || L.specialMode === 'brawlstars' || L.specialMode === 'shmup' || L.specialMode === 'beatemup') {
      const dy = (ly - 20) - cy;
      if (Math.abs(dy) > 22) { if (dy > 0) inp.down = true; else inp.up = true; }
    }

    // Se está no ar pulando buraco, mantém velocidade horizontal na direção do líder!
    if (!c.onGround && !heroGroundAtX(cx, c.y + c.h + 10)) {
      if (lx >= cx) { inp.right = true; inp.left = false; }
      else { inp.left = true; inp.right = false; }
    }

    // Combate inteligente
    if (tgt) {
      const fd = Math.sign(tgt.x + tgt.w / 2 - cx) || 1;
      if (Math.abs(dx) <= 32 || rangedHero) c.facing = fd;
      if (c.facing === fd && c.whipCooldown <= 0 && (c._atkCd || 0) <= 0) {
        c._aiWeapon = aiPickWeapon(c, tgt);
        inp.whipJustPressed = true;
        c._atkCd = rangedHero ? 34 : 26;
      }
    }
    if (c._atkCd > 0) c._atkCd--;

    // Detecção de buracos, espinhos, fogueiras e projéteis hostis
    const moving = inp.left || inp.right, mdir = inp.right ? 1 : -1;
    const hazAhead = moving && (L.hazards || []).some((h) => h.x < cx + mdir * 75 + 24 && h.x + h.w > cx + mdir * 16 - 20 && Math.abs(h.y - (c.y + c.h)) < 36 && h.w < 220);
    const fireAhead = moving && (L.fires || []).some((f) => f.x < cx + mdir * 70 + 20 && f.x + f.w > cx - 10 && Math.abs(f.y - (c.y + c.h)) < 40);
    const projComing = Array.isArray(projectiles) && projectiles.some((pr) => pr.hostile && Math.abs((pr.x + pr.w / 2) - cx) < 75 && Math.abs((pr.y + pr.h / 2) - cy) < 40);
    const blocked = moving && Math.abs(c.x - (c._lastX != null ? c._lastX : c.x)) < 0.15;
    c._stuck = blocked ? (c._stuck || 0) + 1 : 0; c._lastX = c.x;

    // Se há buraco à frente mas o líder está parado do mesmo lado, freia antes do buraco!
    const pitAhead = moving && !heroGroundAhead(c, mdir);
    const needCrossGap = pitAhead && Math.sign(lx - cx) === mdir && Math.abs(lx - cx) > 55;
    if (pitAhead && !needCrossGap && c.onGround) {
      inp.left = false; inp.right = false;
    } else if (c.onGround && (needCrossGap || c._stuck > 7 || hazAhead || fireAhead || projComing || (lead.y + lead.h < c.y + c.h - 46 && Math.abs(lx - cx) < 190))) {
      c._aiJump = 18; inp.jumpJustPressed = true;
    }
    if (c._aiJump > 0) { c._aiJump--; inp.jump = true; }

    // Salto duplo / resgate aéreo caso esteja caindo sobre um buraco
    if (!c.onGround && c.vy > 0.4) {
      const overPit = !heroGroundAtX(cx, c.y + c.h + 16) && !heroGroundAhead(c, mdir);
      if ((c.hero === 'zefinha' || c.hero === 'bode_toddy' || c.hero === 'galinha') && !c.usedDouble && (lead.y + lead.h < c.y + c.h - 18 || overPit)) {
        inp.jumpJustPressed = true;
      } else if (overPit && !c._rescuedPit && c.y > lead.y + 20) {
        c._rescuedPit = true;
        c.vy = -10.4;
        c.vx = (lx >= cx ? 1 : -1) * 5.2;
        spawnSparks(cx, c.y + c.h, 6, '#FFE066');
      }
      if (overPit) { inp.jump = true; inp.glide = true; }
    }
    inp.glide = inp.glide || inp.jump;
    return inp;
  }
  // v4.0: o parceiro escolhe a melhor arma do seu arsenal
  function aiPickWeapon(c, tgt) {
    const inv = invOf(c), def = defOf(c), t = tgt.type;
    if (c.hero === 'tonho' || c.hero === 'zefinha') {
      const want = [WEAKNESS[t], WEAKNESS_Z[t]].filter((w) => w && (inv[w] | 0) > 0);
      if (want.length) return want[0];
    }
    const order = orderOf(c).slice(1).reverse();
    for (const w of order) {
      if ((inv[w] | 0) > 0) return w;
    }
    return def;
  }
  function givePartnerStarterWeapons(kind) {
    const starterMap = {
      zefinha: ['presilha', 'boneca_pano', 'bilro'],
      cabeca_vento: ['pipa', 'chiclete', 'aviao_papel', 'bolinha_gude'],
      galinha: ['ciscar', 'ovo_ouro', 'ninho_pintinhos'],
      bode_toddy: ['cabecada_sismica', 'lata_toddy', 'berro_bode'],
      seu_lunga: ['resposta_braba', 'forro_trovao', 'bengala_couro'],
      tatu_bola: ['placa_casco', 'terremoto_tatu', 'espinho_mandacaru'],
      tonho: ['peixeira', 'baleadeira', 'bacamarte']
    };
    const list = starterMap[kind] || [];
    list.forEach((w) => {
      const info = ITEM_INFO[w] || { ammo: 8 };
      const inv = invOf({ hero: kind });
      inv[w] = Math.max(inv[w] | 0, info.ammo || 8);
    });
  }
  function summonCompanionKind(kind) {
    if (!player || !HERO_META[kind]) return;
    if (player.mount && player._mountedCompanion) { player._mountedCompanion = null; player.setMount(false); }
    duoJoined = true;
    companion = makeHero(kind, player.x - (player.facing || 1) * 42, player.y);
    givePartnerStarterWeapons(kind);
    const meta = HERO_META[kind];
    sfx('powerup');
    spawnBurst(companion.x + companion.w / 2, companion.y + companion.h / 2, meta.color, 22);
    floatText(companion.x, companion.y - 30, `${meta.ico} ${meta.label.toUpperCase()} JUNTOU-SE A VOCÊ!`, meta.color);
    updateWeaponUI();
  }
  window.oxeSummonCompanion = summonCompanionKind;

  function updateCompanion(L) {
    if (swapCd > 0) swapCd--;
    // Encontrar o amigo na fase (Zefinha, Cabeça de Vento, Galinha Melindrosa, Bode Toddy, Seu Lunga ou Tatu-Bola!)
    if (L.partner && !L.partner.joined && player && !player.dead && checkAABB({ x: L.partner.x - 24, y: L.partner.y - 68, w: 48, h: 68 }, playerBox())) {
      L.partner.joined = true; duoJoined = true;
      let pKind = (L.partner.kind && HERO_META[L.partner.kind]) ? L.partner.kind : 'zefinha';
      if (pKind === player.hero) pKind = player.hero === 'tonho' ? 'zefinha' : 'tonho';
      companion = makeHero(pKind, L.partner.x - 12, L.partner.y - 54);
      givePartnerStarterWeapons(pKind);
      const meta = HERO_META[pKind] || HERO_META.zefinha;
      sfx('powerup'); spawnBurst(L.partner.x, L.partner.y - 30, meta.color, 24);
      floatText(L.partner.x, L.partner.y - 80, `${meta.ico} ${meta.label.toUpperCase()} ENTROU NA FASE!`, meta.color);
      toast(pKind === 'bode_toddy'
        ? 'Aperte C para jogar com o Bode Toddy ou M para MONTAR nele!'
        : (IS_TOUCH ? `Toque em (${meta.ico}⇄) lá em cima para trocar para ${meta.label}` : `Aperte C para controlar ${meta.label}!`));
      addUnionProgress(18);
      updateWeaponUI();
    }
    if (!companion || !player) return;
    const c = companion;
    const dxl = (player.x - c.x), dyl = (player.y - c.y);
    if (Math.abs(dxl) > 540 || Math.abs(dyl) > 330 || (c._stuck || 0) > 95) teleportCompanion();
    const saved = Object.assign({}, keys);
    Object.assign(keys, companionInputs(c, player, L));
    try { c.update(L); } finally { Object.assign(keys, saved); }
  }
  function fleeJegue(p, mType) { jegueFlee.push({ x: p.x, y: p.y + p.h, vx: -(p.facing || 1) * 5, t: 70, facing: -(p.facing || 1), type: mType || 'jegue' }); }

  // OxeCraft (Minecraft): quebrar blocos de Ouro, Diamante, Madeira, TNT e Terra!
  function breakCraftBlocksNear(cx, cy, R) {
    const L = currentLevel;
    if (!L || !Array.isArray(L.craftBlocks)) return;
    const tntQueue = [];
    for (const b of L.craftBlocks) {
      if (b.broken) continue;
      const bx = b.x + (b.w || 36) / 2, by = b.y + (b.h || 36) / 2;
      if (Math.hypot(bx - cx, by - cy) <= R + 18) {
        const isGold = b.kind === 'gold' || b.kind === 'gold_ore';
        const isDiamond = b.kind === 'diamond' || b.kind === 'diamond_ore';
        const isWood = b.kind === 'wood' || b.kind === 'wood_crate';
        b.hp = (b.hp || 1) - 1;
        spawnSparks(bx, by, 8, isDiamond ? '#4DABF7' : isGold ? '#FFD43B' : isWood ? '#D9A066' : '#9C6644');
        if (b.hp <= 0) {
          b.broken = true;
          sfx('stomp');
          addUnionProgress(4);
          if (isGold) {
            rapaduras += 3; addScore(120);
            floatText(bx, by - 10, '⛏️ +3 RAPADURAS DE OURO!', '#FFD43B');
            updateHUD();
          } else if (isDiamond) {
            addScore(400);
            const dropPool = ['peixeira', 'bacamarte', 'rojao', 'baleadeira', 'pipa', 'ovo_ouro'];
            const w = dropPool[Math.floor(Math.random() * dropPool.length)];
            giveItem(w);
            floatText(bx, by - 12, '💎 DIAMANTE! +ARMA!', '#4DABF7');
          } else if (isWood) {
            rapaduras += 1; addScore(60);
            floatText(bx, by - 10, '🪵 +1 RAPADURA!', '#D9A066');
            updateHUD();
          } else if (b.kind === 'tnt') {
            sfx('quake'); addScreenShake(8);
            spawnBurst(bx, by, '#FF6B6B', 28); spawnSparks(bx, by, 30, '#FFD43B');
            sanfonaRings.push({ x: bx, y: by, r: 12, life: 22, boom: true });
            floatText(bx, by - 16, '🧨 TNT EXPLODIU!', '#FF6B6B');
            L.enemies.forEach((e) => { if (!e.dead && Math.hypot((e.x + e.w / 2) - bx, (e.y + e.h / 2) - by) < 160) e.hit(5, bx, 'rojao'); });
            tntQueue.push({ x: bx, y: by });
          } else {
            addScore(25);
          }
        }
      }
    }
    tntQueue.forEach((q) => breakCraftBlocksNear(q.x, q.y, 90));
  }
  window._oxeBreakBlocks = breakCraftBlocksNear;

  function updateV3World(L) {
    if (window._pacPowerTimer > 0) window._pacPowerTimer--;
    // Especial Supremo da Dupla (unionTimer)
    if (unionTimer > 0) {
      unionTimer--;
      if (player) {
        lightBoost = Math.max(lightBoost, 220);
        if (unionTimer % 18 === 0) {
          const cx = player.x + player.w / 2, cy = player.y + player.h / 2;
          sanfonaRings.push({ x: cx, y: cy, r: 16, life: 18 });
          L.enemies.forEach((e) => {
            if (!e.dead && Math.hypot((e.x + e.w / 2) - cx, (e.y + e.h / 2) - cy) < 230) {
              e.hit(3, cx, 'sanfona');
            }
          });
          if (L.boss && !L.boss.dead && Math.hypot((L.boss.x + L.boss.w / 2) - cx, (L.boss.y + L.boss.h / 2) - cy) < 260) {
            L.boss.takeHit(1);
          }
        }
      }
      if (unionTimer === 0) updateWeaponUI();
    }

    // Aura da fantasia de Sol
    for (const h of [player, companion]) { if (!h || !h.costume || h.costume.type !== 'sol' || frameCount % 20) continue; lightBoost = Math.max(lightBoost, 140);
      const cx = h.x + h.w / 2, cy = h.y + h.h / 2; L.enemies.forEach((e) => { if (!e.dead && Math.hypot(e.x + e.w / 2 - cx, e.y + e.h / 2 - cy) < 78) e.hit(1, cx, 'fantasia'); }); }
    if (player && (player.costume || player.special || unionTimer > 0) && frameCount % 30 === 0) updateWeaponUI();
    for (let i = jegueFlee.length - 1; i >= 0; i--) { const j = jegueFlee[i]; j.x += j.vx; j.t--; if (j.t % 5 === 0) spawnDust(j.x, j.y, 1); if (j.t <= 0) jegueFlee.splice(i, 1); }
    (L.fires || []).forEach((f) => {
      const per = f.period || 170, ph = (frameCount + (f.phase || 0)) % per;
      f.high = ph < per * 0.42; f.warn = !f.high && ph > per - 34; f.ph = ph;
      if (!f.high) return;
      const box = { x: f.x + 8, y: f.y - 88, w: f.w - 16, h: 88 };
      if (player && !player.dead && checkAABB(player, box)) player.takeDamage(1, f.x + f.w / 2);
      if (companion && checkAABB(companion, box)) companion.takeDamage(1, f.x + f.w / 2);
    });

    // Modo OxeCraft (Minecraft): quebrar blocos no ataque corpo-a-corpo
    if (L.specialMode === 'minecraft' && player && player.whipTimer === 10) {
      breakCraftBlocksNear(player.x + player.w / 2 + (player.facing || 1) * 34, player.y + player.h / 2, 48);
    }

    // Modo Oxe-Kart (Corrida de Rolimã): tapetes de turbo, caixas [?], manchas de óleo e karts rivais!
    if (L.specialMode === 'kart' && player && !player.dead) {
      if (keys.right) player.vx = Math.max(player.vx, 6.8);
      const pads = (L.kartTrack && L.kartTrack.boostPads) || L.kartPads || [];
      const boxes = (L.kartTrack && L.kartTrack.itemBoxes) || L.kartBoxes || [];
      const oils = (L.kartTrack && L.kartTrack.oilSlicks) || [];
      pads.forEach((pad) => {
        if (checkAABB(player, { x: pad.x, y: pad.y - 14, w: pad.w || 64, h: 24 })) {
          player.vx = 11.8; player.kartBoost = 45; player.dash = Math.max(player.dash || 0, 22);
          if (!pad._cd || frameCount - pad._cd > 35) {
            pad._cd = frameCount; sfx('whip');
            spawnSparks(player.x, player.y + player.h, 10, '#00F5D4');
            floatText(player.x, player.y - 16, '🏎️ TURBO ROLIMÃ!', '#00F5D4');
          }
        }
      });
      boxes.forEach((bx) => {
        if (bx.cooldown > 0) { bx.cooldown--; if (bx.cooldown <= 0) bx.taken = false; return; }
        if (!bx.taken && checkAABB(player, { x: bx.x - 14, y: bx.y - 14, w: (bx.w || 28), h: (bx.h || 28) })) {
          bx.cooldown = 180; bx.taken = true;
          const items = ['rojao', 'baleadeira', 'pandeiro', 'especial_milho', 'peixeira', 'bacamarte'];
          const pick = items[Math.floor(Math.random() * items.length)];
          giveItem(pick);
          sfx('powerup');
          spawnBurst(bx.x, bx.y, '#FFD43B', 14);
          floatText(bx.x, bx.y - 18, '🎁 CAIXA SURPRESA!', '#FFD43B');
        }
      });
      oils.forEach((oil) => {
        if (checkAABB(player, { x: oil.x, y: oil.y - 8, w: oil.w || 44, h: 18 })) {
          if ((!oil._cd || frameCount - oil._cd > 55) && (player.dash || 0) <= 0 && (player.kartBoost || 0) <= 0) {
            oil._cd = frameCount;
            player.vx = Math.max(2.2, player.vx * 0.55);
            sfx('bonk');
            floatText(player.x, player.y - 14, '🛢️ ÓLEO DE MAMONA!', '#ADB5BD');
          }
        }
      });
      const kr = L.kartRace;
      if (kr) {
        if (kr.rouletteTimer > 0) {
          kr.rouletteTimer--;
          const rItems = ['casco_tatu', 'pimenta_turbo', 'rojao_azul', 'trovao_oxe'];
          kr.rouletteItem = rItems[Math.floor(frameCount / 4) % rItems.length];
          if (kr.rouletteTimer === 0) {
            kr.heldItem = kr.rouletteItem;
            sfx('powerup');
            floatText(player.x, player.y - 18, `🎁 ITEM: ${kr.heldItem.toUpperCase()}!`, '#FFD43B');
          }
        }
        for (let si = (kr.shells3D || []).length - 1; si >= 0; si--) {
          const sh = kr.shells3D[si];
          sh.z += sh.vz || 18;
          sh.life = (sh.life || 120) - 1;
          const hitRv = (L.kartRivals || []).find((r) => Math.abs(r.z - sh.z) < 32 && Math.abs((r.lane || 0) - (sh.lane || 0)) < 0.65);
          if (hitRv) {
            hitRv.spinTimer = 65; sfx('stomp');
            spawnSparks(player.x, player.y, 14, '#FFD43B');
            floatText(player.x, player.y - 20, `💥 ACERTOU ${hitRv.name}!`, '#FFD43B');
            kr.shells3D.splice(si, 1);
            continue;
          }
          if (sh.life <= 0) kr.shells3D.splice(si, 1);
        }
      }
      (L.kartRivals || []).forEach((rv) => {
        if (rv.spinTimer > 0) { rv.spinTimer--; rv.x += 1.2; rv.z = (rv.z || 0) + 1.2; return; }
        // Rubber-banding equilibrado para corrida emocionante
        const diff = player.x - rv.x;
        const base = rv.baseSpd || rv.baseSpeed || 5.1;
        const spd = clamp(base + (diff > 260 ? 1.35 : diff < -220 ? -0.85 : Math.sin(frameCount * 0.03 + rv.x) * 0.35), 3.6, 7.2);
        rv.x = Math.min((L.flagX || L.levelW - 180) - 40, rv.x + spd);
        rv.z = (rv.z || 0) + spd;
        // Encontrar altura da pista abaixo do rival
        const pl = L.platforms.find((p) => !p.falling && rv.x + 20 >= p.x && rv.x <= p.x + p.w);
        if (pl) rv.y = pl.y - 38;
        const hitByProj = Array.isArray(projectiles) && projectiles.find((pr) => !pr.dead && !pr.hostile && Math.abs(pr.x - (rv.x + 20)) < 28 && Math.abs(pr.y - (rv.y + 18)) < 28);
        if ((player.whipTimer > 0 && Math.abs((player.x + player.w / 2) - (rv.x + 22)) < 68 && Math.abs(player.y - rv.y) < 48) || hitByProj) {
          if (hitByProj && !hitByProj.pierce) hitByProj.dead = true;
          rv.spinTimer = 55; sfx('stomp');
          spawnSparks(rv.x + 20, rv.y + 18, 12, '#FFD43B');
          floatText(rv.x, rv.y - 14, `💥 RODOU ${rv.name}!`, '#FFD43B');
        }
      });
    }

    // Modo Oxe-Stars (Estilo Brawl Stars): moitas furtivas, caixas de Power Cube e contagem dos 2 Chefes Brawlers!
    if (L.specialMode === 'brawlstars' && player) {
      (L.brawlBushes || []).forEach((b) => {
        b._heroInside = (player && checkAABB(player, b)) || (companion && checkAABB(companion, b));
      });
      player.inBush = (L.brawlBushes || []).some((b) => checkAABB(player, b));
      if (companion) companion.inBush = (L.brawlBushes || []).some((b) => checkAABB(companion, b));
      const wb = player.whipTimer > 0 && player.getWhipBox ? player.getWhipBox() : null;
      (L.brawlCrates || []).forEach((cr) => {
        if (cr.broken) return;
        const hitMelee = wb && checkAABB(wb, cr) && (!cr._hitF || frameCount - cr._hitF > 12);
        const hitProj = Array.isArray(projectiles) && projectiles.find((pr) => !pr.dead && !pr.hostile && checkAABB(pr, cr));
        if (hitMelee || hitProj) {
          cr._hitF = frameCount;
          if (hitProj && !hitProj.pierce) hitProj.dead = true;
          cr.hp = (cr.hp || 3) - 1;
          sfx('stomp');
          spawnSparks(cr.x + cr.w / 2, cr.y + cr.h / 2, 8, '#FFD43B');
          if (cr.hp <= 0) {
            cr.broken = true;
            player.powerCubes = (player.powerCubes || 0) + 1;
            player.brawlPower = player.powerCubes;
            health = Math.min(maxHealth, health + 1);
            addUnionProgress(12);
            addScore(300);
            sfx('powerup');
            spawnBurst(cr.x + cr.w / 2, cr.y + cr.h / 2, '#51CF66', 18);
            floatText(cr.x + cr.w / 2, cr.y - 12, `⚡ CUBO DE PODER! (Dano +${player.brawlPower})`, '#51CF66');
            updateHUD();
          }
        }
      });
      const bossesAlive = L.enemies.filter((e) => (e.isBrawlBoss || e.brawlBoss) && !e.dead).length;
      L.brawlBossesKilled = Math.max(0, (L.brawlBossesTotal || 2) - bossesAlive);
    }
  }

  // ===================== CONSTRUÇÃO DE FASE =====================
  function buildFromSpec(spec, idx) {
    const arr = (a) => Array.isArray(a) ? a : [];
    const L = {
      spec, idx, worldIdx: spec.worldIdx || 0, stageIdx: spec.stageIdx || 0, name: spec.name || 'Fase', code: spec.code || '',
      specialMode: spec.specialMode || null,
      craftBlocks: arr(spec.craftBlocks).map((b) => Object.assign({}, b)),
      kartTrack: spec.kartTrack ? {
        boostPads: arr(spec.kartTrack.boostPads).map((p) => Object.assign({}, p)),
        itemBoxes: arr(spec.kartTrack.itemBoxes).map((b) => Object.assign({}, b)),
        oilSlicks: arr(spec.kartTrack.oilSlicks).map((o) => Object.assign({}, o))
      } : null,
      kartPads: arr((spec.kartTrack && spec.kartTrack.boostPads) || spec.kartPads).map((p) => Object.assign({}, p)),
      kartBoxes: arr((spec.kartTrack && spec.kartTrack.itemBoxes) || spec.kartBoxes).map((b) => Object.assign({}, b)),
      kartRivals: arr(spec.kartRivals).map((r) => Object.assign({}, r)),
      brawlBushes: arr(spec.brawlBushes).map((b) => Object.assign({}, b)),
      brawlCrates: arr(spec.brawlCrates).map((c) => Object.assign({}, c)),
      brawlBossesTotal: spec.brawlBossesTotal || 2,
      brawlBossesKilled: 0,
      levelW: spec.levelW || 5200, levelH: spec.levelH || 540, width: spec.levelW || 5200, height: spec.levelH || 540, isChallenge: !!spec.isChallenge,
      platforms: arr(spec.platforms).map((p) => Object.assign({}, p, { origX: p.x, origY: p.y, state: 'idle' })),
      rapaduras: arr(spec.rapaduras || spec.coins).map((r) => new Rapadura(r.x, r.y)),
      cajus: arr(spec.cajus || spec.goldenCajus).map((c, i) => new GoldenCaju(c.x, c.y, c.index != null ? c.index : i)),
      stars: arr(spec.asaBrancaStars || spec.stars || spec.asaBrancas).map((s) => new AsaBrancaStar(s.x, s.y)),
      checkpoints: arr(spec.checkpoints || spec.campfires).map((c) => new CampfireCheckpoint(c.x, c.y)),
      items: arr(spec.items).map((it) => new PowerItem(it.x, it.y, it.type)),
      enemies: [], boss: null,
      signs: arr(spec.signs).map((s) => Object.assign({}, s)), vines: arr(spec.vines).map((s) => Object.assign({}, s)),
      geysers: arr(spec.geysers).map((s) => Object.assign({}, s)), lightCrystals: arr(spec.lightCrystals).map((s) => Object.assign({}, s)),
      updrafts: arr(spec.updrafts), windZones: arr(spec.windZones).map((w) => Object.assign({}, w, { dir: w.dir || (w.fx != null ? Math.sign(w.fx) || 1 : 1) })),
      trampolines: arr(spec.trampolines).map((t) => Object.assign({}, t)),
      movingPlatforms: arr(spec.movingPlatforms).map((m) => Object.assign({}, m, { origX: m.x, origY: m.y, prevX: m.x, prevY: m.y, vx: 0, vy: 0, isMoving: true, oneWay: true, managedByGame: true })),
      hazardWheels: arr(spec.hazardWheels).map((w) => Object.assign({}, w, { baseX: w.baseX != null ? w.baseX : w.x, baseY: w.baseY != null ? w.baseY : w.y })),
      tideConfig: spec.tideConfig || null, currentTideY: 99999, darkness: !!spec.darkness || spec.worldIdx === 1,
      hazards: arr(spec.hazards).map((h) => Object.assign({}, h)), logs: arr(spec.logs).map((l) => Object.assign({}, l)), fires: arr(spec.fires).map((f) => Object.assign({}, f)),
      partner: spec.partner ? Object.assign({ joined: false }, spec.partner) : null, duo: !!spec.duo, diffIdx: spec.diffIdx != null ? spec.diffIdx : (spec.worldIdx || 0),
      checkpoint: null, flagpole: null
    };
    if (L.specialMode === 'kart') {
      L.kartRace = {
        trackZ: 0, lap: 1, totalLaps: 3, lapLength: 2600,
        laneX: 0, steer: 0, speed: 6.5, hopY: 0, hopVy: 0,
        driftDir: 0, driftCharge: 0, heldItem: null, rouletteTimer: 0, rouletteItem: 'casco_tatu',
        shells3D: [], lightningFlash: 0, rank: 1
      };
    }
    window._oxeSpecialMode = L.specialMode || null;
    L.movingPlatforms.forEach((mp) => L.platforms.push(mp));
    const sp = spec.spawn || spec.playerStart || { x: spec.respawnX != null ? spec.respawnX : 80, y: spec.respawnY != null ? spec.respawnY : 380 };
    L.spawn = { x: sp.x, y: sp.y }; L.checkpoint = { x: sp.x, y: sp.y };
    const fl = spec.flagpolePos || spec.flag || spec.flagpole || spec.goal;
    if (fl) { L.flagpole = new Flagpole(fl.x, fl.y); L.flag = L.flagpole; L.flagX = fl.x; }
    arr(spec.enemies).forEach((e) => { try { L.enemies.push(new Enemy(e.x, e.y, e.type, Object.assign({}, e, { worldIdx: L.diffIdx }))); } catch (err) { console.warn('Enemy', err); } });
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
    player = makeHero(heroKind, pt.x, pt.y);
    const pKind = (currentLevel && currentLevel.partner && currentLevel.partner.kind && HERO_META[currentLevel.partner.kind])
      ? currentLevel.partner.kind
      : (heroKind === 'tonho' ? 'zefinha' : 'tonho');
    companion = duoJoined ? makeHero(pKind === heroKind ? 'zefinha' : pKind, pt.x - 36, pt.y) : null;
    jegueFlee.length = 0; setTimeout(updateWeaponUI, 0);
    player.invuln = 70; // v2.2: proteção real ao reaparecer
    screenShake = 0;
    view.x = view.px = Math.max(0, pt.x - VW() * 0.4); view.y = view.py = Math.max(0, Math.min(currentLevel.levelH - VH(), pt.y - VH() * 0.55));
  }
  function resetRunState(fresh) {
    maxHealth = (getSettings().assistMode || getSettings().assist) ? 5 : 3; health = maxHealth; tookDamageThisRun = false;
    collectedCajus = [false, false, false];
    unionGauge = 0; unionReady = false; unionTimer = 0; window._unionGaugePct = 0; window._pacPowerTimer = 0;
    if (fresh) {
      score = 0; rapaduras = 0; lives = 3;
      inventory = {}; selectedWeapon = 'chicote'; heldArmor = 0;
      zefInv = {}; zefSel = 'pedrinha';
      cabInv = {}; cabSel = 'estilingue';
      galInv = {}; galSel = 'penas';
      bodInv = {}; bodSel = 'chifrada_toddy';
      lunInv = {}; lunSel = 'sanfona_fole';
      tatInv = {}; tatSel = 'giro_tatu';
    }
    stompCombo = 0;
    sanfonaRings.length = 0; legendIntro = null; setTimeout(updateWeaponUI, 0);
    if (Array.isArray(projectiles)) projectiles.length = 0;
    fxParts.length = 0; fxTexts.length = 0; celebrateTimer = 0; lightBoost = 0;
  }
  function startGame(idx, keepProgress) {
    idx = Math.max(0, Math.min(LAST_LV, idx | 0));
    hideAllScreens(); resetRunState(!keepProgress);
    heroKind = 'tonho'; duoJoined = false; companion = null;
    currentLevelIdx = idx; currentLevel = createLevel(idx);
    if (currentLevel.partner && currentLevel.partner.joined) {
      duoJoined = true;
      givePartnerStarterWeapons(currentLevel.partner.kind);
    }
    spawnPlayerAt(currentLevel.spawn); currentState = GAME_STATE.PLAYING;
    try { AudioEngine.playMusic && AudioEngine.playMusic(currentLevel.spec.music || 'baiao'); } catch (e) {}
    showScreen('hud', true); updateHUD();
  }
  function startChallenge(seed) {
    seed = seed || window.OxeLevels.getDailySeedString();
    hideAllScreens(); resetRunState(true); lives = 1;
    heroKind = 'tonho'; duoJoined = false; companion = null;
    currentChallengeSeed = seed; currentLevelIdx = -1; currentLevel = buildChallengeLevel(seed);
    challengeTimeLeft = currentLevel.spec.timeLimit || 30; challengeStartScore = score; challengeScore = 0;
    spawnPlayerAt(currentLevel.spawn); currentState = GAME_STATE.CHALLENGE;
    try { AudioEngine.playMusic && AudioEngine.playMusic(currentLevel.spec.music); } catch (e) {}
    showScreen('hud', true); updateHUD();
  }
  function confirmStart() { return true; }
  function restartAfterGameOver() {
    const idx = currentLevelIdx, cp = currentLevel && currentLevel.checkpoint ? { x: currentLevel.checkpoint.x, y: currentLevel.checkpoint.y } : null;
    const keepScore = score, keepRap = rapaduras, keepDuo = duoJoined, keepKind = heroKind;
    startGame(idx, true); lives = 3; score = keepScore; rapaduras = keepRap;
    if (keepDuo && currentLevel) { duoJoined = true; heroKind = keepKind; if (currentLevel.partner) currentLevel.partner.joined = true; spawnPlayerAt(currentLevel.spawn); }
    if (cp && currentLevel) {
      currentLevel.checkpoint = cp;
      currentLevel.checkpoints.forEach((c) => { if (c.x <= cp.x + 5) c.active = true; });
      spawnPlayerAt(cp);
    }
    updateHUD();
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
    // Banner do Chefão (v3.0: removido daqui; ficava duplicado com o de render)
    if (false && bossIntroTimer > 0 && L.boss) {
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
      let b = currentLevel && currentLevel.boss;
      if (!b && currentLevel && player) b = currentLevel.enemies.find((e) => e.legend && !e.dead && e.st !== 'intro' && Math.abs(e.x - player.x) < 800);
      const on = !!(b && !b.dead && b.hp > 0 && currentState !== GAME_STATE.LEVEL_COMPLETE);
      const disp = on ? 'flex' : 'none'; if (bb._d !== disp) { bb._d = disp; bb.style.display = disp; }
      if (on) {
        const wv = Math.max(0, b.hp / (b.maxHp || b.hp) * 100).toFixed(1) + '%', fill = $('bossHpFill'), nm = $('bossName');
        if (fill && fill._w !== wv) { fill._w = wv; fill.style.width = wv; }
        if (nm && nm._n !== b.name) { nm._n = b.name; nm.textContent = b.name || 'Chefão'; }
        let hint = $('bossHint'); if (!hint) { hint = document.createElement('div'); hint.id = 'bossHint'; bb.appendChild(hint); }
        if (b.legend) { const ht = b.sub || ''; if (hint._t !== ht) { hint._t = ht; hint.textContent = ht; hint.classList.remove('now'); } }
      }
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
    if (typeof location !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')) return true;
    try {
      if (idx >= SPECIAL_FIRST) return idx === SPECIAL_FIRST ? (starsOf(SPW - 1) > 0 || (SaveManager.data.unlockedLevels | 0) >= SPECIAL_FIRST) : starsOf(idx - 1) > 0;
      return idx === 0 || idx <= (SaveManager.data.unlockedLevels | 0) || starsOf(idx - 1) > 0;
    } catch (e) { return idx === 0; }
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
    const vm = $('victoryMsg'); if (vm) vm.innerHTML = `Arretado, Tonho! <b>${currentLevel.code}</b> vencida.<br>Pontos: ${score} · Rapaduras: ${rapaduras} · Cajus: ${collectedCajus.filter(Boolean).length}/3${!tookDamageThisRun ? '<br>Sem tomar um arranhão!' : ''}${currentLevelIdx === SPW - 1 ? '<br><b>★ Mundo Especial liberado: Noite de São João!</b> Veja no mapa.' : ''}`;
    const nb = $('btnNextStage'); if (nb) nb.style.display = currentLevelIdx < LAST_LV ? '' : 'none';
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

  // ===================== MAPA DOS MUNDOS (8 MUNDOS • 56 FASES) =====================
  window.switchWorldMap = function (worldIdx) {
    const WS = window.OxeLevels.WORLDS;
    mapWorld = Math.max(0, Math.min(WS.length - 1, worldIdx | 0));
    const W = WS[mapWorld];
    if ($('worldTitleText')) $('worldTitleText').textContent = W.special ? `★ ${W.name}` : `Mundo ${mapWorld + 1}: ${W.name}`;
    const tabs = $('worldTabs');
    if (tabs) {
      tabs.innerHTML = '';
      const tabIcons = ['🌵', '🦇', '🌿', '🦀', '🌋', '☀️', '🌾', '🎆'];
      WS.forEach((w, i) => {
        const b = document.createElement('button');
        b.className = 'world-tab' + (i === mapWorld ? ' active' : '') + (w.special ? ' special' : '');
        const ico = tabIcons[i] || '🌵';
        b.textContent = w.special ? `${ico} ★ Especial` : `${ico} M${i + 1}`;
        b.title = w.name;
        b.disabled = !isUnlocked(i * SPW);
        b.onclick = () => window.switchWorldMap(i);
        tabs.appendChild(b);
      });
    }
    const grid = $('levelGrid'); if (!grid) return; grid.innerHTML = '';
    let totalWorldStars = 0;
    for (let s = 0; s < SPW; s++) {
      const idx = mapWorld * SPW + s, st = W.stages[s], un = isUnlocked(idx), stars = starsOf(idx);
      totalWorldStars += stars;
      const b = document.createElement('button');
      let badgeHtml = '';
      let badgeClass = 'norm';
      if (st.code === '1-4') { badgeHtml = '🌀 LABIRINTO'; badgeClass = 'maze'; }
      else if (st.code === '2-4') { badgeHtml = '⛏️ MINAS'; badgeClass = 'mine'; }
      else if (st.code === '3-4') { badgeHtml = '🫏 CORRIDA 3D'; badgeClass = 'race'; }
      else if (st.code === '4-4' || st.code === '6-4' || st.code === '8-4' || st.code === '★-4') { badgeHtml = '💥 BRAWL'; badgeClass = 'brawl'; }
      else if (st.code === '5-4') { badgeHtml = '🦅 VOO LIVRE'; badgeClass = 'fly'; }
      else if (st.code === '7-4') { badgeHtml = '🥊 RINGUE'; badgeClass = 'brawl'; }
      else if (s === SPW - 1) { badgeHtml = '👑 CHEFE'; badgeClass = 'boss'; }
      else if (DUO_STAGES[st.code]) { badgeHtml = '👧 DUPLA'; badgeClass = 'duo'; }
      else { badgeHtml = '🌵 FASE'; badgeClass = 'norm'; }

      b.className = 'level-btn' + (un ? '' : ' locked') + (s === SPW - 1 ? ' boss' : '') + (DUO_STAGES[st.code] ? ' duo' : '') + ' badge-' + badgeClass;
      b.innerHTML = un
        ? `<span class="lvl-badge ${badgeClass}">${badgeHtml}</span><div class="lvl-code">${st.code}</div><div class="lvl-name">${st.name}</div><div class="lvl-stars">${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>`
        : `<div class="lvl-code">🔒</div><div class="lvl-name">${st.code}</div>`;
      b.disabled = !un;
      if (un) b.onclick = () => { sfx('select'); startGame(idx); };
      grid.appendChild(b);
    }
    const summary = $('worldSummaryText');
    if (summary) {
      summary.innerHTML = `⭐ <b>${totalWorldStars} / ${SPW * 3}</b> Estrelas Coletadas • Bioma: <em>${W.biome || W.name}</em>`;
    }
  };
  function openMap() {
    hideAllScreens(); showScreen('hud', false); currentState = GAME_STATE.MAP || GAME_STATE.TITLE;
    try { AudioEngine.pauseMusic(); } catch (e) {}
    const w = currentLevelIdx >= 0 ? Math.floor(currentLevelIdx / SPW) : mapWorld; window.switchWorldMap(w); showScreen('worldMapScreen', true);
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
  on('btnStartGame', () => { let next = 0; for (let i = 0; i < SPECIAL_FIRST; i++) if (isUnlocked(i)) next = i; startGame(next); });
  on('btnOpenMap', openMap); on('btnCloseMap', () => { hideAllScreens(); showScreen('titleScreen', true); currentState = GAME_STATE.TITLE; });
  on('btnPauseHud', togglePause); on('btnResume', togglePause);
  on('btnRestart', () => { showScreen('pauseScreen', false); currentLevel.isChallenge ? startChallenge(currentChallengeSeed) : startGame(currentLevelIdx); });
  on('btnQuitMap', openMap); on('btnVictoryMap', openMap); on('btnGameOverMap', openMap);
  on('btnNextStage', () => startGame(Math.min(LAST_LV, currentLevelIdx + 1), true));
  // v3.0: depois de perder as 3 vidas, a fase volta inteira (todos os bichos voltam); só a posição do checkpoint é mantida
  on('btnRestartFromCheckpoint', () => { restartAfterGameOver(); try { AudioEngine.resumeMusic(); } catch (e) {} });
  on('btnRestartFullLevel', () => startGame(currentLevelIdx));
  on('btnBackToStart', () => { if (confirmStart()) startGame(0); });
  on('btnBackToStartGO', () => startGame(0));
  on('btnStartChallenge', () => startChallenge(window.OxeLevels.getDailySeedString()));
  on('btnRetryChallenge', () => startChallenge(currentChallengeSeed));
  on('btnCloseChallenge', () => { hideAllScreens(); showScreen('hud', false); showScreen('titleScreen', true); currentState = GAME_STATE.TITLE; });
  on('btnShareChallenge', exportChallengeCard);
  on('btnCopyChallengeLink', () => shareOrCopy(challengeLink(), 'OXE! 2.0 · Desafio', `Encara o Desafio ${currentChallengeSeed}!`));
  on('btnShareStage', () => { const i = Math.max(0, currentLevelIdx); shareOrCopy(`${baseUrl()}?fase=${encodeURIComponent(currentLevel ? currentLevel.code : '1-1')}`, 'OXE! 2.0', `Joga a fase ${currentLevel ? currentLevel.code : ''} comigo!`); });
  // Título e pausa abrem as configurações pelo index.html; a engrenagem do HUD pausa antes
  on('btnSettingsHud', () => { if (currentState === GAME_STATE.PLAYING || currentState === GAME_STATE.CHALLENGE) togglePause(); if (window.openSettings) window.openSettings('hud'); });
  window.addEventListener('keydown', (e) => { if (e.repeat) return; if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') togglePause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && (currentState === GAME_STATE.PLAYING || currentState === GAME_STATE.CHALLENGE)) togglePause(); });

  // ===================== LOOP 60Hz =====================
  const finishChallenge = endChallenge;
  const handlePlayerDeath = loseLife;
  HOOKS.finishChallenge = endChallenge; HOOKS.handlePlayerDeath = loseLife;
  function updatePlayingCommon() {
    const L = currentLevel;
    stageTimerFrames++; if (stageTimerFrames % 60 === 0) stageTimerSeconds++;
    updateMovingPlatforms(L);
    if (player.update) player.update(L);
    if (player.dead) return; // animação de queda; o mundo congela
    updateCompanion(L);
    updateBiome();
    updateV3World(L);
    const wb = player.whipTimer > 0 && player.getWhipBox ? player.getWhipBox() : null;
    const cwb = companion && companion.whipTimer > 0 && companion.getWhipBox ? companion.getWhipBox() : null;
    L.enemies.forEach((e) => {
      if (e.dead) {
        if (!e._unionCounted) { e._unionCounted = true; addUnionProgress(4.5); }
        if (e.deathTimer > 0) e.updateDeath(); else e.remove = true;
        return;
      }
      if (e.update) e.update(player, L);
      if (wb && !player.whipHitSet.has(e) && checkAABB(wb, e)) {
        player.whipHitSet.add(e);
        if (L.specialMode === 'pacman') {
          if (e.scaredTimer > 0) {
            addScore(400); sfx('caju'); addUnionProgress(10);
            spawnBurst(e.x + e.w / 2, e.y + e.h / 2, '#4DABF7', 18);
            spawnFloatingText('👻 CHICOTADA NO FANTASMA! +400', e.x + e.w / 2, e.y - 14, '#4DABF7');
            e.x = L.levelW * 0.5 + (Math.random() - 0.5) * 120;
            e.y = L.levelH * 0.45;
            e.scaredTimer = 0; e.stagger = 90;
          } else {
            e.stagger = 130; sfx('bonk'); addScreenShake(2);
            spawnSparks(e.x + e.w / 2, e.y + e.h / 2, 8, '#FFD43B');
            spawnFloatingText('⚡ ATORDOOU O FANTASMA!', e.x + e.w / 2, e.y - 14, '#FFD43B');
          }
        } else {
          let dmg = (player.whipDamage || 1) + (player.brawlPower || 0) + (unionTimer > 0 ? 1 : 0);
          // Estalo certeiro na ponta do chicote (últimos 40% do alcance) causa Dano 2!
          if (player.meleeWeapon === 'chicote') {
            const dist = Math.abs((e.x + e.w / 2) - (player.x + player.w / 2));
            if (dist >= 46) { dmg += 1; spawnSparks(e.x + e.w / 2, e.y + e.h / 2, 10, '#FFD43B'); spawnFloatingText('ESTALO! ×2', e.x + e.w / 2, e.y - 16, '#FFD43B'); }
          }
          e.hit(dmg, player.x, player.meleeWeapon);
        }
      }
      if (cwb && !companion.whipHitSet.has(e) && checkAABB(cwb, e)) { companion.whipHitSet.add(e); e.hit((companion.whipDamage || 1) + (unionTimer > 0 ? 1 : 0), companion.x, companion.meleeWeapon); }
      const harmless = e.state === "stunned" || e.stagger > 0 || e.bubbleTimer > 0 || (e.type === 'alamoa' && e.ghost);
      if (!e.dead && !player.dead && checkAABB(player, e)) {
        // Pac-Oxe: comer fantasma azul assustado!
        if (L.specialMode === 'pacman' && e.scaredTimer > 0) {
          addScore(400); sfx('caju'); addUnionProgress(10);
          spawnBurst(e.x + e.w / 2, e.y + e.h / 2, '#4DABF7', 18);
          spawnFloatingText('👻 COMEU FANTASMA! +400', e.x + e.w / 2, e.y - 14, '#4DABF7');
          e.x = L.levelW * 0.5 + (Math.random() - 0.5) * 120;
          e.y = L.levelH * 0.45;
          e.scaredTimer = 0; e.stagger = 90;
        }
        else if (player.asaBrancaTimer > 0 || unionTimer > 0) { e.hit(3, player.x); }
        else if (player.dash > 0) { if (e.hit(3, player.x, 'fantasia')) { sfx('stomp'); addScreenShake(2); } }
        else if (player.costume && player.costume.type === 'cacto' && !harmless) { if (e.hit(1, player.x, 'fantasia')) spawnSparks(e.x + e.w / 2, e.y + e.h / 2, 6, '#8CE99A'); if (e.legend) player.takeDamage(1, e.x + e.w / 2); }
        else if (player.vy > 0 && player.prevY + player.h <= e.y + 24 && e.canBeStomped()) {
          // v2.5: pisão tira 2 de vida, dá pontos na hora e faz combo se emendar pisões sem tocar o chão
          player.bounce(-9.5); if (e.hit(2 + (player.brawlPower || 0), player.x, 'pisao')) { stompCombo++; const pts = 50 * stompCombo; addScore(pts); spawnFloatingText(stompCombo > 1 ? `COMBO ×${stompCombo} +${pts}` : `+${pts}`, e.x + e.w / 2, e.y - 14, stompCombo > 1 ? '#FFE066' : '#FFFFFF'); } sfx("stomp");
        }
        // Montado no Jegue ou Bode Toddy: atropela SOMENTE durante o DASH/INVESTIDA ativo!
        else if (player.mount && player.dash > 0 && (player.mount.type === 'bode_toddy' || (e.h <= 26 && e.hp <= 2)) && !e.legend && !harmless) {
          if (e.hit(player.mount.type === 'bode_toddy' ? 2 : 1, player.x, 'pisao')) {
            sfx('stomp');
            spawnFloatingText(player.mount.type === 'bode_toddy' ? '🐐 INVESTIDA DO BODE!' : '🫏 TROPEL DO JEGUE!', e.x + e.w / 2, e.y - 10, '#FFE8A3');
          }
        }
        else if (!harmless) { player.takeDamage(1, e.x + e.w / 2); }
      }
      if (companion && !e.dead && !companion.dead && checkAABB(companion, e)) {
        if (L.specialMode === 'pacman' && e.scaredTimer > 0) {
          addScore(400); e.scaredTimer = 0; e.stagger = 90; e.x = L.levelW * 0.5; e.y = L.levelH * 0.45;
        }
        else if (companion.dash > 0 || unionTimer > 0) { e.hit(2, companion.x); }
        else if (companion.vy > 0 && companion.prevY + companion.h <= e.y + 24 && e.canBeStomped()) { companion.bounce(-9); e.hit(2, companion.x, 'pisao'); sfx('stomp'); }
        else if (!harmless) companion.takeDamage(1, e.x + e.w / 2);
      }
    });
    for (let i = L.enemies.length - 1; i >= 0; i--) if (L.enemies[i].remove) L.enemies.splice(i, 1);
    if (L.boss) {
      if (!L.boss.dead && L.boss.update) L.boss.update(player, L);
      if (!L.boss.dead && wb && !player.whipHitSet.has(L.boss) && checkAABB(wb, L.boss)) { player.whipHitSet.add(L.boss); L.boss.takeHit(player.whipDamage || 1); }
      if (!L.boss.dead && cwb && !companion.whipHitSet.has(L.boss) && checkAABB(cwb, L.boss)) { companion.whipHitSet.add(L.boss); L.boss.takeHit(1); }
      if (!L.boss.dead && checkAABB(player, L.boss)) {
        // v3.4: cair na cabeça do chefe quica (e acerta se ele estiver tonto); encostar nele tonto ou se recuperando não tira vida
        if (player.vy > 0 && player.prevY + player.h <= L.boss.y + 28) { player.bounce(-10.2); if (L.boss.isVulnerable()) { L.boss.takeHit(1); sfx("stomp"); } else { player.vx = (player.x + player.w / 2 < L.boss.x + L.boss.w / 2 ? -1 : 1) * 4.5; } }
        else if (L.boss.state !== "stunned" && L.boss.state !== "recover" && L.boss.invuln <= 0) { player.takeDamage(1, L.boss.x + L.boss.w / 2); }
      }
      // (a barra do chefe é atualizada só em updateHUD, sem alternar estilos a cada quadro)
      if (L.boss.dead && L.boss.deathTimer <= 1 && currentState === GAME_STATE.PLAYING) {
        currentState = GAME_STATE.LEVEL_COMPLETE; celebrateTimer = 84;
        try { AudioEngine.playMusic("victory"); } catch (e) {}
      }
    }
    // v2.4: projéteis inimigos agora machucam o Tonho (antes passavam direto) e o chicote rebate
    if (Array.isArray(projectiles)) { for (let i = projectiles.length - 1; i >= 0; i--) {
      const pr = projectiles[i]; if (pr.update) pr.update(L);
      if (!pr.dead && pr.hostile) for (const sh of [player, companion]) { if (sh && sh.shieldTimer > 0 && pr.type !== 'shockwave' && pr.type !== 'slash' && Math.hypot(pr.x + pr.w / 2 - (sh.x + sh.w / 2), pr.y + pr.h / 2 - (sh.y + sh.h / 2)) < 62) { pr.hostile = false; pr.vx = -pr.vx * 1.6; pr.vy = -Math.abs(pr.vy) * 0.4; pr.damage = 2; pr.weapon = 'sombrinha'; pr.owner = sh; pr.life = 100; spawnSparks(pr.x, pr.y, 8, '#FFC9DE'); spawnFloatingText('REBATEU!', sh.x + sh.w / 2, sh.y - 14, '#FFC9DE'); sfx('metal'); break; } }
      if (!pr.dead && pr.hostile) {
        if (wb && pr.type !== 'shockwave' && pr.type !== 'slash' && checkAABB(wb, pr)) { pr.dead = true; spawnSparks(pr.x + pr.w / 2, pr.y + pr.h / 2, 6, '#FFE066'); addScore(10); sfx('metal'); }
        else if (!player.dead && checkAABB(pr, player)) { player.takeDamage(pr.damage || 1, pr.x + pr.w / 2); if (pr.type !== 'shockwave' && pr.type !== 'slash') pr.dead = true; }
      } else if (!pr.dead && !pr.hostile && pr.hitSet) { // atravessam (pandeiro, zabumba, triângulo, poça de fogo)
        const bonusDmg = (player && player.brawlPower) ? player.brawlPower : 0;
        for (const e of L.enemies) { if (!e.dead && !pr.hitSet.has(e) && checkAABB(pr, e)) { if ((pr.type === 'zwave' || pr.type === 'fireZone') && e.fly) continue; pr.hitSet.add(e); e.hit((pr.damage || 1) + bonusDmg, pr.x, pr.weapon); spawnSparks(pr.x + pr.w / 2, pr.y + pr.h / 2, 5, '#FFD43B'); if (pr.maxHits && pr.hitSet.size >= pr.maxHits) { pr.dead = true; break; } } }
        if (L.boss && !L.boss.dead && !pr.hitSet.has(L.boss) && checkAABB(pr, L.boss)) { pr.hitSet.add(L.boss); L.boss.takeHit(1); }
      } else if (!pr.dead && !pr.hostile) {
        const boom = pr.type === 'rojao' || pr.type === 'candeeiro';
        const bonusDmg = (player && player.brawlPower) ? player.brawlPower : 0;
        for (const e of L.enemies) { if (!e.dead && checkAABB(pr, e)) {
          if (!boom) e.hit((pr.damage || 1) + bonusDmg, pr.x, pr.weapon);
          // Chiclete do Menino Cabeça de Vento prende o inimigo numa bolha rosa!
          if (pr.type === 'chiclete' && !e.dead) {
            e.bubbleTimer = 175; e.stagger = Math.max(e.stagger || 0, 175);
            spawnFloatingText('🫧 PRESO NO CHICLETE!', e.x + e.w / 2, e.y - 16, '#FF6B9D');
          }
          // Rede de Dormir prende o inimigo!
          if (pr.type === 'rede' && !e.dead) {
            e.stagger = Math.max(e.stagger || 0, 160);
            spawnFloatingText('🕸️ NA REDE!', e.x + e.w / 2, e.y - 16, '#FFD8A8');
          }
          // Baleadeira ricocheteia no 1º inimigo em direção a outro bicho próximo!
          if (pr.type === 'pedra' && pr.bounces > 0) {
            pr.bounces--;
            const nextE = L.enemies.find((o) => o !== e && !o.dead && Math.hypot(o.x - pr.x, o.y - pr.y) < 240);
            if (nextE) {
              const ang = Math.atan2((nextE.y + nextE.h / 2) - pr.y, (nextE.x + nextE.w / 2) - pr.x);
              pr.vx = Math.cos(ang) * 9.5; pr.vy = Math.sin(ang) * 9.5 - 1.5;
            } else { pr.vx = -pr.vx * 0.75; pr.vy = -4.5; }
            spawnSparks(pr.x, pr.y, 7, '#FFE066');
            break;
          }
          pr.dead = true; spawnSparks(pr.x, pr.y, 5, '#D9C9A3'); break;
        } }
        if (!pr.dead && L.boss && !L.boss.dead && checkAABB(pr, L.boss)) { if (!boom) L.boss.takeHit(1); pr.dead = true; }
      }
      if (L.specialMode === 'minecraft' && !pr.hostile) {
        if (!pr.dead && Array.isArray(L.craftBlocks) && L.craftBlocks.some((b) => !b.broken && checkAABB(pr, { x: b.x, y: b.y, w: b.w || 36, h: b.h || 36 }))) {
          breakCraftBlocksNear(pr.x, pr.y, 38);
          if (!pr.pierce) pr.dead = true;
        } else if (pr.dead) {
          breakCraftBlocksNear(pr.x, pr.y, 38);
        }
      }
      if (pr.type === 'rojao' && pr.dead && !pr.exploded) { pr.exploded = true; explodeRojao(pr); }
      if (pr.type === 'candeeiro' && pr.dead && !pr.exploded) { pr.exploded = true; fireBurst(pr); }
      if (pr.type === 'pamonha' && pr.dead && !pr.exploded) { pr.exploded = true; pamonhaBoom(pr); }
      if (pr.dead || pr.remove) projectiles.splice(i, 1);
    } }
    L.items.forEach((it) => it.update());
    for (let i = sanfonaRings.length - 1; i >= 0; i--) { const r = sanfonaRings[i]; if (!r.beam) r.r += 9; if (--r.life <= 0) sanfonaRings.splice(i, 1); }
    if (legendIntro && --legendIntro.timer <= 0) legendIntro = null;
    if (player.onGround) stompCombo = 0;
    if (player.onGround && Math.abs(player.vx) > 3.5 && frameCount % 9 === 0) spawnDust(player.x + player.w / 2 - player.facing * 8, player.y + player.h, 1);
    L.rapaduras.forEach((r) => r.update()); L.cajus.forEach((c) => c.update()); L.stars.forEach((s) => s.update()); L.checkpoints.forEach((c) => c.update());
    const legendAlive = L.enemies.find((e) => e.legend && !e.dead);
    const brawlLocked = L.specialMode === 'brawlstars' && (L.brawlBossesKilled || 0) < (L.brawlBossesTotal || 2);
    if (L.flagpole && (!L.boss || L.boss.dead || L.boss.hp <= 0)) {
      if (brawlLocked && checkAABB(L.flagpole, playerBox())) {
        if (!L._flagWarn || frameCount - L._flagWarn > 110) {
          L._flagWarn = frameCount;
          floatText(L.flagpole.x, L.flagpole.y + 40, `⭐ DERROTE OS 2 CHEFES BRAWLERS (${L.brawlBossesKilled || 0}/${L.brawlBossesTotal || 2}) PARA ABRIR O PORTAL!`, '#FF6B6B');
        }
      } else if (legendAlive && checkAABB(L.flagpole, playerBox())) {
        if (!L._flagWarn || frameCount - L._flagWarn > 120) { L._flagWarn = frameCount; floatText(L.flagpole.x, L.flagpole.y + 40, 'Vença a lenda primeiro!', '#FFE066'); }
      } else if (!legendAlive && !brawlLocked) {
        L.flagpole.update();
      }
    }
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
      for (const hh of [player, companion]) {
        if (hh && !hh.dead && !hh.onVine && hh.onGround && hh.vy >= 0 &&
            Math.abs(hh.y + hh.h - mp.prevY) <= 3 && hh.x + hh.w > mp.prevX + 2 && hh.x < mp.prevX + mp.w - 2) {
          const ny = mp.y - hh.h;
          hh._carryDX = (hh._carryDX || 0) + mp.vx; hh._carryDY = (hh._carryDY || 0) + (ny - hh.y);
          hh.x += mp.vx; hh.y = ny;
        }
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
    if (screenShake > 0) { screenShake *= 0.8; if (screenShake < 0.4) screenShake = 0; } // v2.2: o tremor agora acaba
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

  function renderKart3D(ctx, L, W, H) {
    const kr = L.kartRace || {
      trackZ: 0, lap: 1, totalLaps: 3, lapLength: 2600,
      laneX: 0, steer: 0, speed: 6.5, hopY: 0, hopVy: 0,
      driftDir: 0, driftCharge: 0, heldItem: null, rouletteTimer: 0, rouletteItem: 'casco_tatu',
      shells3D: [], lightningFlash: 0, rank: 1
    };
    // 1. Céu e horizonte do Sertão (montanhas 3D e sol poente)
    const horizonY = Math.round(H * 0.44);
    const skyG = ctx.createLinearGradient(0, 0, 0, horizonY);
    skyG.addColorStop(0, '#E8590C');
    skyG.addColorStop(0.45, '#F76707');
    skyG.addColorStop(0.8, '#FFA94D');
    skyG.addColorStop(1, '#FFE066');
    ctx.fillStyle = skyG;
    ctx.fillRect(0, 0, W, horizonY);

    // Sol poente dourado do Sertão
    const sunX = Math.round(W * 0.5 - (kr.laneX || 0) * 45);
    const sunY = horizonY - 28;
    const sunHalo = ctx.createRadialGradient(sunX, sunY, 6, sunX, sunY, 78);
    sunHalo.addColorStop(0, 'rgba(255,243,191,0.95)');
    sunHalo.addColorStop(0.35, 'rgba(255,146,43,0.55)');
    sunHalo.addColorStop(1, 'rgba(255,107,107,0)');
    ctx.fillStyle = sunHalo; ctx.fillRect(sunX - 78, sunY - 78, 156, 156);
    ctx.fillStyle = '#FFF3BF'; ctx.beginPath(); ctx.arc(sunX, sunY, 26, 0, Math.PI * 2); ctx.fill();

    // Silhuetas de serras nordestinas ao fundo (parallax suave)
    ctx.fillStyle = '#7A2E1E';
    ctx.beginPath(); ctx.moveTo(0, horizonY);
    for (let x = 0; x <= W; x += 32) {
      const h = Math.sin((x + kr.trackZ * 0.04) * 0.012) * 24 + Math.cos((x + kr.trackZ * 0.02) * 0.02) * 14;
      ctx.lineTo(x, horizonY - 14 - Math.max(0, h));
    }
    ctx.lineTo(W, horizonY); ctx.closePath(); ctx.fill();

    // 2. Projeção de pista 3D (estilo Mode-7 / OutRun / Super Mario Kart)
    const nSlices = 76;
    const roadBaseW = W * 0.88;
    const camHeight = 110;
    const curveBase = Math.sin(kr.trackZ * 0.0018) * 0.75 + Math.cos(kr.trackZ * 0.0009) * 0.5;

    for (let i = nSlices - 1; i >= 0; i--) {
      const p = (i + 1) / nSlices;
      const y0 = Math.round(horizonY + Math.pow(p, 1.85) * (H - horizonY));
      const pNext = (i + 2) / nSlices;
      const y1 = Math.round(horizonY + Math.pow(pNext, 1.85) * (H - horizonY));
      const sliceH = Math.max(1, y1 - y0);

      // Z em profundidade
      const zDist = camHeight / (p * 0.95 + 0.05);
      const worldZ = kr.trackZ + zDist;
      const segIndex = Math.floor(worldZ / 36);

      // Curvatura e perspectiva horizontal
      const curveOffset = Math.pow(1 - p, 2.2) * (curveBase * 240);
      const roadCenterX = (W / 2) - (kr.laneX * roadBaseW * 0.38 * p) + curveOffset;
      const roadW = Math.max(20, roadBaseW * Math.pow(p, 1.35));

      // Cores alternadas da terra (off-road)
      const isAlt = (segIndex % 2 === 0);
      ctx.fillStyle = isAlt ? '#D99B52' : '#C98840';
      ctx.fillRect(0, y0, W, sliceH);

      // Zebras / Rumble strips nas bordas (vermelho e branco)
      const stripW = Math.max(4, roadW * 0.075);
      ctx.fillStyle = isAlt ? '#E03131' : '#F8F9FA';
      ctx.fillRect(roadCenterX - roadW / 2 - stripW, y0, stripW, sliceH);
      ctx.fillRect(roadCenterX + roadW / 2, y0, stripW, sliceH);

      // Superfície da pista (asfalto/terra batida do Sertão)
      const isCheckered = (worldZ % kr.lapLength < 55);
      if (isCheckered) {
        ctx.fillStyle = ((Math.floor(worldZ / 12) + segIndex) % 2 === 0) ? '#111' : '#FFF';
      } else {
        ctx.fillStyle = isAlt ? '#5C3D2E' : '#4E3224';
      }
      ctx.fillRect(roadCenterX - roadW / 2, y0, roadW, sliceH);

      // Linha central amarela tracejada
      if (!isCheckered && (segIndex % 3 === 0)) {
        ctx.fillStyle = '#FFD43B';
        const lineW = Math.max(2, roadW * 0.024);
        ctx.fillRect(roadCenterX - lineW / 2, y0, lineW, sliceH);
      }
    }

    // 3. Objetos 3D na pista (Tapetes Turbo, Caixas [?], Manchas de Óleo)
    const lapZ = kr.trackZ % kr.lapLength;
    // Boost Pads 3D
    const pads3D = [450, 1150, 1920];
    pads3D.forEach((pz) => {
      let dz = pz - lapZ;
      if (dz < 0) dz += kr.lapLength;
      if (dz > 15 && dz < 720) {
        const p = clamp(110 / dz, 0.04, 1);
        const sy = Math.round(horizonY + Math.pow(p, 1.85) * (H - horizonY));
        const curveOffset = Math.pow(1 - p, 2.2) * (curveBase * 240);
        const sx = (W / 2) - (kr.laneX * roadBaseW * 0.38 * p) + curveOffset;
        const pw = Math.max(16, roadBaseW * Math.pow(p, 1.35) * 0.65);
        ctx.fillStyle = (Math.floor(frameCount / 4) % 2 === 0) ? '#00F5D4' : '#FFD43B';
        ctx.fillRect(sx - pw / 2, sy - 4, pw, Math.max(4, p * 16));
        ctx.fillStyle = '#1A1A1A'; ctx.font = `bold ${Math.max(9, Math.round(18 * p))}px sans-serif`;
        ctx.textAlign = 'center';
        if (p > 0.18) ctx.fillText('>>> TURBO >>>', sx, sy);
      }
    });

    // Caixas [?] 3D
    const boxes3D = [280, 820, 1500, 2250];
    boxes3D.forEach((bz, bidx) => {
      let dz = bz - lapZ;
      if (dz < 0) dz += kr.lapLength;
      if (dz > 15 && dz < 750) {
        const p = clamp(110 / dz, 0.04, 1);
        const sy = Math.round(horizonY + Math.pow(p, 1.85) * (H - horizonY)) - Math.round(p * 32);
        const curveOffset = Math.pow(1 - p, 2.2) * (curveBase * 240);
        const laneOffset = ((bidx % 2 === 0 ? -0.35 : 0.35) - kr.laneX) * roadBaseW * 0.38 * p;
        const sx = (W / 2) + laneOffset + curveOffset;
        const bs = Math.max(12, Math.round(p * 46));
        ctx.save();
        ctx.translate(sx, sy + Math.sin(frameCount * 0.12 + bidx) * 4);
        ctx.rotate(Math.sin(frameCount * 0.08 + bidx) * 0.2);
        const boxCols = ['#FF6B6B', '#FFD43B', '#51CF66', '#339AF0', '#CC5DE8'];
        ctx.fillStyle = boxCols[(Math.floor(frameCount / 8) + bidx) % boxCols.length];
        ctx.strokeStyle = '#FFF'; ctx.lineWidth = Math.max(1.5, p * 3);
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(-bs / 2, -bs / 2, bs, bs, 4);
        else ctx.rect(-bs / 2, -bs / 2, bs, bs);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#FFF'; ctx.font = `bold ${Math.max(10, Math.round(bs * 0.72))}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('?', 0, 0);
        ctx.restore();
      }
    });

    // 4. Cascos de Tatu 3D disparados na pista
    (kr.shells3D || []).forEach((sh) => {
      const dz = sh.z - kr.trackZ;
      if (dz > 10 && dz < 800) {
        const p = clamp(110 / dz, 0.04, 1);
        const sy = Math.round(horizonY + Math.pow(p, 1.85) * (H - horizonY)) - Math.round(p * 14);
        const curveOffset = Math.pow(1 - p, 2.2) * (curveBase * 240);
        const sx = (W / 2) + (sh.lane - kr.laneX) * roadBaseW * 0.38 * p + curveOffset;
        const r = Math.max(6, Math.round(p * 22));
        ctx.save();
        ctx.fillStyle = sh.color || '#51CF66';
        ctx.strokeStyle = '#1E120A'; ctx.lineWidth = Math.max(1.5, p * 2.5);
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#FFE066'; ctx.beginPath(); ctx.arc(sx - r * 0.3, sy - r * 0.3, r * 0.35, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    });

    // 5. Vilões Rivais 3D na pista adiante
    const rivals = Array.isArray(L.kartRivals) ? L.kartRivals : [];
    rivals.forEach((rv) => {
      const dz = (rv.z || 120) - (kr.trackZ % kr.lapLength);
      const effZ = dz < -100 ? dz + kr.lapLength : dz;
      if (effZ > 12 && effZ < 780) {
        const p = clamp(110 / effZ, 0.04, 1);
        const sy = Math.round(horizonY + Math.pow(p, 1.85) * (H - horizonY));
        const curveOffset = Math.pow(1 - p, 2.2) * (curveBase * 240);
        const sx = (W / 2) + ((rv.lane || 0) - kr.laneX) * roadBaseW * 0.38 * p + curveOffset;
        const rw = Math.max(18, Math.round(p * 74));
        const rh = Math.max(16, Math.round(p * 66));
        ctx.save();
        ctx.translate(sx, sy);
        if (rv.spinTimer > 0) ctx.rotate(rv.spinTimer * 0.4);
        // Sombra no chão
        ctx.fillStyle = 'rgba(0,0,0,0.38)';
        ctx.beginPath(); ctx.ellipse(0, 0, rw * 0.55, rh * 0.22, 0, 0, Math.PI * 2); ctx.fill();
        // Corpo do kart/jegue rival visto de trás
        ctx.fillStyle = rv.color || '#9C36B5';
        ctx.strokeStyle = '#1A1A1A'; ctx.lineWidth = Math.max(1.5, p * 2.5);
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(-rw / 2, -rh, rw, rh * 0.75, Math.max(3, p * 8));
        else ctx.rect(-rw / 2, -rh, rw, rh * 0.75);
        ctx.fill(); ctx.stroke();
        // Cabeça / Chapéu de couro do vilão visto de trás
        ctx.fillStyle = rv.hatColor || '#3B1F0E';
        ctx.beginPath(); ctx.arc(0, -rh * 0.95, rw * 0.28, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        // Aba do chapéu meia-lua
        ctx.beginPath(); ctx.ellipse(0, -rh * 0.95, rw * 0.45, rh * 0.15, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        // Nome do rival
        if (p > 0.22) {
          ctx.font = `bold ${Math.max(9, Math.round(p * 14))}px sans-serif`;
          ctx.textAlign = 'center'; ctx.fillStyle = '#FFF'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
          ctx.strokeText(rv.name || 'Vilão', 0, -rh * 1.3);
          ctx.fillText(rv.name || 'Vilão', 0, -rh * 1.3);
        }
        ctx.restore();
      }
    });

    // 6. O JEGUE DO TONHO (Câmera atrás, visão traseira do Jegue e do Herói montado!)
    ctx.save();
    const px = Math.round(W / 2 + (kr.steer || 0) * 22);
    const py = Math.round(H - 24 - (kr.hopY || 0));
    const trot = Math.sin(frameCount * 0.35) * (kr.speed > 2 ? 5 : 0);
    const steerTilt = clamp((kr.steer || 0) * 0.14, -0.22, 0.22);
    ctx.translate(px, py + trot);
    ctx.rotate(steerTilt);

    // Faíscas de Drift / Fogo de Turbo no Jegue
    if (player.kartBoost > 0 || (kr.driftCharge || 0) > 0) {
      const sparkCol = (kr.driftCharge >= 50) ? '#E599F7' : (kr.driftCharge >= 22 ? '#FF922B' : '#74C0FC');
      for (let s = -1; s <= 1; s += 2) {
        ctx.fillStyle = sparkCol;
        ctx.beginPath();
        ctx.arc(s * 36, -8 + (frameCount % 4) * 2, 6 + (frameCount % 3) * 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Sombra do Jegue no chão
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath(); ctx.ellipse(0, 4, 44, 14, 0, 0, Math.PI * 2); ctx.fill();

    // Patas traseiras do Jegue (com ferraduras)
    const legSwing = Math.sin(frameCount * 0.4) * 6;
    for (let side = -1; side <= 1; side += 2) {
      const lx = side * 22;
      const ly = -14 + (side === 1 ? legSwing : -legSwing);
      ctx.fillStyle = '#868E96'; ctx.strokeStyle = '#1E120A'; ctx.lineWidth = 2;
      ctx.fillRect(lx - 5, ly, 10, 18);
      ctx.fillStyle = '#343A40'; ctx.fillRect(lx - 6, ly + 14, 12, 5); // ferradura
    }

    // Corpo / Anca peluda do Jegue vista de trás (arredondada, cinza fofinho)
    const jgGrad = ctx.createLinearGradient(0, -68, 0, -10);
    jgGrad.addColorStop(0, '#ADB5BD');
    jgGrad.addColorStop(0.65, '#868E96');
    jgGrad.addColorStop(1, '#495057');
    ctx.fillStyle = jgGrad; ctx.strokeStyle = '#1E120A'; ctx.lineWidth = 2.4;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-34, -58, 68, 48, 22);
    else ctx.rect(-34, -58, 68, 48);
    ctx.fill(); ctx.stroke();

    // Rabo do Jegue com penacho que balança ao correr
    const tailWiggle = Math.sin(frameCount * 0.32) * 12;
    ctx.strokeStyle = '#495057'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, -32); ctx.quadraticCurveTo(tailWiggle * 0.5, -16, tailWiggle, -6); ctx.stroke();
    ctx.fillStyle = '#212529'; ctx.beginPath(); ctx.arc(tailWiggle, -4, 5, 0, Math.PI * 2); ctx.fill();

    // Orelhas compridas do Jegue (apontadas para a frente nas curvas!)
    for (let es = -1; es <= 1; es += 2) {
      ctx.save();
      ctx.translate(es * 18, -62);
      ctx.rotate(es * 0.25 - steerTilt * 0.5);
      ctx.fillStyle = '#868E96'; ctx.strokeStyle = '#1E120A'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, -16, 7, 18, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#FFA8A8'; ctx.beginPath(); ctx.ellipse(0, -15, 3.5, 12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Cangalha / Sela de couro com alforjes
    ctx.fillStyle = '#8B5A2B'; ctx.strokeStyle = '#3E2210'; ctx.lineWidth = 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-26, -64, 52, 14, 4);
    else ctx.rect(-26, -64, 52, 14);
    ctx.fill(); ctx.stroke();
    // Alforjes nas laterais (sacos de mantimento/rapadura)
    for (const af of [-32, 22]) {
      ctx.fillStyle = '#A06A38'; ctx.fillRect(af, -50, 10, 16);
      ctx.strokeRect(af, -50, 10, 16);
    }

    // Herói (Tonho ou amigo) montado no Jegue visto de costas
    const heroCol = (player.hero === 'zefinha' || heroKind === 'zefinha') ? '#F783AC' : '#D9480F';
    ctx.fillStyle = heroCol; ctx.strokeStyle = '#1E120A'; ctx.lineWidth = 2.2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-16, -92, 32, 30, 8);
    else ctx.rect(-16, -92, 32, 30);
    ctx.fill(); ctx.stroke();

    // Chapéu de Couro do Sertão visto de costas (copa arredondada + aba larga meia-lua com estrela dourada)
    const hatG = ctx.createLinearGradient(0, -118, 0, -90);
    hatG.addColorStop(0, '#C98A4B'); hatG.addColorStop(1, '#5C3416');
    ctx.fillStyle = hatG; ctx.strokeStyle = '#1E120A'; ctx.lineWidth = 2.2;
    // Copa
    ctx.beginPath(); ctx.arc(0, -102, 15, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    // Aba larga
    ctx.beginPath(); ctx.ellipse(0, -99, 28, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // Estrela dourada de couro no centro da copa
    ctx.fillStyle = '#FFD43B'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('★', 0, -103);
    ctx.restore();

    // 7. Flash de Trovão (Item Trovão de São Pedro)
    if (kr.lightningFlash > 0) {
      kr.lightningFlash--;
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.85, kr.lightningFlash / 20)})`;
      ctx.fillRect(0, 0, W, H);
    }

    // 8. HUD de Corrida estilo Mario Kart
    // Item Box no topo esquerdo
    ctx.save();
    const ibx = 24, iby = 22, ibs = 52;
    ctx.fillStyle = 'rgba(15,10,24,0.88)';
    ctx.strokeStyle = '#FFD43B'; ctx.lineWidth = 3;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(ibx, iby, ibs, ibs, 10);
    else ctx.rect(ibx, iby, ibs, ibs);
    ctx.fill(); ctx.stroke();
    // Item dentro da caixa
    let itIcon = '❓';
    if (kr.rouletteTimer > 0) {
      const rList = ['🐢', '🌶️', '🚀', '⚡'];
      itIcon = rList[Math.floor(frameCount / 4) % rList.length];
    } else if (kr.heldItem === 'pimenta_turbo') itIcon = '🌶️';
    else if (kr.heldItem === 'rojao_azul') itIcon = '🚀';
    else if (kr.heldItem === 'trovao_oxe') itIcon = '⚡';
    else if (kr.heldItem === 'casco_tatu') itIcon = '🐢';
    ctx.font = '26px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(itIcon, ibx + ibs / 2, iby + ibs / 2);

    // Contador de Voltas (Lap Counter)
    ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'left';
    ctx.fillStyle = '#FFF'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    const lapTxt = kr.lap >= kr.totalLaps ? '🏁 VOLTA FINAL!' : `VOLTA ${kr.lap}/${kr.totalLaps}`;
    ctx.strokeText(lapTxt, ibx + ibs + 14, iby + 22);
    ctx.fillText(lapTxt, ibx + ibs + 14, iby + 22);

    // Posição / Rank (1º, 2º, 3º...)
    const aheadCount = rivals.filter((r) => (r.z || 0) > (kr.trackZ % kr.lapLength)).length;
    kr.rank = aheadCount + 1;
    const rankTxt = `${kr.rank}º`;
    ctx.font = '900 44px sans-serif'; ctx.textAlign = 'right';
    const rankCol = kr.rank === 1 ? '#FFD43B' : (kr.rank === 2 ? '#CED4DA' : (kr.rank === 3 ? '#E599F7' : '#FF8787'));
    ctx.fillStyle = rankCol; ctx.strokeStyle = '#000'; ctx.lineWidth = 6;
    ctx.strokeText(rankTxt, W - 24, 60); ctx.fillText(rankTxt, W - 24, 60);
    ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = '#FFF';
    ctx.strokeText(`/ ${rivals.length + 1}`, W - 24, 82); ctx.fillText(`/ ${rivals.length + 1}`, W - 24, 82);

    // Velocímetro digital
    const speedKmh = Math.round(kr.speed * 8.5);
    ctx.font = 'bold 18px monospace'; ctx.textAlign = 'right';
    ctx.fillStyle = '#00F5D4'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    ctx.strokeText(`${speedKmh} KM/H`, W - 24, H - 24);
    ctx.fillText(`${speedKmh} KM/H`, W - 24, H - 24);

    // Minimapa do Circuito Oval
    const mmW = 92, mmH = 54, mmX = W - mmW - 20, mmY = H - mmH - 52;
    ctx.fillStyle = 'rgba(15,10,24,0.78)'; ctx.strokeStyle = '#5C3D2E'; ctx.lineWidth = 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(mmX, mmY, mmW, mmH, 8);
    else ctx.rect(mmX, mmY, mmW, mmH);
    ctx.fill(); ctx.stroke();
    // Traçado do circuito
    ctx.strokeStyle = '#ADB5BD'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(mmX + mmW / 2, mmY + mmH / 2, mmW * 0.38, mmH * 0.32, 0, 0, Math.PI * 2); ctx.stroke();
    // Ponto dos Rivais no minimapa
    rivals.forEach((rv) => {
      const ang = (((rv.z || 0) % kr.lapLength) / kr.lapLength) * Math.PI * 2;
      const rx = mmX + mmW / 2 + Math.cos(ang) * (mmW * 0.38);
      const ry = mmY + mmH / 2 + Math.sin(ang) * (mmH * 0.32);
      ctx.fillStyle = rv.color || '#E03131'; ctx.beginPath(); ctx.arc(rx, ry, 3.5, 0, Math.PI * 2); ctx.fill();
    });
    // Ponto do Jogador no minimapa (amarelo brilhante)
    const pAng = ((kr.trackZ % kr.lapLength) / kr.lapLength) * Math.PI * 2;
    const pxm = mmX + mmW / 2 + Math.cos(pAng) * (mmW * 0.38);
    const pym = mmY + mmH / 2 + Math.sin(pAng) * (mmH * 0.32);
    ctx.fillStyle = '#FFD43B'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(pxm, pym, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    ctx.restore();
  }

  function drawRolimaKartUnder(ctx, h, camX, camY, color, label) {
    if (!h) return;
    const kx = h.x - camX + (h.w || 36) / 2, ky = h.y - camY + (h.h || 42);
    ctx.save();
    ctx.fillStyle = color || '#E03131';
    ctx.strokeStyle = '#1A1A1A'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(kx - 28, ky - 14, 56, 12, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#8B5A2B'; ctx.fillRect(kx - 22, ky - 16, 44, 4);
    // Rodas de rolimã metálicas
    for (const wx of [-18, 18]) {
      ctx.fillStyle = '#ADB5BD'; ctx.beginPath(); ctx.arc(kx + wx, ky - 2, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#495057'; ctx.beginPath(); ctx.arc(kx + wx, ky - 2, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    // Chamas do escapamento
    if (Math.abs(h.vx || 4) > 3) {
      ctx.fillStyle = frameCount % 2 ? '#FFD43B' : '#FF6B6B';
      ctx.beginPath(); ctx.moveTo(kx - 28, ky - 11); ctx.lineTo(kx - 42 - (frameCount % 6), ky - 8); ctx.lineTo(kx - 28, ky - 5); ctx.closePath(); ctx.fill();
    }
    if (label) {
      ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = '#FFF'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
      ctx.strokeText(label, kx, ky - 48); ctx.fillText(label, kx, ky - 48);
    }
    ctx.restore();
  }

  function render(alpha) {
    if (alpha === undefined) alpha = 1;
    const W = VW(), H = VH();
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    if (!currentLevel || !player) return;
    const L = currentLevel;
    // Em fases de Corrida de Jegue (3-4), renderiza a perspectiva 3D estilo Mario Kart com câmera atrás!
    if (L.specialMode === 'kart') {
      renderKart3D(ctx, L, W, H);
      return;
    }
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
    const A3R = window.OxeArt3;
    if (A3R) A3R.drawWorldBack(ctx, camX, camY, L, frameCount, W, H, player);
    L.items.forEach(draw);
    if (L.flagpole && (!L.boss || L.boss.dead || L.boss.hp <= 0)) {
      if (HD && HD.drawCollectibleHD) HD.drawCollectibleHD(ctx, camX, camY, L.flagpole, 'flagpole', frameCount);
      else draw(L.flagpole);
    }
    L.enemies.forEach(draw);
    // Karts rivais na fase 3-4 (Oxe-Kart)
    if (L.specialMode === 'kart' && Array.isArray(L.kartRivals)) {
      L.kartRivals.forEach((rv) => {
        if (rv.x - camX < -100 || rv.x - camX > W + 100) return;
        ctx.save();
        if (rv.spinTimer > 0) {
          ctx.translate(rv.x - camX + 20, rv.y - camY + 18);
          ctx.rotate(rv.spinTimer * 0.35);
          ctx.translate(-(rv.x - camX + 20), -(rv.y - camY + 18));
        }
        drawRolimaKartUnder(ctx, { x: rv.x, y: rv.y, w: 40, h: 38, vx: 5 }, camX, camY, rv.color || '#9C36B5', rv.name || 'Vilão');
        // Cabeça/chapéu do vilão piloto
        const rx = rv.x - camX + 20, ry = rv.y - camY + 14;
        ctx.fillStyle = '#3B1F0E'; ctx.beginPath(); ctx.arc(rx, ry, 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#FF6B6B'; ctx.fillRect(rx - 7, ry - 3, 5, 3); ctx.fillRect(rx + 2, ry - 3, 5, 3);
        ctx.restore();
      });
    }
    if (L.boss) { draw(L.boss); if (bossIntroTimer <= 0) drawBossGuide(ctx, L.boss, camX, camY); }
    if (Array.isArray(projectiles)) projectiles.forEach(draw);
    if (heldArmor && !player.dead) { const ax = lerp(player.prevX, player.x, alpha) - camX + player.w / 2, ay = lerp(player.prevY, player.y, alpha) - camY + player.h / 2; ctx.save(); ctx.strokeStyle = 'rgba(214,150,90,' + (0.45 + Math.sin(frameCount * 0.12) * 0.2) + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(ax, ay, 26, 34, 0, 0, 7); ctx.stroke(); ctx.restore(); }
    // Raio dourado ligando a dupla durante o Especial Supremo da União!
    if (unionTimer > 0 && player) {
      ctx.save();
      const px = player.x - camX + player.w / 2, py = player.y - camY + player.h / 2;
      if (companion) {
        const cx = companion.x - camX + companion.w / 2, cy = companion.y - camY + companion.h / 2;
        ctx.strokeStyle = frameCount % 2 ? '#FFD43B' : '#74C0FC';
        ctx.lineWidth = 5; ctx.shadowColor = '#FFD43B'; ctx.shadowBlur = 16;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo((px + cx) / 2, Math.min(py, cy) - 28 + Math.sin(frameCount * 0.3) * 12, cx, cy); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,212,59,0.85)'; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.arc(px, py, 38 + Math.sin(frameCount * 0.25) * 6, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    if (companion) {
      if (L.specialMode === 'kart') drawRolimaKartUnder(ctx, companion, camX, camY, '#4DABF7', '');
      draw(companion);
    }
    if (A3R) A3R.drawFleeing(ctx, camX, camY, jegueFlee, frameCount);
    if (L.specialMode === 'kart') drawRolimaKartUnder(ctx, player, camX, camY, '#E03131', '🏎️ TONHO');
    draw(player);
    if (A3R && A3R.drawCostume) { A3R.drawCostume(ctx, camX, camY, companion, frameCount); A3R.drawCostume(ctx, camX, camY, player, frameCount); }
    if (A3R) { if (companion && player.swapMark > 0) A3R.drawSwapMark(ctx, camX, camY, player, frameCount); A3R.drawWorldFront(ctx, camX, camY, L, frameCount, W, H, player); }
    sanfonaRings.forEach((r) => { if (r.beam) { ctx.save(); ctx.globalAlpha = r.life / 16; ctx.globalCompositeOperation = 'lighter'; const bx = r.x - camX, by = r.y - camY; const g = ctx.createLinearGradient(bx, by, bx + r.dir * r.len, by); g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(180,230,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(bx, by - 6); ctx.lineTo(bx + r.dir * r.len, by - 30); ctx.lineTo(bx + r.dir * r.len, by + 30); ctx.lineTo(bx, by + 6); ctx.closePath(); ctx.fill(); ctx.restore(); return; }
      if (r.boom) { ctx.save(); ctx.globalAlpha = r.life / 18; const g = ctx.createRadialGradient(r.x - camX, r.y - camY, 2, r.x - camX, r.y - camY, r.r * 0.6 + 10); g.addColorStop(0, '#FFF3BF'); g.addColorStop(0.5, 'rgba(255,146,43,0.8)'); g.addColorStop(1, 'rgba(255,80,40,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(r.x - camX, r.y - camY, r.r * 0.6 + 10, 0, 7); ctx.fill(); ctx.restore(); return; }
      ctx.save(); ctx.globalAlpha = r.life / 34; ctx.strokeStyle = '#FFE066'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(r.x - camX, r.y - camY, r.r, 0, 7); ctx.stroke(); ctx.fillStyle = '#FFF3BF'; ctx.font = 'bold 20px sans-serif'; for (let k = 0; k < 6; k++) { const a = k * 1.047 + r.r * 0.01; ctx.fillText(k % 2 ? '♪' : '♫', r.x - camX + Math.cos(a) * r.r - 6, r.y - camY + Math.sin(a) * r.r + 6); } ctx.restore(); });
    if (typeof particles !== 'undefined' && Array.isArray(particles)) particles.forEach(draw);
    if (typeof drawFx === 'function') drawFx(ctx, camX, camY);
    if (typeof drawDarkness === 'function') drawDarkness(ctx, camX, camY, L);

    // Indicadores e Barra de União da Dupla
    if (companion || unionGauge > 0 || unionTimer > 0 || (L.specialMode === 'brawlstars' && (L.brawlBossesKilled || 0) >= (L.brawlBossesTotal || 2))) {
      ctx.save();
      if (L.specialMode === 'brawlstars' && (L.brawlBossesKilled || 0) >= (L.brawlBossesTotal || 2)) {
        ctx.font = 'bold 12px sans-serif';
        const pTxt = '⭐ PORTÃO ABERTO! ➡️';
        const tw = ctx.measureText(pTxt).width + 24;
        const bx = (W - tw) / 2, by = 54;
        ctx.fillStyle = 'rgba(15, 10, 22, 0.82)';
        ctx.strokeStyle = '#51CF66'; ctx.lineWidth = 2;
        ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx, by, tw, 24, 12); else ctx.rect(bx, by, tw, 24); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#51CF66'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(pTxt, W / 2, by + 12);
      }
      // Barra de União da Dupla (canto superior esquerdo abaixo dos corações)
      if (companion || unionGauge > 15 || unionTimer > 0) {
        const ux = 14, uy = 56, uw = 156, uh = 16;
        ctx.fillStyle = 'rgba(15, 10, 20, 0.82)';
        ctx.strokeStyle = unionReady || unionTimer > 0 ? '#FFD43B' : '#ADB5BD';
        ctx.lineWidth = 1.8;
        ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(ux, uy, uw, uh, 8); else ctx.rect(ux, uy, uw, uh); ctx.fill(); ctx.stroke();
        const pct = unionTimer > 0 ? (unionTimer / (18 * 60)) : clamp((unionGauge || 0) / 100, 0, 1);
        const grad = ctx.createLinearGradient(ux, uy, ux + uw, uy);
        grad.addColorStop(0, '#FFD43B'); grad.addColorStop(1, '#4DABF7');
        ctx.fillStyle = grad;
        ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(ux + 2, uy + 2, Math.max(4, (uw - 4) * pct), uh - 4, 6); else ctx.rect(ux + 2, uy + 2, (uw - 4) * pct, uh - 4); ctx.fill();
        ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#FFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const uLabel = unionTimer > 0 ? `☯️ UNIÃO ATIVA (${Math.ceil(unionTimer / 60)}s)` : (unionReady ? '☯️ UNIÃO PRONTA! (Aperte U)' : `☯️ UNIÃO DA DUPLA ${Math.floor(unionGauge || 0)}%`);
        ctx.fillText(uLabel, ux + uw / 2, uy + uh / 2);
      }
      ctx.restore();
    }

    if (legendIntro) {
      const a = Math.min(1, legendIntro.timer / 25, (170 - legendIntro.timer) / 15);
      ctx.save(); ctx.globalAlpha = Math.max(0, a);
      const bY = Math.round(H * 0.3); ctx.translate(0, bY - 70); ctx.fillStyle = 'rgba(20,10,0,0.72)'; ctx.fillRect(0, 70, W, 74); ctx.fillStyle = '#FFD43B'; ctx.fillRect(0, 70, W, 2); ctx.fillRect(0, 142, W, 2);
      ctx.textAlign = 'center'; ctx.fillStyle = '#FFE8A3'; ctx.font = 'bold 13px sans-serif'; ctx.fillText('⚠ UMA LENDA APARECEU!', W / 2, 90);
      ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 28px Georgia, serif'; ctx.fillText(legendIntro.name.toUpperCase(), W / 2, 118);
      ctx.fillStyle = '#FFD8A8'; ctx.font = 'italic 14px Georgia, serif'; ctx.fillText(legendIntro.sub, W / 2, 137); ctx.restore();
    }
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
    if (tc._playing !== playing) { tc._playing = playing; tc.classList.toggle('hidden-by-game', !playing); if (!playing) { keys.left = keys.right = keys.down = false; setJump(false); setWhip(false); TouchController.reset(); } }
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
    const m = /^(\d+|★|e|E)-(\d+)$/.exec(str || ''); if (!m) return -1;
    const w = /\d/.test(m[1]) ? parseInt(m[1], 10) : SPECIAL_W + 1, s = parseInt(m[2], 10);
    if (typeof LEVELS !== 'undefined' && Array.isArray(LEVELS)) {
      const idx = LEVELS.findIndex((l) => l && l.world === w && l.stage === s);
      if (idx >= 0) return idx;
      const perWorld = Math.max(1, Math.round(LEVELS.length / 6));
      const guess = (w - 1) * perWorld + (s - 1);
      return guess >= 0 && guess < LEVELS.length ? guess : -1;
    }
    return clamp((w - 1) * SPW + (s - 1), 0, LAST_LV);
  }

  function installQuickTestPanel() {
    if (document.getElementById('oxeQuickTestBar')) return;
    const isTest = location.search.includes('test=1') || location.search.includes('debug=1');
    if (!isTest) return;

    const wrap = document.createElement('div');
    wrap.id = 'oxeQuickTestBar';
    wrap.style.cssText = 'position:fixed;bottom:10px;left:10px;z-index:9999;font-family:sans-serif;font-size:12px;color:#fff;user-select:none;';
    wrap.innerHTML = `
      <button id="oxeToggleTestBtn" type="button" style="background:linear-gradient(135deg,#ff7a1a,#d9480f);color:#fff;border:2px solid #ffe066;border-radius:20px;padding:6px 12px;font-weight:bold;cursor:pointer;box-shadow:0 3px 10px rgba(0,0,0,0.5);">
        🎮 Modos Especiais, Amigos & Armas ▾
      </button>
      <div id="oxeTestDrawer" style="display:${isLocal ? 'block' : 'none'};margin-top:6px;background:rgba(18,12,24,0.94);border:2px solid #ffe066;border-radius:12px;padding:10px;max-width:460px;box-shadow:0 6px 24px rgba(0,0,0,0.75);">
        <div style="font-weight:bold;color:#ffe066;margin-bottom:4px;">🌟 Fases de Modos Especiais (1 clique):</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;">
          <button type="button" data-lv="3" style="background:#f59f00;color:#111;border:none;border-radius:6px;padding:4px 7px;font-weight:bold;cursor:pointer;">🟡 1-4 Pac-Oxe</button>
          <button type="button" data-lv="10" style="background:#40c057;color:#111;border:none;border-radius:6px;padding:4px 7px;font-weight:bold;cursor:pointer;">⛏️ 2-4 OxeCraft</button>
          <button type="button" data-lv="17" style="background:#fa5252;color:#fff;border:none;border-radius:6px;padding:4px 7px;font-weight:bold;cursor:pointer;">🏎️ 3-4 Oxe-Kart</button>
          <button type="button" data-lv="24" style="background:#7950f2;color:#fff;border:none;border-radius:6px;padding:4px 7px;font-weight:bold;cursor:pointer;">⭐ 4-4 Brawl Stars 1</button>
          <button type="button" data-lv="38" style="background:#7950f2;color:#fff;border:none;border-radius:6px;padding:4px 7px;font-weight:bold;cursor:pointer;">⭐ 6-4 Brawl Stars 2</button>
          <button type="button" data-lv="52" style="background:#7950f2;color:#fff;border:none;border-radius:6px;padding:4px 7px;font-weight:bold;cursor:pointer;">⭐ ★-4 Brawl Stars 3</button>
          <button type="button" data-lv="31" style="background:#228be6;color:#fff;border:none;border-radius:6px;padding:4px 7px;font-weight:bold;cursor:pointer;">🚀 5-4 Asa-Delta</button>
          <button type="button" data-lv="45" style="background:#fd7e14;color:#fff;border:none;border-radius:6px;padding:4px 7px;font-weight:bold;cursor:pointer;">🥊 7-4 Street Oxe</button>
        </div>
        <div style="font-weight:bold;color:#74c0fc;margin-bottom:4px;">🤝 Chamar Amigo na Fase (depois aperte C p/ controlar):</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;">
          <button type="button" data-fr="zefinha" style="background:#f783ac;color:#111;border:none;border-radius:6px;padding:4px 7px;font-weight:bold;cursor:pointer;">👧 Zefinha</button>
          <button type="button" data-fr="cabeca_vento" style="background:#4dabf7;color:#111;border:none;border-radius:6px;padding:4px 7px;font-weight:bold;cursor:pointer;">🪁 Cabeça de Vento</button>
          <button type="button" data-fr="galinha" style="background:#ffd43b;color:#111;border:none;border-radius:6px;padding:4px 7px;font-weight:bold;cursor:pointer;">🐔 Galinha Melindrosa</button>
          <button type="button" data-fr="bode_toddy" style="background:#b197fc;color:#111;border:none;border-radius:6px;padding:4px 7px;font-weight:bold;cursor:pointer;">🐐 Bode Toddy</button>
          <button type="button" data-fr="seu_lunga" style="background:#ffa94d;color:#111;border:none;border-radius:6px;padding:4px 7px;font-weight:bold;cursor:pointer;">🪗 Seu Lunga</button>
          <button type="button" data-fr="tatu_bola" style="background:#a9e34b;color:#111;border:none;border-radius:6px;padding:4px 7px;font-weight:bold;cursor:pointer;">🦔 Tatu-Bola</button>
        </div>
        <div style="font-weight:bold;color:#69db7c;margin-bottom:4px;">🫏 Montarias, Todas as Armas & Especial da Dupla:</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;">
          <button type="button" data-act="allweapons" style="background:#ffd43b;color:#111;border:none;border-radius:6px;padding:4px 8px;font-weight:bold;cursor:pointer;">🎒 Liberar Todas as Armas</button>
          <button type="button" data-act="jegue" style="background:#c68b59;color:#fff;border:none;border-radius:6px;padding:4px 8px;font-weight:bold;cursor:pointer;">🫏 Montar Jegue</button>
          <button type="button" data-act="toddy_mount" style="background:#845ef7;color:#fff;border:none;border-radius:6px;padding:4px 8px;font-weight:bold;cursor:pointer;">🐐 Montar Bode Toddy</button>
          <button type="button" data-act="union" style="background:linear-gradient(90deg,#ffd43b,#4dabf7);color:#111;border:none;border-radius:6px;padding:4px 8px;font-weight:bold;cursor:pointer;">☯️ Especial da Dupla</button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
    const btn = document.getElementById('oxeToggleTestBtn');
    const drawer = document.getElementById('oxeTestDrawer');
    btn.addEventListener('click', () => {
      drawer.style.display = drawer.style.display === 'none' ? 'block' : 'none';
    });
    drawer.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.lv != null) {
        startGame(parseInt(b.dataset.lv, 10));
      } else if (b.dataset.fr) {
        if (currentState !== GAME_STATE.PLAYING && currentState !== GAME_STATE.CHALLENGE) startGame(0);
        setTimeout(() => summonCompanionKind(b.dataset.fr), 60);
      } else if (b.dataset.act === 'allweapons') {
        if (currentState !== GAME_STATE.PLAYING && currentState !== GAME_STATE.CHALLENGE) startGame(0);
        setTimeout(() => {
          Object.keys(ITEM_INFO).forEach((k) => {
            if (!['jegue', 'bode_toddy_mount', 'reliquia_uniao', 'especial_milho', 'especial_pamonha', 'especial_tapioca', 'fantasia_cacto', 'fantasia_boi', 'fantasia_sol'].includes(k)) {
              giveItem(k);
            }
          });
          floatText(player.x, player.y - 28, '🎒 TODAS AS ARMAS DE TODOS OS HERÓIS LIBERADAS!', '#FFD43B');
        }, 60);
      } else if (b.dataset.act === 'jegue') {
        if (currentState !== GAME_STATE.PLAYING && currentState !== GAME_STATE.CHALLENGE) startGame(0);
        setTimeout(() => giveItem('jegue'), 60);
      } else if (b.dataset.act === 'toddy_mount') {
        if (currentState !== GAME_STATE.PLAYING && currentState !== GAME_STATE.CHALLENGE) startGame(0);
        setTimeout(() => giveItem('bode_toddy_mount'), 60);
      } else if (b.dataset.act === 'union') {
        if (currentState !== GAME_STATE.PLAYING && currentState !== GAME_STATE.CHALLENGE) startGame(0);
        setTimeout(() => triggerUnionSpecial(), 60);
      }
    });
  }

  function boot() {
    const params = new URLSearchParams(window.location.search);
    const fase = params.get('fase'), desafio = params.get('desafio');
    if (desafio && /^\d{8}$/.test(desafio)) startChallenge('OXE-' + desafio);
    else if (fase && levelIndexFromParam(fase) >= 0) startGame(levelIndexFromParam(fase));
    else if (typeof showTitleScreen === 'function') showTitleScreen();
    else currentState = GAME_STATE.TITLE;
    installQuickTestPanel();
    startMainLoop();
  }

  window.__OXE_TEST__ = {
    getState: () => ({ currentState, stateBeforePause, currentLevelIdx, score, rapaduras, lives, health, maxHealth, tookDamageThisRun, collectedCajus, challengeTimeLeft, challengeScore, currentChallengeSeed }),
    getPlayer: () => player, getCompanion: () => companion, swapHero: () => swapHero(),
    getLevel: () => currentLevel,
    getEnemies: () => currentLevel ? currentLevel.enemies : [],
    getBoss: () => currentLevel ? currentLevel.boss : null,
    getProjectiles: () => projectiles,
    getParticles: () => particles, getFx: () => fxParts, giveItem: (t) => giveItem(t), getInventory: () => ({ inventory, selectedWeapon }),
    getShake: () => screenShake, getView: () => ({ x: view.x, y: view.y }), isUnlocked, starsOf, openMap,
    SaveManager, GAME_STATE,
    loadLevel: (idx) => startGame(idx),
    startChallenge: (seed) => startChallenge(seed),
    togglePause,
    injectInput: (inp) => { if ('jump' in inp) setJump(!!inp.jump); if ('whip' in inp) setWhip(!!inp.whip); Object.assign(keys, inp); if ('jump' in inp) keys.glide = !!inp.jump; },
    step: (n = 1) => { for (let i = 0; i < n; i++) fixedUpdate(); render(1); },
    Enemy, Tonho, BossBull, BossFulozinha, BossPapaFigo, BossSerpente, BossGuardiaoBrasa, BossSombraSeca, BossCorpoSeco, BossBoiEncantado, createBoss, Zefinha,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
