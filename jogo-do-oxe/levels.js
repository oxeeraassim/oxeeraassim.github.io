/* ==========================================================================
 * OXE! 2.0: A Grande Jornada dos Nove Sóis — levels.js
 * 6 Mundos · 30 Fases Autorais · Desafio Diário 30s determinístico
 * Sprints A1, C2, D1, D2, F1, F2, F3, G2 · Correções B1, B12, B17
 * Upgrade: 18 espécies, densidade 3-4x, dupla rota, trampolins,
 *          plataformas móveis e rodas de mandacaru espinhoso.
 *
 * Convenções de coordenadas:
 *  - Plataformas: { x, y, w, h, theme, [optional], [oneWay], [isRock], [falling] }
 *    y = topo da superfície pisável. Solo principal = 460.
 *  - Inimigos terrestres nascem em y = platY - 32.
 *  - updrafts / geysers / windZones: retângulos { x, y, w, h } (y = topo).
 *  - vines: { x, y, length } (y = ponto de ancoragem).
 *  - trampolines: { x, y, w, h, power } (y = topo do tambor, base na plataforma).
 *  - movingPlatforms: { x, y, w, h, axis, range, speed, phase } (x,y = posição base).
 *  - hazardWheels: { x, y, r, baseX, baseY, range, speed } (centro da roda).
 *  - rapaduras / cajus / asaBrancaStars: centro do item.
 *  - signs / checkpoints: y = base (superfície onde estão fincados).
 * ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------------
   * Constantes físicas (validadas pelo Simulador de Alcançabilidade — C2)
   * ---------------------------------------------------------------------- */
  var LEVEL_H = 540;
  var GROUND_Y = 460;
  var PHYS = {
    JUMP_H: 143,            // altura máxima do pulo do Tonho
    JUMP_W: 254,            // alcance horizontal do pulo normal
    GLIDE_W: 490,           // alcance planando
    MAX_STEP_UP: 115,       // desnível vertical obrigatório máximo
    MAX_GAP_PLAIN: 200,     // vão máximo sem assistência
    MAX_GAP_ASSISTED: 360,  // vão máximo com updraft/vine/geyser
    BODE_MIN_RUN: 220,      // pista livre mínima do Bode Doido
    BODE_MIN_PLAT_W: 550,   // largura mínima da plataforma do Bode
    BODE_Y_OFFSET: 32,      // bode nasce em platY - 32
    ROCK_W: 36,
    ROCK_H: 40,
    TRAMP_W: 48,
    TRAMP_H: 28,
    TRAMP_POWER: 15.5
  };

  // v2.2: densidade progressiva. Antes eram 18 a 28 inimigos já no 1º mundo (difícil demais).
  var MIN_ENEMIES = 18;
  var MAX_ENEMIES = 28;
  function enemyBudget(worldIdx, stageIdx) {
    var w = Math.max(0, worldIdx | 0), s = Math.max(0, stageIdx | 0);
    var min = 8 + w * 2 + s;          // 1-2: 9 · 3-2: 13 · 6-4: 21
    return { min: min, max: min + (w < 2 ? 4 : 5) };
  }
  // Espécies mais brabas só aparecem a partir de certo mundo
  var TOUGH_FROM_WORLD = { cangaceiro_sombra: 2, mula_sem_cabeca: 3, boitata_fogo: 2, lobisomem: 4 };

  /* ------------------------------------------------------------------------
   * RNG determinístico (B17: NUNCA Math.random)
   * ---------------------------------------------------------------------- */
  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashSeed(str) {
    str = String(str);
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
    return h >>> 0;
  }

  function wrapRand(f) {
    return {
      next: f,
      range: function (a, b) { return a + f() * (b - a); },
      int: function (a, b) { return a + Math.floor(f() * (b - a + 1)); },
      chance: function (p) { return f() < p; },
      pick: function (arr) { return arr[Math.floor(f() * arr.length)]; },
      weighted: function (map) {
        var tot = 0, k, last = null;
        for (k in map) { if (map[k] > 0) { tot += map[k]; last = k; } }
        var x = f() * tot;
        for (k in map) { if (map[k] > 0) { x -= map[k]; if (x <= 0) return k; } }
        return last;
      }
    };
  }

  function makeRand(seed) { return wrapRand(mulberry32(seed)); }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function extend(dst, src) { if (src) { for (var k in src) dst[k] = src[k]; } return dst; }

  /* ------------------------------------------------------------------------
   * Espécies de inimigos (18)
   * ---------------------------------------------------------------------- */
  var ENEMY_SPECIES = [
    'calango', 'tatu', 'carcara', 'morcego', 'cacto_atirador', 'bode_doido',
    'fulozinha', 'papa_figo', 'caranguejo', 'baiacu', 'salamandra',
    'sapo_cururu', 'marimbondo', 'jararaca', 'cangaceiro_sombra',
    'mula_sem_cabeca', 'boitata_fogo', 'lobisomem'
  ];
  var NEW_SPECIES = ['sapo_cururu', 'marimbondo', 'jararaca', 'cangaceiro_sombra',
    'mula_sem_cabeca', 'boitata_fogo', 'lobisomem'];

  /* ------------------------------------------------------------------------
   * Mundos e Fases (A1)
   * ---------------------------------------------------------------------- */
  function stages(list, worldIdx) {
    return list.map(function (name, s) {
      return {
        idx: worldIdx * 5 + s,
        code: (worldIdx + 1) + '-' + (s + 1),
        name: name,
        isBoss: s === 4
      };
    });
  }

  var WORLDS = [
    {
      id: 1, idx: 0, name: 'O Sertão dos Mandacarus', biome: 'sertao', music: 'baiao',
      mechanic: 'updrafts', bossType: 'bull',
      enemies: ['calango', 'cacto_atirador', 'bode_doido', 'carcara', 'tatu',
        'sapo_cururu', 'marimbondo', 'jararaca', 'cangaceiro_sombra', 'mula_sem_cabeca',
        'boitata_fogo', 'lobisomem'],
      stages: stages(['O Despertar do Mandacaru', 'Vereda do Bode Doido', 'Ninho do Carcará',
        'Lajedo do Sol Quente', '👑 O Touro de Fogo Ancestral'], 0)
    },
    {
      id: 2, idx: 1, name: 'Cavernas da Serra da Capivara', biome: 'caverna', music: 'caverna',
      mechanic: 'darkness', bossType: 'fulozinha',
      enemies: ['morcego', 'tatu', 'cacto_atirador', 'fulozinha',
        'sapo_cururu', 'marimbondo', 'jararaca', 'cangaceiro_sombra', 'mula_sem_cabeca',
        'boitata_fogo', 'lobisomem'],
      stages: stages(['Pinturas Rupestres', 'Gruta dos Vagalumes', 'Abismo de Quartzo',
        'Santuário Subterrâneo', '👑 Comadre Fulozinha'], 1)
    },
    {
      id: 3, idx: 2, name: 'Pântano e Mata de Caroá', biome: 'pantano', music: 'forro',
      mechanic: 'vines', bossType: 'papa_figo',
      enemies: ['carcara', 'fulozinha', 'papa_figo', 'calango',
        'sapo_cururu', 'marimbondo', 'jararaca', 'cangaceiro_sombra', 'mula_sem_cabeca',
        'boitata_fogo', 'lobisomem'],
      stages: stages(['Cipós da Caatinga', 'Vento do Agreste', 'Assovios na Neblina',
        'Trilha da Meia-Noite', '👑 O Papa-Figo'], 2)
    },
    {
      id: 4, idx: 3, name: 'Litoral e Manguezal', biome: 'mangue', music: 'coco',
      mechanic: 'tide', bossType: 'serpente',
      enemies: ['caranguejo', 'baiacu', 'carcara',
        'sapo_cururu', 'marimbondo', 'jararaca', 'cangaceiro_sombra', 'mula_sem_cabeca',
        'boitata_fogo', 'lobisomem'],
      stages: stages(['Praia dos Jangadeiros', 'Raízes do Mangue', 'Maré de Quarto Crescente',
        'Recife dos Corais', '👑 Serpente da Maré'], 3)
    },
    {
      id: 5, idx: 4, name: 'Cânion dos Nove Sóis', biome: 'canion', music: 'maracatu',
      mechanic: 'geysers', bossType: 'guardiao',
      enemies: ['salamandra', 'bode_doido', 'carcara', 'tatu',
        'sapo_cururu', 'marimbondo', 'jararaca', 'cangaceiro_sombra', 'mula_sem_cabeca',
        'boitata_fogo', 'lobisomem'],
      stages: stages(['Fendas de Vapor', 'Pontes de Pedra-Pomes', 'Caldeira do Boqueirão',
        'Forja do Sol Poente', '👑 Guardião de Brasa'], 4)
    },
    {
      id: 6, idx: 5, name: 'O Trono da Seca', biome: 'trono', music: 'frevo',
      mechanic: 'all', bossType: 'sombra',
      enemies: ['calango', 'tatu', 'caranguejo', 'salamandra', 'papa_figo', 'morcego',
        'carcara', 'fulozinha', 'baiacu', 'cacto_atirador', 'bode_doido',
        'sapo_cururu', 'marimbondo', 'jararaca', 'cangaceiro_sombra', 'mula_sem_cabeca',
        'boitata_fogo', 'lobisomem'],
      stages: stages(['Portais da Miragem', 'Torre dos Ventos', 'Corredor dos Eclipses',
        'Altar dos Nove Sóis', '👑 A Sombra da Seca'], 5)
    }
  ];

  var TOTAL_LEVELS = 30;

  var BOSS_INFO = {
    bull:      { name: 'Touro de Fogo Ancestral', hp: 8,  phases: 2, w: 120, h: 96 },
    fulozinha: { name: 'Comadre Fulozinha',       hp: 10, phases: 2, w: 64,  h: 96 },
    papa_figo: { name: 'O Papa-Figo',             hp: 12, phases: 2, w: 80,  h: 112 },
    serpente:  { name: 'Serpente da Maré',        hp: 14, phases: 3, w: 160, h: 96 },
    guardiao:  { name: 'Guardião de Brasa',       hp: 16, phases: 3, w: 112, h: 128 },
    sombra:    { name: 'A Sombra da Seca',        hp: 20, phases: 3, w: 128, h: 144 }
  };

  /* ------------------------------------------------------------------------
   * Configuração de geração por bioma (B12: inimigos por bioma)
   * ---------------------------------------------------------------------- */
  var WORLD_GEN = {
    sertao: {
      weights: { run: 4, updraft: 2, ledge: 2, bode: 1.2, stairs: 1 },
      ground: ['calango', 'tatu', 'sapo_cururu', 'jararaca', 'cangaceiro_sombra', 'mula_sem_cabeca', 'lobisomem'],
      flyer: ['carcara', 'marimbondo', 'boitata_fogo'],
      shooter: 'cacto_atirador', bode: true,
      themes: ['soil', 'stone'], minY: 300, maxY: 460, windStrength: 0.3
    },
    caverna: {
      weights: { run: 4, ledge: 2, stairs: 2, updraft: 1, falling: 0.6 },
      ground: ['tatu', 'sapo_cururu', 'jararaca', 'cangaceiro_sombra', 'mula_sem_cabeca', 'lobisomem'],
      flyer: ['morcego', 'fulozinha', 'marimbondo', 'boitata_fogo'],
      shooter: 'cacto_atirador', bode: false,
      themes: ['cave', 'crystal'], minY: 300, maxY: 460, darkness: true, crystals: true, windStrength: 0.3
    },
    pantano: {
      weights: { run: 3, vine: 3, wind: 2, ledge: 1 },
      ground: ['calango', 'papa_figo', 'sapo_cururu', 'jararaca', 'cangaceiro_sombra', 'mula_sem_cabeca', 'lobisomem'],
      flyer: ['carcara', 'fulozinha', 'marimbondo', 'boitata_fogo'],
      shooter: null, bode: false,
      themes: ['moss', 'wood'], minY: 300, maxY: 460, windStrength: 0.3
    },
    mangue: {
      weights: { run: 2, tidePosts: 3, updraft: 1, ledge: 1, vine: 1 },
      ground: ['caranguejo', 'sapo_cururu', 'jararaca', 'cangaceiro_sombra', 'mula_sem_cabeca', 'lobisomem'],
      flyer: ['carcara', 'baiacu', 'marimbondo', 'boitata_fogo'],
      shooter: null, bode: false,
      themes: ['sand', 'root'], minY: 300, maxY: 420, tide: true, windStrength: 0.3
    },
    canion: {
      weights: { run: 2, geyser: 3, falling: 2, bode: 1, ledge: 1, updraft: 1 },
      ground: ['salamandra', 'tatu', 'sapo_cururu', 'jararaca', 'cangaceiro_sombra', 'mula_sem_cabeca', 'lobisomem'],
      flyer: ['carcara', 'marimbondo', 'boitata_fogo'],
      shooter: null, bode: true,
      themes: ['basalt', 'pumice'], minY: 300, maxY: 460, windStrength: 0.3
    },
    trono: {
      weights: { run: 2, updraft: 1, vine: 1, geyser: 1, falling: 1, bode: 1, wind: 1, ledge: 1, stairs: 1 },
      ground: ['calango', 'tatu', 'caranguejo', 'salamandra', 'papa_figo',
        'sapo_cururu', 'jararaca', 'cangaceiro_sombra', 'mula_sem_cabeca', 'lobisomem'],
      flyer: ['morcego', 'carcara', 'fulozinha', 'baiacu', 'marimbondo', 'boitata_fogo'],
      shooter: 'cacto_atirador', bode: true,
      themes: ['obsidian', 'gold'], minY: 300, maxY: 460, elite: true, crystals: true, windStrength: 0.35
    }
  };

  var STAGE_TWEAKS = {
    '1-2': { weights: { bode: 3 } },
    '1-3': { flyerBias: 0.35, weights: { ledge: 3 } },
    '1-4': { weights: { updraft: 4, stairs: 2 } },
    '2-2': { crystalSpacing: 320 },
    '2-3': { weights: { updraft: 3, falling: 1.5 } },
    '2-4': { weights: { ledge: 3 } },
    '3-2': { weights: { wind: 5 }, windStrength: 0.42 },
    '3-3': { fog: true },
    '3-4': { darkness: true, crystals: true },
    '4-3': { tideAmp: 52 },
    '4-4': { weights: { run: 3, tidePosts: 2 } },
    '5-2': { weights: { falling: 5 } },
    '5-3': { weights: { geyser: 5 } },
    '5-4': { weights: { bode: 2, geyser: 2 } },
    '6-2': { weights: { wind: 3, updraft: 3 } },
    '6-3': { darkness: true },
    '6-4': { tide: true }
  };

  var MECHANIC_SIGNS = {
    caverna: {
      title: 'Escuridão na Gruta!', icon: '🏮',
      textTouch: 'Sua lamparina ilumina pouco. Encoste nos Cristais de Luz para clarear o caminho.',
      textKey: 'Sua lamparina ilumina pouco. Encoste nos Cristais de Luz para clarear o caminho.'
    },
    pantano: {
      title: 'Cipós e Ventania', icon: '🌿',
      textTouch: 'Pule num cipó para se agarrar e toque em PULAR para se lançar. O vento empurra você no ar!',
      textKey: 'Pule num cipó para se agarrar e aperte ESPAÇO para se lançar. O vento empurra você no ar!'
    },
    mangue: {
      title: 'A Maré Sobe e Desce', icon: '🌊',
      textTouch: 'Fique de olho na maré: espere ela baixar e atravesse pelas palafitas.',
      textKey: 'Fique de olho na maré: espere ela baixar e atravesse pelas palafitas.'
    },
    canion: {
      title: 'Gêiseres e Pedra-Pomes', icon: '♨️',
      textTouch: 'Os gêiseres arremessam você para o alto. A pedra-pomes cede: não fique parado nela!',
      textKey: 'Os gêiseres arremessam você para o alto. A pedra-pomes cede: não fique parado nela!'
    },
    trono: {
      title: 'O Trono da Seca', icon: '☀️',
      textTouch: 'Tudo o que você aprendeu será testado: planar, cipós, gêiseres e cristais de luz!',
      textKey: 'Tudo o que você aprendeu será testado: planar, cipós, gêiseres e cristais de luz!'
    },
    sertao: null
  };

  /* ------------------------------------------------------------------------
   * Estrutura base de uma fase
   * ---------------------------------------------------------------------- */
  function emptySpec(meta) {
    return extend({
      platforms: [], enemies: [], rapaduras: [], cajus: [], asaBrancaStars: [],
      checkpoints: [], updrafts: [], signs: [], vines: [], geysers: [],
      lightCrystals: [], windZones: [],
      trampolines: [], movingPlatforms: [], hazardWheels: [],
      tideConfig: null, bossType: null, boss: null, bossArena: null,
      flagpolePos: { x: 0, y: 0 }, flagHiddenUntilBoss: false,
      levelW: 5000, levelH: LEVEL_H, respawnX: 80, respawnY: 400,
      worldIdx: 0, stageIdx: 0, idx: 0, code: '', name: '', worldName: '',
      biome: 'sertao', music: 'baiao', mechanic: 'updrafts',
      darkness: false, fog: false, isBoss: false, isChallenge: false
    }, meta);
  }

  function addArc(S, x0, y0, x1, y1, n, H) {
    n = n || 6; H = H || 110;
    for (var i = 0; i < n; i++) {
      var t = n === 1 ? 0.5 : i / (n - 1);
      var x = x0 + (x1 - x0) * t;
      var y = (y0 + (y1 - y0) * t) - 40 - 4 * H * t * (1 - t);
      S.rapaduras.push({ x: Math.round(x), y: Math.round(Math.max(40, y)) });
    }
  }

  function addLine(S, x, y, n, dx) {
    for (var i = 0; i < n; i++) S.rapaduras.push({ x: Math.round(x + i * dx), y: Math.round(y) });
  }

  function tramp(x, platY) {
    return { x: Math.round(x), y: platY - PHYS.TRAMP_H, w: PHYS.TRAMP_W, h: PHYS.TRAMP_H, power: PHYS.TRAMP_POWER };
  }

  function wheel(x, y, range, speed) {
    return { x: Math.round(x), y: Math.round(y), r: 22, baseX: Math.round(x), baseY: Math.round(y),
      range: range || 70, speed: speed || 0.035 };
  }

  /* ------------------------------------------------------------------------
   * FASE 1-1 ARTESANAL (D1 & D2): O Despertar do Mandacaru
   * ---------------------------------------------------------------------- */
  function buildLevel1_1() {
    var W = WORLDS[0];
    var S = emptySpec({
      idx: 0, worldIdx: 0, stageIdx: 0, code: '1-1', name: W.stages[0].name,
      worldName: W.name, biome: W.biome, music: W.music, mechanic: W.mechanic,
      levelW: 5700, respawnX: 80, respawnY: 400, handcrafted: true
    });

    S.platforms = [
      { x: 0,    y: 460, w: 900, h: 80,  theme: 'soil' },
      { x: 480,  y: 290, w: 160, h: 20,  theme: 'wood',  optional: true, oneWay: true },
      { x: 1060, y: 460, w: 760, h: 80,  theme: 'soil' },
      { x: 1250, y: 400, w: 110, h: 20,  theme: 'wood',  optional: true, oneWay: true },
      { x: 1400, y: 312, w: 180, h: 20,  theme: 'stone', optional: true, oneWay: true },
      { x: 1640, y: 230, w: 150, h: 20,  theme: 'wood',  optional: true, oneWay: true },
      { x: 1920, y: 460, w: 900, h: 80,  theme: 'soil' },
      { x: 2200, y: 420, w: 36,  h: 40,  theme: 'stone', isRock: true },
      { x: 2580, y: 290, w: 180, h: 20,  theme: 'wood',  optional: true, oneWay: true },
      { x: 3140, y: 420, w: 500, h: 120, theme: 'stone' },
      { x: 3300, y: 290, w: 150, h: 20,  theme: 'wood',  optional: true, oneWay: true },
      { x: 3800, y: 360, w: 260, h: 180, theme: 'stone' },
      { x: 4200, y: 460, w: 720, h: 80,  theme: 'soil' },
      { x: 4520, y: 250, w: 160, h: 20,  theme: 'stone', optional: true, oneWay: true },
      { x: 4640, y: 360, w: 120, h: 20,  theme: 'wood',  optional: true, oneWay: true },
      { x: 5080, y: 460, w: 620, h: 80,  theme: 'soil' },
      { x: 5180, y: 290, w: 160, h: 20,  theme: 'wood',  optional: true, oneWay: true }
    ];

    S.enemies = [
      { type: 'calango', x: 620, y: 428, dir: -1, patrol: { minX: 460, maxX: 700 } },
      // v2.2: 1-1 mais amigável (menos inimigos e nenhuma espécie "braba")
      { type: 'tatu', x: 1360, y: 428, dir: -1, armored: true, patrol: { minX: 1200, maxX: 1520 } },
      // 1º Cacto Atirador: saliência OPCIONAL elevada, nunca bloqueia a rota principal
      { type: 'cacto_atirador', x: 1474, y: 280, dir: -1, fireRate: 150, onLedge: true },
      { type: 'jararaca', x: 1720, y: 428, dir: -1, patrol: { minX: 1600, maxX: 1800 } },
      // Bode Doido: corre ~244 px até bater na rocha (2236 → 2480)
      { type: 'bode_doido', x: 2480, y: 428, dir: -1, chargeSpeed: 4.5, stunFrames: 150,
        platformX: 1920, platformW: 900, rockX: 2200 },
      { type: 'carcara', x: 2680, y: 230, dir: -1, amp: 30, patrol: { minX: 2560, maxX: 2800 } },
      { type: 'sapo_cururu', x: 3260, y: 388, dir: -1, hopPower: 9, patrol: { minX: 3160, maxX: 3420 } },
      { type: 'jararaca', x: 3940, y: 328, dir: -1, patrol: { minX: 3820, maxX: 4040 } },
      { type: 'marimbondo', x: 4460, y: 320, dir: -1, amp: 26, patrol: { minX: 4380, maxX: 4560 } },
      { type: 'tatu', x: 4520, y: 428, dir: -1, armored: true, patrol: { minX: 4400, maxX: 4880 } },
      { type: 'calango', x: 4820, y: 428, dir: -1, patrol: { minX: 4720, maxX: 4900 } },
      { type: 'cacto_atirador', x: 5260, y: 258, dir: -1, fireRate: 170, onLedge: true },
      { type: 'calango', x: 5260, y: 428, dir: -1, patrol: { minX: 5140, maxX: 5400 } }
    ];

    S.updrafts = [
      { x: 2920, y: 100, w: 120, h: 440, strength: 0.6 }
    ];

    // 4 Tambores Zabumba Trampolim → rota alta opcional
    S.trampolines = [
      tramp(420, 460),
      tramp(2600, 460) && { x: 2780, y: 432, w: 48, h: 28, power: 15.5 },
      tramp(4450, 460),
      tramp(5120, 460)
    ];

    // 2 Plataformas Móveis em rotas aéreas opcionais
    S.movingPlatforms = [
      { x: 920, y: 320, w: 120, h: 22, axis: 'x', range: 90, speed: 0.025, phase: 0, optional: true },
      { x: 2960, y: 240, w: 120, h: 22, axis: 'y', range: 90, speed: 0.025, phase: 1.6, optional: true }
    ];

    // 3 Rodas de Mandacaru Espinhoso
    S.hazardWheels = [
      wheel(1640, 360, 70, 0.035),
      wheel(3400, 340, 70, 0.03),
      wheel(4780, 250, 70, 0.04)
    ];

    S.signs = [
      { x: 160, y: 460, title: 'Correr e Pular', icon: '🏃',
        textTouch: 'Use ◀ ▶ para correr e toque em PULAR (▲) para saltar os vãos.',
        textKey: 'Use ← → (ou A / D) para correr e ESPAÇO (ou W) para pular.' },
      { x: 300, y: 460, title: 'Pisada na Cabeça e Chicote', icon: '🤠',
        textTouch: 'Pule na cabeça do calango ou toque em CHICOTE (⚡) para estalar o couro!',
        textKey: 'Pule na cabeça do calango ou aperte J / X para estalar o chicote!' },
      { x: 1110, y: 460, title: 'Cuidado: Cacto Atirador!', icon: '🌵',
        textTouch: 'Ele cospe espinhos lá de cima. Siga pelo chão ou suba pelos degraus atrás do Caju Dourado.',
        textKey: 'Ele cospe espinhos lá de cima. Siga pelo chão ou suba pelos degraus atrás do Caju Dourado.' },
      { x: 2040, y: 460, title: 'Espere o Bode Doido!', icon: '🐐',
        textTouch: 'Fique atrás da rocha. O bode investe, bate a cabeça e fica tonto: aí é a sua vez!',
        textKey: 'Fique atrás da rocha. O bode investe, bate a cabeça e fica tonto: aí é a sua vez!' },
      { x: 2700, y: 460, title: 'Planar na Corrente Térmica', icon: '🪂',
        textTouch: 'Pule e SEGURE o botão PULAR no ar para planar com o chapéu. O vento quente leva você para o alto!',
        textKey: 'Pule e SEGURE ESPAÇO no ar para planar com o chapéu. O vento quente leva você para o alto!' },
      { x: 4300, y: 460, title: 'Pisão ▼', icon: '▼',
        textTouch: 'O tatu tem casco duro! No ar, toque em ▼ para dar um Pisão e quebrar a carapaça.',
        textKey: 'O tatu tem casco duro! No ar, aperte ↓ (ou S) para dar um Pisão e quebrar a carapaça.' }
    ];

    // Rapaduras: trilhas + arcos desenhando a parábola ideal antes de cada vão
    addLine(S, 220, 420, 3, 60);
    addLine(S, 500, 250, 3, 55);                       // rota alta (zabumba)
    addArc(S, 870, 460, 1090, 460, 6, 110);           // vão 900→1060
    addLine(S, 1600, 420, 3, 60);
    addLine(S, 1660, 190, 3, 50);                      // topo da escadaria opcional
    addArc(S, 1790, 460, 1950, 460, 5, 90);           // vão 1820→1920
    addLine(S, 2300, 420, 3, 50);
    addLine(S, 2600, 250, 3, 60);                      // rota alta
    addArc(S, 2790, 460, 3170, 420, 8, 150);          // vão térmico 2820→3140
    addLine(S, 2980, 360, 1, 0);
    addLine(S, 2980, 290, 1, 0);
    addLine(S, 2980, 220, 1, 0);
    addLine(S, 3320, 250, 3, 50);
    addArc(S, 3610, 420, 3830, 360, 6, 110);          // 3640→3800
    addArc(S, 4030, 360, 4230, 460, 6, 90);           // 4060→4200
    addLine(S, 4540, 210, 3, 55);
    addArc(S, 4890, 460, 5110, 460, 6, 110);          // 4920→5080
    addLine(S, 5160, 420, 4, 60);

    S.cajus = [
      { x: 1490, y: 270 },   // saliência do cacto (opcional)
      { x: 2980, y: 150 },   // topo da corrente térmica
      { x: 4700, y: 320 }    // bloco de madeira opcional
    ];
    S.asaBrancaStars = [{ x: 3930, y: 240 }];
    S.checkpoints = [{ x: 1960, y: 460 }, { x: 4260, y: 460 }];
    S.flagpolePos = { x: 5460, y: 220 };
    return S;
  }

  /* ------------------------------------------------------------------------
   * Gerador procedural (1-2 a 6-4 + Desafio Diário)
   * ---------------------------------------------------------------------- */
  function buildProcedural(S, cfg) {
    var R = cfg.rand, G = cfg.gen;
    var allowed = ALLOWED_ENEMIES[S.biome] || [];
    function okE(t) { return allowed.indexOf(t) >= 0; }
    var wIdx = cfg.worldIdx | 0;
    function okTier(t) { return !(TOUGH_FROM_WORLD[t] > wIdx); }
    var ground = (G.ground || []).filter(okE).filter(okTier);
    var flyer = (G.flyer || []).filter(okE).filter(okTier);
    if (!ground.length) ground = (G.ground || []).filter(okE).slice(0, 2);
    if (!flyer.length) flyer = (G.flyer || []).filter(okE).slice(0, 1);
    var BUD = enemyBudget(wIdx, cfg.stageIdx);
    if (S.isChallenge) BUD = { min: 10, max: 16 };
    var shooter = (G.shooter && okE(G.shooter)) ? G.shooter : null;
    var useBode = !!G.bode && okE('bode_doido');
    var themeA = G.themes[0], themeB = G.themes[1] || G.themes[0];
    var plats = S.platforms, mains = [], gaps = [];
    var bodePlats = [], highRouted = [];
    var x = 0, y = GROUND_Y;
    var endX = S.levelW - 900;

    function addMain(px, py, pw, extra) {
      var isFall = extra && extra.falling;
      var p = extend({ x: Math.round(px), y: Math.round(py), w: Math.round(pw),
        h: isFall ? 24 : LEVEL_H - Math.round(py), theme: themeA }, extra);
      plats.push(p); mains.push(p);
      return p;
    }
    // Desnível vertical sempre <= 100 px (limite de 105)
    function nextY(maxD) {
      maxD = Math.min(maxD || 90, 100);
      return clamp(y + R.int(-maxD, maxD), G.minY, G.maxY);
    }
    function gapTo(gap, ny, pw, extra, assist) {
      if (!assist) gap = Math.min(gap, 190);       // vão sem assistência <= 190
      else gap = Math.min(gap, 320);               // vão assistido <= 320
      if (Math.abs(ny - y) > 100) ny = y + (ny > y ? 100 : -100);
      ny = clamp(ny, G.minY, G.maxY);
      var nx = x + gap;
      gaps.push({ x0: x, y0: y, x1: nx, y1: ny, assist: assist || null });
      var p = addMain(nx, ny, pw, extra);
      x = p.x + p.w; y = p.y;
      return p;
    }
    function decorate(e, t) {
      if (t === 'tatu') e.armored = true;
      if (t === 'sapo_cururu') e.hopPower = 9;
      if (t === 'mula_sem_cabeca') e.chargeSpeed = 3.6;
      if (t === 'lobisomem') e.leap = true;
      if (G.elite && R.chance(0.3)) e.elite = true;
      return e;
    }
    // 2 a 3 inimigos terrestres bem espaçados (cada um com sua faixa de patrulha)
    function spawnGround(p, count) {
      if (!ground.length || p.w < 260 || p.falling) return;
      var n = count || (p.w >= 560 ? 3 : (p.w >= 340 ? 2 : 1));
      if (wIdx < 2) n = Math.min(n, 2);
      var x0 = p.x + 20, span = p.w - 40, slot = span / n;
      for (var i = 0; i < n; i++) {
        var t = R.pick(ground);
        var sMin = Math.round(x0 + slot * i), sMax = Math.round(x0 + slot * (i + 1));
        var e = { type: t, x: Math.round(sMin + slot * R.range(0.35, 0.7)), y: p.y - 32, dir: -1,
          patrol: { minX: sMin, maxX: sMax } };
        S.enemies.push(decorate(e, t));
      }
    }
    // 1 a 2 voadores
    function spawnFlyer(p, count) {
      if (!flyer.length) return;
      var n = count || (p.w >= 480 ? 2 : 1);
      for (var i = 0; i < n; i++) {
        var t = R.pick(flyer);
        var fx = Math.round(p.x + p.w * (n === 1 ? 0.5 : (0.3 + 0.4 * i)));
        var e = { type: t, x: fx, y: Math.max(70, p.y - 150 - i * 30), dir: -1,
          amp: 30, patrol: { minX: p.x, maxX: p.x + p.w } };
        S.enemies.push(decorate(e, t));
      }
    }
    function spawnLedgeEnemy(lg) {
      if (shooter && R.chance(0.55)) {
        S.enemies.push({ type: shooter, x: lg.x + Math.round(lg.w / 2), y: lg.y - 32, dir: -1,
          fireRate: 150, onLedge: true });
      } else if (ground.length) {
        var t = R.pick(ground);
        S.enemies.push(decorate({ type: t, x: lg.x + Math.round(lg.w / 2), y: lg.y - 32, dir: -1,
          onLedge: true, patrol: { minX: lg.x + 10, maxX: lg.x + lg.w - 10 } }, t));
      }
    }
    // Rota alta estilo Wonder/Rayman: zabumba → saliência média → saliência alta
    function addHighRoute(p) {
      if (p.w < 400 || p.falling) return false;
      var midY = p.y - 120, topY = Math.max(70, p.y - 230);
      var mid = { x: Math.round(p.x + p.w * 0.35), y: midY, w: 150, h: 20, theme: themeB,
        optional: true, oneWay: true };
      var top = { x: Math.round(p.x + p.w * 0.55), y: topY, w: 170, h: 20, theme: themeB,
        optional: true, oneWay: true };
      plats.push(mid, top);
      S.trampolines.push(tramp(mid.x - 70, p.y));
      addLine(S, top.x + 25, top.y - 40, 3, 55);
      if (R.chance(0.6)) spawnLedgeEnemy(top);
      highRouted.push(p);
      return true;
    }
    function addMover(g) {
      var my = Math.max(80, Math.min(g.y0, g.y1) - 140);
      S.movingPlatforms.push({ x: Math.round(g.x0 + (g.x1 - g.x0) / 2 - 60), y: my, w: 120, h: 22,
        axis: R.chance(0.5) ? 'x' : 'y', range: 90, speed: 0.025,
        phase: Math.round(R.range(0, 6.28) * 100) / 100, optional: true });
    }

    // Plataforma inicial
    addMain(0, GROUND_Y, 640);
    x = 640; y = GROUND_Y;

    var queue = (REQUIRED_SEGMENTS[S.biome] || []).slice();
    var seg = 0;
    while (x < endX - 300) {
      var type = (seg % 2 === 1 && queue.length) ? queue.shift() : R.weighted(G.weights);
      seg++;
      if (type === 'bode' && !useBode) type = 'run';
      var p, gap, ny, i, n;
      switch (type) {
        case 'updraft':
          gap = R.int(220, 300); ny = nextY(60);
          S.updrafts.push({ x: x + 20, y: 80, w: gap - 40, h: LEVEL_H - 80, strength: 0.6 });
          p = gapTo(gap, ny, R.int(380, 520), null, 'updraft');
          if (R.chance(0.5)) addMover(gaps[gaps.length - 1]);
          spawnGround(p, 2);
          spawnFlyer(p, 1);
          break;
        case 'vine':
          gap = R.int(230, 310); ny = nextY(60);
          S.vines.push({ x: Math.round(x + gap / 2), y: Math.max(40, Math.min(y, ny) - 210), length: 170 });
          p = gapTo(gap, ny, R.int(380, 520), null, 'vine');
          spawnGround(p, 2);
          spawnFlyer(p);
          break;
        case 'geyser':
          gap = R.int(230, 300); ny = nextY(60);
          S.geysers.push({ x: Math.round(x + gap / 2 - 35), y: 140, w: 70, h: LEVEL_H - 140,
            power: 15, period: 180, phase: R.int(0, 179) });
          p = gapTo(gap, ny, R.int(380, 520), null, 'geyser');
          if (R.chance(0.5)) addMover(gaps[gaps.length - 1]);
          spawnGround(p, 2);
          spawnFlyer(p, 1);
          break;
        case 'wind':
          var gx = x;
          gap = R.int(120, 180);
          p = gapTo(gap, nextY(70), R.int(420, 600));
          S.windZones.push({ x: gx, y: 60, w: (p.x + p.w) - gx, h: p.y - 60,
            fx: (R.chance(0.5) ? 1 : -1) * (G.windStrength || 0.3) });
          spawnGround(p, 2);
          spawnFlyer(p);
          break;
        case 'ledge':
          p = gapTo(R.int(110, 180), nextY(80), R.int(420, 560));
          var lg = { x: Math.round(p.x + p.w / 2 - 80), y: p.y - 95, w: 160, h: 20,
            theme: themeB, optional: true, oneWay: true };
          plats.push(lg);
          var hi = { x: lg.x + 120, y: Math.max(70, lg.y - 110), w: 150, h: 20,
            theme: themeB, optional: true, oneWay: true };
          plats.push(hi);
          S.trampolines.push(tramp(lg.x - 70, p.y));
          addLine(S, hi.x + 25, hi.y - 40, 3, 50);
          spawnLedgeEnemy(lg);
          spawnGround(p, 2);
          if (R.chance(0.5 + (G.flyerBias || 0))) spawnFlyer(p, 1);
          break;
        case 'stairs':
          var dirS = (y - 180 >= G.minY) ? -1 : 1;
          for (i = 0; i < 3; i++) {
            gapTo(R.int(80, 130), clamp(y + dirS * R.int(40, 70), G.minY, G.maxY), R.int(150, 210),
              { theme: themeB });
          }
          p = gapTo(R.int(100, 150), nextY(60), R.int(380, 500));
          spawnGround(p);
          spawnFlyer(p, 1);
          break;
        case 'falling':
          n = R.int(2, 4);
          for (i = 0; i < n; i++) {
            gapTo(R.int(100, 150), nextY(50), 120, { falling: true, theme: themeB });
          }
          p = gapTo(R.int(110, 150), nextY(50), R.int(380, 500));
          spawnGround(p, 2);
          spawnFlyer(p, 1);
          break;
        case 'tidePosts':
          n = R.int(3, 5);
          for (i = 0; i < n; i++) {
            gapTo(R.int(110, 160), nextY(50), R.int(110, 150), { theme: themeB, tidePost: true });
          }
          p = gapTo(R.int(110, 160), nextY(50), R.int(400, 520));
          spawnGround(p, 2);
          spawnFlyer(p);
          break;
        case 'bode':
          p = gapTo(R.int(110, 170), nextY(70), R.int(640, 720));
          var rock = { x: p.x + 60, y: p.y - PHYS.ROCK_H, w: PHYS.ROCK_W, h: PHYS.ROCK_H,
            theme: 'stone', isRock: true };
          plats.push(rock);
          var bx = rock.x + rock.w + R.int(240, 300);
          bx = Math.min(bx, p.x + p.w - 60);
          S.enemies.push({ type: 'bode_doido', x: bx, y: p.y - PHYS.BODE_Y_OFFSET, dir: -1,
            chargeSpeed: 4.5, stunFrames: 150, platformX: p.x, platformW: p.w, rockX: rock.x });
          bodePlats.push(p);
          // Pista do bode livre de terrestres: só um voador alto
          if (flyer.length) {
            var ft = R.pick(flyer);
            S.enemies.push(decorate({ type: ft, x: Math.round(p.x + p.w * 0.7), y: Math.max(70, p.y - 180),
              dir: -1, amp: 24, patrol: { minX: p.x + p.w * 0.5, maxX: p.x + p.w } }, ft));
          }
          break;
        default: // run
          p = gapTo(R.int(100, 170), nextY(), R.int(380, 620));
          if (!addHighRoute(p)) {
            if (p.w >= 380) S.hazardWheels.push(wheel(p.x + p.w / 2, p.y - 100, 70, 0.035));
          }
          spawnGround(p);
          spawnFlyer(p, R.chance(0.5 + (G.flyerBias || 0)) ? 2 : 1);
      }
    }

    // Plataforma final + bandeira
    var fin = gapTo(R.int(110, 150), nextY(60), 700);
    S.levelW = fin.x + fin.w;
    S.flagpolePos = { x: S.levelW - 260, y: fin.y - 240 };
    spawnGround({ x: fin.x, y: fin.y, w: 380 }, 1);

    // Rodas extras em plataformas largas sem rota alta (garante presença)
    var wideFree = mains.filter(function (m, k) {
      return k > 0 && m !== fin && !m.falling && m.w >= 400 &&
        highRouted.indexOf(m) < 0 && bodePlats.indexOf(m) < 0;
    });
    for (var wi = 0; S.hazardWheels.length < 2 && wi < wideFree.length; wi++) {
      var wm = wideFree[wi];
      var dup = S.hazardWheels.some(function (h) { return Math.abs(h.baseX - (wm.x + wm.w / 2)) < 60; });
      if (!dup) S.hazardWheels.push(wheel(wm.x + wm.w / 2, wm.y - 100, 70, 0.035));
    }

    // Garante ao menos 1 plataforma móvel em rota aérea opcional
    if (!S.movingPlatforms.length && gaps.length > 2) {
      var gBest = gaps.reduce(function (a, b) { return (b.x1 - b.x0) > (a.x1 - a.x0) ? b : a; });
      addMover(gBest);
    }

    // Controle de densidade: 18 a 28 inimigos por fase
    var padCandidates = mains.filter(function (m, k) { return k > 0 && !m.falling; });
    var pi = 0, guard = 0;
    while (S.enemies.length < BUD.min && padCandidates.length && flyer.length && guard++ < 200) {
      var pm = padCandidates[(pi * 3) % padCandidates.length]; pi++;
      var pt = R.pick(flyer);
      S.enemies.push(decorate({ type: pt, x: Math.round(pm.x + pm.w / 2), y: Math.max(70, pm.y - 170),
        dir: -1, amp: 30, patrol: { minX: pm.x, maxX: pm.x + pm.w } }, pt));
    }
    guard = 0;
    while (S.enemies.length > BUD.max && guard++ < 200) {
      var removed = false;
      for (var ri = S.enemies.length - 1; ri >= 0; ri -= 2) {
        var re = S.enemies[ri];
        if (re.type !== 'bode_doido' && !re.onLedge) {
          S.enemies.splice(ri, 1); removed = true;
          if (S.enemies.length <= BUD.max) break;
        }
      }
      if (!removed) break;
    }
    // Começo da fase livre de inimigos (o jogador precisa de alguns segundos para se situar)
    S.enemies = S.enemies.filter(function (e) { return e.x > 560; });
    S.enemies.sort(function (a, b) { return a.x - b.x; });

    // Rapaduras: arcos sobre cada vão + trilhas em plataformas largas
    gaps.forEach(function (g) {
      var span = g.x1 - g.x0;
      addArc(S, g.x0 - 30, g.y0, g.x1 + 30, g.y1, span > 200 ? 7 : 5, span > 200 ? 130 : 100);
    });
    mains.forEach(function (m, k) {
      if (k > 0 && m.w >= 420 && !m.falling) addLine(S, m.x + 80, m.y - 40, 3, 50);
    });
    S.movingPlatforms.forEach(function (mp) { addLine(S, mp.x + 30, mp.y - 40, 2, 60); });

    // Cajus, estrela e checkpoints (somente plataformas sólidas)
    var solid = mains.filter(function (m, k) {
      return k > 0 && m !== fin && !m.falling && m.w >= 110;
    });
    if (!solid.length) solid = [mains[0]];
    function at(f) { return solid[clamp(Math.floor(f * solid.length), 0, solid.length - 1)]; }
    [0.25, 0.55, 0.85].forEach(function (f, i) {
      var m = at(f);
      S.cajus.push({ x: Math.round(m.x + m.w / 2 + (i - 1) * 12), y: m.y - 110, index: i });
    });
    var sm = at(0.42);
    S.asaBrancaStars.push({ x: Math.round(sm.x + sm.w / 2 + 30), y: sm.y - 135 });
    [1 / 3, 2 / 3].forEach(function (f) {
      var m = at(f);
      S.checkpoints.push({ x: m.x + 30, y: m.y });
    });

    // Mecânicas de ambiente
    S.darkness = !!G.darkness;
    S.fog = !!G.fog;
    if (G.crystals || G.darkness) {
      var spacing = G.crystalSpacing || 420, lastX = -9999;
      mains.forEach(function (m) {
        if (m.x - lastX >= spacing) {
          S.lightCrystals.push({ x: Math.round(m.x + m.w / 2), y: m.y - 70, radius: 200 });
          lastX = m.x;
        }
      });
    }
    if (G.tide) {
      S.tideConfig = { baseY: 500, amp: G.tideAmp || 36, period: 720, damage: 1 };
    }
    return S;
  }

  var ALLOWED_ENEMIES = {
    sertao:  ['calango', 'tatu', 'cacto_atirador', 'bode_doido', 'carcara',
              'sapo_cururu', 'marimbondo', 'jararaca', 'cangaceiro_sombra', 'mula_sem_cabeca',
              'boitata_fogo', 'lobisomem'],
    caverna: ['morcego', 'tatu', 'cacto_atirador', 'fulozinha',
              'sapo_cururu', 'marimbondo', 'jararaca', 'cangaceiro_sombra', 'mula_sem_cabeca',
              'boitata_fogo', 'lobisomem'],
    pantano: ['carcara', 'fulozinha', 'papa_figo', 'calango',
              'sapo_cururu', 'marimbondo', 'jararaca', 'cangaceiro_sombra', 'mula_sem_cabeca',
              'boitata_fogo', 'lobisomem'],
    mangue:  ['caranguejo', 'baiacu', 'carcara',
              'sapo_cururu', 'marimbondo', 'jararaca', 'cangaceiro_sombra', 'mula_sem_cabeca',
              'boitata_fogo', 'lobisomem'],
    canion:  ['salamandra', 'bode_doido', 'carcara', 'tatu',
              'sapo_cururu', 'marimbondo', 'jararaca', 'cangaceiro_sombra', 'mula_sem_cabeca',
              'boitata_fogo', 'lobisomem'],
    trono:   ['calango', 'tatu', 'caranguejo', 'salamandra', 'papa_figo', 'morcego',
              'carcara', 'fulozinha', 'baiacu', 'cacto_atirador', 'bode_doido',
              'sapo_cururu', 'marimbondo', 'jararaca', 'cangaceiro_sombra', 'mula_sem_cabeca',
              'boitata_fogo', 'lobisomem']
  };

  var REQUIRED_SEGMENTS = {
    sertao:  ['bode', 'updraft', 'ledge'],
    caverna: ['updraft', 'ledge'],
    pantano: ['vine', 'wind', 'vine'],
    mangue:  ['tidePosts', 'updraft'],
    canion:  ['geyser', 'falling', 'bode'],
    trono:   ['updraft', 'vine', 'geyser', 'falling', 'bode', 'wind', 'ledge']
  };

  /* ------------------------------------------------------------------------
   * Arena de Chefe
   * ---------------------------------------------------------------------- */
  function buildBossArena(S, w) {
    var W = WORLDS[w];
    var info = BOSS_INFO[W.bossType];
    S.levelW = 1400;
    S.isBoss = true;
    S.platforms = [
      { x: 0, y: 460, w: 1400, h: 80, theme: 'stone' },
      { x: 0, y: 0, w: 40, h: 540, theme: 'stone', isWall: true },
      { x: 1360, y: 0, w: 40, h: 540, theme: 'stone', isWall: true },
      { x: 260, y: 350, w: 200, h: 20, theme: 'stone', oneWay: true },
      { x: 600, y: 260, w: 200, h: 20, theme: 'stone', oneWay: true },
      { x: 940, y: 350, w: 200, h: 20, theme: 'stone', oneWay: true }
    ];
    S.bossType = W.bossType;
    S.boss = extend({ type: W.bossType, x: 1100, y: 460 - info.h }, clone(info));
    S.bossArena = { minX: 40, maxX: 1360, floorY: 460 };
    S.respawnX = 120; S.respawnY = 400;
    S.flagpolePos = { x: 1260, y: 260 };
    S.flagHiddenUntilBoss = true;
    S.checkpoints = [];
    addLine(S, 300, 310, 3, 60);
    addLine(S, 640, 220, 3, 60);
    addLine(S, 980, 310, 3, 60);
    return S;
  }

  /* ------------------------------------------------------------------------
   * API pública
   * ---------------------------------------------------------------------- */
  function mergeGen(biome, code) {
    var g = clone(WORLD_GEN[biome]);
    var tw = STAGE_TWEAKS[code];
    if (tw) {
      for (var k in tw) {
        if (k === 'weights') extend(g.weights, tw.weights);
        else g[k] = tw[k];
      }
    }
    return g;
  }

  function addMechanicSign(S) {
    var ms = MECHANIC_SIGNS[S.biome];
    if (ms) S.signs.push(extend({ x: 200, y: GROUND_Y }, clone(ms)));
  }

  function finalizeSpec(S) {
    if (S && S.flagpolePos) { S.flag = S.flagpolePos; S.flagX = S.flagpolePos.x; }
    return S;
  }

  function getLevelSpec(idx) {
    idx = clamp(Math.floor(Number(idx) || 0), 0, TOTAL_LEVELS - 1);
    if (idx === 0) return finalizeSpec(buildLevel1_1());
    var w = Math.floor(idx / 5), s = idx % 5;
    var W = WORLDS[w], st = W.stages[s];
    var S = emptySpec({
      idx: idx, worldIdx: w, stageIdx: s, code: st.code, name: st.name,
      worldName: W.name, biome: W.biome, music: W.music, mechanic: W.mechanic,
      levelW: 5200 + s * 300
    });
    if (s === 4) return finalizeSpec(buildBossArena(S, w));
    var gen = mergeGen(W.biome, st.code);
    if (s === 0) addMechanicSign(S);
    return finalizeSpec(buildProcedural(S, {
      rand: makeRand(hashSeed('oxe-level-' + st.code)),
      gen: gen, worldIdx: w, stageIdx: s, code: st.code
    }));
  }

  function getDailySeedString(date) {
    var d = date || new Date();
    return 'OXE-' + d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate());
  }

  function getChallengeSpec(seedStr) {
    seedStr = String(seedStr == null ? getDailySeedString() : seedStr);
    var R = wrapRand(mulberry32(hashSeed(seedStr)));
    var w = R.int(0, 5), s = R.int(0, 3);
    var W = WORLDS[w];
    var S = emptySpec({
      idx: -1, worldIdx: w, stageIdx: s, code: 'DESAFIO', name: 'Desafio Diário · ' + seedStr,
      worldName: W.name, biome: W.biome, music: W.music, mechanic: W.mechanic,
      levelW: 3200, isChallenge: true, seed: seedStr, timeLimit: 30
    });
    var gen = mergeGen(W.biome, W.stages[s].code);
    return finalizeSpec(buildProcedural(S, { rand: R, gen: gen, worldIdx: w, stageIdx: s, code: 'DESAFIO' }));
  }

  var OxeLevels = {
    WORLDS: WORLDS,
    WORLD_GEN: WORLD_GEN,
    ALLOWED_ENEMIES: ALLOWED_ENEMIES,
    ENEMY_SPECIES: ENEMY_SPECIES,
    NEW_SPECIES: NEW_SPECIES,
    PHYS: PHYS,
    TOTAL_LEVELS: TOTAL_LEVELS,
    mulberry32: mulberry32,
    hashSeed: hashSeed,
    getDailySeedString: getDailySeedString,
    getLevelSpec: getLevelSpec,
    getChallengeSpec: getChallengeSpec
  };

  if (typeof window !== 'undefined') window.OxeLevels = OxeLevels;
  if (typeof module !== 'undefined' && module.exports) module.exports = OxeLevels;
})();
