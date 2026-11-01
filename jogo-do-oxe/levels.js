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
    // v2.5: começo bem mais leve e subida progressiva (1-2: 7 · 2-1: 10 · 4-1: 15 · 6-4: 22)
    var min = w === 0 ? 6 + s : 8 + w * 2 + s;
    return { min: min, max: min + (w === 0 ? 3 : 4 + (w >> 1)) };
  }
  // Espécies mais brabas só aparecem a partir de certo mundo
  var TOUGH_FROM_WORLD = { cangaceiro_sombra: 1, mula_sem_cabeca: 2, boitata_fogo: 1, lobisomem: 3, onca_pintada: 2, cumacanga: 2, alamoa: 2, cascavel: 1, teju: 1, lacraia: 1 }; // v3.2: bichos brabos aparecem mais cedo

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
    'mula_sem_cabeca', 'boitata_fogo', 'lobisomem',
    // v3.0: 12 espécies novas do Nordeste
    'prea', 'cascavel', 'caititu', 'lacraia', 'onca_pintada', 'rola_bosta', 'teju',
    'ararinha_azul', 'rasga_mortalha', 'alamoa', 'cumacanga', 'muricoca'
  ];
  var V3_SPECIES = ['prea', 'cascavel', 'caititu', 'lacraia', 'onca_pintada', 'rola_bosta', 'teju',
    'ararinha_azul', 'rasga_mortalha', 'alamoa', 'cumacanga', 'muricoca'];
  var NEW_SPECIES = ['sapo_cururu', 'marimbondo', 'jararaca', 'cangaceiro_sombra',
    'mula_sem_cabeca', 'boitata_fogo', 'lobisomem'];

  /* ------------------------------------------------------------------------
   * Mundos e Fases (A1)
   * ---------------------------------------------------------------------- */
  // v3.0: 7 fases por mundo (6 normais + chefe)
  var SPW = 7, BOSS_STAGE = SPW - 1;
  function stages(list, worldIdx) {
    return list.map(function (name, s) {
      return {
        idx: worldIdx * SPW + s,
        code: (worldIdx === 7 ? '★' : (worldIdx + 1)) + '-' + (s + 1),
        name: name,
        isBoss: s === BOSS_STAGE
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
        'O Labirinto da Rapadura', 'Tronco Oco do Juazeiro', 'Carroça da Feira', '👑 O Touro de Fogo Ancestral'], 0)
    },
    {
      id: 2, idx: 1, name: 'Cavernas da Serra da Capivara', biome: 'caverna', music: 'caverna',
      mechanic: 'darkness', bossType: 'fulozinha',
      enemies: ['morcego', 'tatu', 'cacto_atirador', 'fulozinha',
        'sapo_cururu', 'marimbondo', 'jararaca', 'cangaceiro_sombra', 'mula_sem_cabeca',
        'boitata_fogo', 'lobisomem'],
      stages: stages(['Pinturas Rupestres', 'Gruta dos Vagalumes', 'Abismo de Quartzo',
        'Minas da Serra da Capivara', 'Toca da Lacraia', 'Corujas da Pedra Furada', '👑 Comadre Fulozinha'], 1)
    },
    {
      id: 3, idx: 2, name: 'Pântano e Mata de Caroá', biome: 'pantano', music: 'forro',
      mechanic: 'vines', bossType: 'papa_figo',
      enemies: ['carcara', 'fulozinha', 'papa_figo', 'calango',
        'sapo_cururu', 'marimbondo', 'jararaca', 'cangaceiro_sombra', 'mula_sem_cabeca',
        'boitata_fogo', 'lobisomem'],
      stages: stages(['Cipós da Caatinga', 'Vento do Agreste', 'Assovios na Neblina',
        'A Grande Corrida de Jegue', 'Lagoa do Buriti', 'Varadouro dos Caititus', '👑 O Papa-Figo'], 2)
    },
    {
      id: 4, idx: 3, name: 'Litoral e Manguezal', biome: 'mangue', music: 'coco',
      mechanic: 'tide', bossType: 'serpente',
      enemies: ['caranguejo', 'baiacu', 'carcara',
        'sapo_cururu', 'marimbondo', 'jararaca', 'cangaceiro_sombra', 'mula_sem_cabeca',
        'boitata_fogo', 'lobisomem'],
      stages: stages(['Praia dos Jangadeiros', 'Raízes do Mangue', 'Maré de Quarto Crescente',
        'Terreiro da Ilha do Mangue', 'Farol da Alamoa', 'Jangada ao Luar', '👑 Serpente da Maré'], 3)
    },
    {
      id: 5, idx: 4, name: 'Cânion dos Nove Sóis', biome: 'canion', music: 'maracatu',
      mechanic: 'geysers', bossType: 'guardiao',
      enemies: ['salamandra', 'bode_doido', 'carcara', 'tatu',
        'sapo_cururu', 'marimbondo', 'jararaca', 'cangaceiro_sombra', 'mula_sem_cabeca',
        'boitata_fogo', 'lobisomem'],
      stages: stages(['Fendas de Vapor', 'Pontes de Pedra-Pomes', 'Caldeira do Boqueirão',
        'O Voo do Carcará', 'Arenito da Onça', 'Fogo da Cumacanga', '👑 Guardião de Brasa'], 4)
    },
    {
      id: 6, idx: 5, name: 'O Trono da Seca', biome: 'trono', music: 'frevo',
      mechanic: 'all', bossType: 'sombra',
      enemies: ['calango', 'tatu', 'caranguejo', 'salamandra', 'papa_figo', 'morcego',
        'carcara', 'fulozinha', 'baiacu', 'cacto_atirador', 'bode_doido',
        'sapo_cururu', 'marimbondo', 'jararaca', 'cangaceiro_sombra', 'mula_sem_cabeca',
        'boitata_fogo', 'lobisomem'],
      stages: stages(['Portais da Miragem', 'Torre dos Ventos', 'Corredor dos Eclipses',
        'Desafio da Fortaleza Sombria', 'Ponte dos Mil Espinhos', 'Último Sol do Sertão', '👑 A Sombra da Seca'], 5)
    },
    {
      id: 7, idx: 6, name: 'A Caatinga dos Espinhos', biome: 'caatinga', music: 'xote', diff: 6,
      mechanic: 'thorns', bossType: 'corpo_seco',
      enemies: ['prea', 'cascavel', 'caititu', 'teju', 'onca_pintada', 'rola_bosta', 'lacraia', 'ararinha_azul', 'rasga_mortalha', 'cumacanga'],
      stages: stages(['Xique-Xique e Facheiro', 'O Tronco Oco', 'Carroça na Vereda', 'O Ringue da Feira de Caruaru',
        'Açude Seco', 'Umbuzeiro Assombrado', '👑 O Corpo-Seco'], 6)
    },
    {
      id: 8, idx: 7, name: 'Mundo Especial: Noite de São João', biome: 'saojoao', music: 'forro', diff: 3, special: true,
      mechanic: 'fogueiras', bossType: 'boi_encantado',
      enemies: ['prea', 'caititu', 'rola_bosta', 'sapo_cururu', 'rasga_mortalha', 'cumacanga', 'alamoa', 'muricoca', 'boitata_fogo'],
      stages: stages(['Arraiá do Tonho', 'Balões no Céu', 'Quadrilha Maluca', 'Terreiro da Noite de São João',
        'Correio Elegante', 'Forró até o Sol Raiar', '👑 O Boi Encantado'], 7)
    }
  ];

  var TOTAL_LEVELS = WORLDS.length * SPW;
  // v3.7: fases com Amigos (Zefinha, Menino Cabeça de Vento, Galinha Melindrosa, Bode Toddy, Mestre Seu Lunga e Tatu-Bola). Mais difíceis (+50% bichos e obstáculos)!
  // v4.2: Proporção equilibrada de duplas — 1 fase especial por mundo (e 2 no mundo bônus)
  var DUO_STAGES = {
    '1-3': 'zefinha',
    '2-5': 'cabeca_vento',
    '3-2': 'galinha',
    '4-5': 'bode_toddy',
    '5-3': 'seu_lunga',
    '6-5': 'tatu_bola',
    '7-3': 'zefinha',
    '★-3': 'cabeca_vento',
    '★-6': 'bode_toddy'
  };
  var SPECIAL_MODE_STAGES = {
    '1-4': 'pacman',
    '2-4': 'minecraft',
    '3-4': 'kart',
    '4-4': 'brawlstars',
    '5-4': 'shmup',
    '6-4': 'brawlstars',
    '7-4': 'beatemup',
    '★-4': 'brawlstars'
  };

  var BOSS_INFO = {
    bull:      { name: 'Touro de Fogo Ancestral', hp: 8,  phases: 2, w: 120, h: 96 },
    fulozinha: { name: 'Comadre Fulozinha',       hp: 10, phases: 2, w: 64,  h: 96 },
    papa_figo: { name: 'O Papa-Figo',             hp: 12, phases: 2, w: 80,  h: 112 },
    serpente:  { name: 'Serpente da Maré',        hp: 14, phases: 3, w: 160, h: 96 },
    guardiao:  { name: 'Guardião de Brasa',       hp: 16, phases: 3, w: 112, h: 128 },
    sombra:    { name: 'A Sombra da Seca',        hp: 20, phases: 3, w: 128, h: 144 },
    corpo_seco:    { name: 'O Corpo-Seco',        hp: 9, phases: 3, w: 80, h: 120 },
    boi_encantado: { name: 'O Boi Encantado',     hp: 8, phases: 2, w: 120, h: 96 }
  };

  /* ------------------------------------------------------------------------
   * Configuração de geração por bioma (B12: inimigos por bioma)
   * ---------------------------------------------------------------------- */
  var WORLD_GEN = {
    sertao: {
      weights: { run: 4, updraft: 2, ledge: 2, bode: 1.2, stairs: 1, log: 1, cart: 0.7, thorns: 0.6 },
      ground: ['calango', 'tatu', 'sapo_cururu', 'jararaca', 'escorpiao', 'prea', 'rola_bosta', 'teju', 'cascavel', 'cangaceiro_sombra', 'mula_sem_cabeca', 'lobisomem'],
      flyer: ['carcara', 'marimbondo', 'urubu', 'ararinha_azul', 'muricoca', 'boitata_fogo'],
      shooter: 'cacto_atirador', bode: true,
      themes: ['soil', 'stone'], minY: 300, maxY: 460, windStrength: 0.3
    },
    caverna: {
      weights: { run: 4, ledge: 2, stairs: 2, updraft: 1, falling: 0.6 },
      ground: ['tatu', 'sapo_cururu', 'jararaca', 'escorpiao', 'lacraia', 'cascavel', 'cangaceiro_sombra', 'mula_sem_cabeca', 'lobisomem'],
      flyer: ['morcego', 'fulozinha', 'marimbondo', 'rasga_mortalha', 'muricoca', 'boitata_fogo'],
      shooter: 'cacto_atirador', bode: false,
      themes: ['cave', 'crystal'], minY: 300, maxY: 460, darkness: true, crystals: true, windStrength: 0.3
    },
    pantano: {
      weights: { run: 3, vine: 3, wind: 2, ledge: 1, log: 1.2 },
      ground: ['calango', 'papa_figo', 'sapo_cururu', 'jararaca', 'caititu', 'teju', 'lacraia', 'cangaceiro_sombra', 'mula_sem_cabeca', 'lobisomem'],
      flyer: ['carcara', 'fulozinha', 'marimbondo', 'muricoca', 'rasga_mortalha', 'cumacanga', 'boitata_fogo'],
      shooter: null, bode: false,
      themes: ['moss', 'wood'], minY: 300, maxY: 460, windStrength: 0.3
    },
    mangue: {
      weights: { run: 2, tidePosts: 3, updraft: 1, ledge: 1, vine: 1 },
      ground: ['caranguejo', 'jacare', 'sapo_cururu', 'jararaca', 'teju', 'caititu', 'cangaceiro_sombra', 'mula_sem_cabeca', 'lobisomem'],
      flyer: ['carcara', 'baiacu', 'urubu', 'marimbondo', 'alamoa', 'muricoca', 'boitata_fogo'],
      shooter: null, bode: false,
      themes: ['sand', 'root'], minY: 300, maxY: 420, tide: true, windStrength: 0.3
    },
    canion: {
      weights: { run: 2, geyser: 3, falling: 2, bode: 1, ledge: 1, updraft: 1 },
      ground: ['salamandra', 'tatu', 'escorpiao', 'sapo_cururu', 'jararaca', 'onca_pintada', 'lacraia', 'cascavel', 'cangaceiro_sombra', 'mula_sem_cabeca', 'lobisomem'],
      flyer: ['carcara', 'urubu', 'marimbondo', 'cumacanga', 'boitata_fogo'],
      shooter: null, bode: true,
      themes: ['basalt', 'pumice'], minY: 300, maxY: 460, windStrength: 0.3
    },
    trono: {
      weights: { run: 2, updraft: 1, vine: 1, geyser: 1, falling: 1, bode: 1, wind: 1, ledge: 1, stairs: 1 },
      ground: ['calango', 'tatu', 'caranguejo', 'salamandra', 'papa_figo', 'escorpiao', 'jacare', 'onca_pintada', 'caititu', 'teju', 'lacraia', 'cascavel',
        'sapo_cururu', 'jararaca', 'cangaceiro_sombra', 'mula_sem_cabeca', 'lobisomem'],
      flyer: ['morcego', 'carcara', 'fulozinha', 'baiacu', 'urubu', 'marimbondo', 'rasga_mortalha', 'cumacanga', 'alamoa', 'boitata_fogo'],
      shooter: 'cacto_atirador', bode: true,
      themes: ['obsidian', 'gold'], minY: 300, maxY: 460, elite: true, crystals: true, windStrength: 0.35
    },
    // v3.0: Mundo 7 — semiárido com espinhos, troncos ocos e carroças
    caatinga: {
      weights: { run: 2, thorns: 3, log: 2, cart: 2, ledge: 1, bode: 1, updraft: 1 },
      ground: ['prea', 'cascavel', 'caititu', 'teju', 'onca_pintada', 'rola_bosta', 'lacraia', 'tatu', 'jararaca', 'escorpiao', 'mula_sem_cabeca'],
      flyer: ['ararinha_azul', 'carcara', 'urubu', 'rasga_mortalha', 'cumacanga', 'marimbondo'],
      shooter: 'cacto_atirador', bode: true,
      themes: ['dry', 'stone'], minY: 300, maxY: 460, windStrength: 0.35
    },
    // v3.0: Mundo especial — Noite de São João
    saojoao: {
      weights: { run: 3, balloon: 3, fogueira: 2, ledge: 1, log: 1, cart: 1, updraft: 1 },
      ground: ['prea', 'caititu', 'rola_bosta', 'sapo_cururu', 'calango', 'teju', 'mula_sem_cabeca'],
      flyer: ['rasga_mortalha', 'cumacanga', 'alamoa', 'muricoca', 'boitata_fogo'],
      shooter: null, bode: false,
      themes: ['festa', 'wood'], minY: 300, maxY: 460, windStrength: 0.3
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
    caatinga: {
      title: 'Caatinga dos Espinhos', icon: '🌵',
      textTouch: 'Espinhos de xique-xique machucam! Passe por dentro dos troncos ocos e suba na carroça para atravessar os espinhais.',
      textKey: 'Espinhos de xique-xique machucam! Passe por dentro dos troncos ocos e suba na carroça para atravessar os espinhais.'
    },
    saojoao: {
      title: 'Noite de São João!', icon: '🔥',
      textTouch: 'Pule nos balões para subir e cuidado com as labaredas das fogueiras: espere a chama baixar!',
      textKey: 'Pule nos balões para subir e cuidado com as labaredas das fogueiras: espere a chama baixar!'
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
      trampolines: [], movingPlatforms: [], hazardWheels: [], items: [],
      hazards: [], logs: [], fires: [], diffIdx: 0,
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
    return { x: Math.round(x), y: Math.round(y), r: 26, baseX: Math.round(x), baseY: Math.round(y),
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

      // Bode Doido: corre ~244 px até bater na rocha (2236 → 2480)
      { type: 'bode_doido', x: 2480, y: 428, dir: -1, chargeSpeed: 4.5, stunFrames: 150,
        platformX: 1920, platformW: 900, rockX: 2200 },

      { type: 'sapo_cururu', x: 3260, y: 388, dir: -1, hopPower: 9, patrol: { minX: 3160, maxX: 3420 } },

      { type: 'marimbondo', x: 4460, y: 320, dir: -1, amp: 26, patrol: { minX: 4380, maxX: 4560 } },
      { type: 'tatu', x: 4520, y: 428, dir: -1, armored: true, patrol: { minX: 4400, maxX: 4880 } },
      { type: 'calango', x: 4820, y: 428, dir: -1, patrol: { minX: 4720, maxX: 4900 } },

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
      { x: 1560, y: 460, title: 'Armas', icon: '🪨',
        textTouch: 'Pegou a baleadeira? Toque nos ícones lá em cima para escolher a arma e use o botão de ataque.',
        textKey: 'Pegou a baleadeira? Clique nos ícones lá em cima (ou Q / E, 1 a 5) para escolher a arma e ataque com J / X.' },
      { x: 2040, y: 460, title: 'Espere o Bode Doido!', icon: '🐐',
        textTouch: 'Fique atrás da rocha. O bode investe, bate a cabeça e fica tonto: aí é a sua vez!',
        textKey: 'Fique atrás da rocha. O bode investe, bate a cabeça e fica tonto: aí é a sua vez!' },
      { x: 2700, y: 460, title: 'Planar na Corrente Térmica', icon: '🪂',
        textTouch: 'Pule e SEGURE o botão PULAR no ar para planar com o chapéu. O vento quente leva você para o alto!',
        textKey: 'Pule e SEGURE ESPAÇO no ar para planar com o chapéu. O vento quente leva você para o alto!' },
      { x: 4300, y: 460, title: 'Tatu Enrolado', icon: '🛡️',
        textTouch: 'Enrolado, o tatu tem casco duro! Espere ele desenrolar e pule na cabeça ou dê uma chicotada.',
        textKey: 'Enrolado, o tatu tem casco duro! Espere ele desenrolar e pule na cabeça ou dê uma chicotada.' }
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
    S.items = [
      { type: 'baleadeira', x: 1290, y: 350 },
      { type: 'jegue', x: 1700, y: 416 },
      { type: 'peixeira', x: 2450, y: 350 },
      { type: 'cuscuz', x: 3360, y: 240 },
      { type: 'bode_toddy_mount', x: 4380, y: 416 },
      { type: 'reliquia_uniao', x: 5180, y: 390 }
    ];
    S.checkpoints = [{ x: 1960, y: 460 }, { x: 4260, y: 460 }];
    S.flagpolePos = { x: 5460, y: 220 };
    return S;
  }

  /* ------------------------------------------------------------------------
   * Gerador procedural (1-2 a 6-4 + Desafio Diário)
   * ---------------------------------------------------------------------- */
  function buildProcedural(S, cfg) {
    var R = cfg.rand, G = cfg.gen;
    var allowed = (ALLOWED_ENEMIES[S.biome] || []).concat(G.ground || [], G.flyer || []);
    function okE(t) { return allowed.indexOf(t) >= 0; }
    var wIdx = cfg.worldIdx | 0; // v3.0: índice de dificuldade (o mundo especial usa dificuldade média)
    var stIdx = cfg.stageIdx | 0;
    function okTier(t) { return !(TOUGH_FROM_WORLD[t] > wIdx); }
    var ground = (G.ground || []).filter(okE).filter(okTier);
    // v3.2: variedade — os bichos vão se revezando em vez de repetir sempre os mesmos
    var gRot = 0, fRot = 0;
    function nextGround() { var t = ground[(gRot++ + Math.floor(R.next() * 2)) % ground.length]; return t; }
    function nextFlyer() { return flyer[(fRot++ + Math.floor(R.next() * 2)) % flyer.length]; }
    var flyer = (G.flyer || []).filter(okE).filter(okTier);
    if (!ground.length) ground = (G.ground || []).filter(okE).slice(0, 2);
    if (!flyer.length) flyer = (G.flyer || []).filter(okE).slice(0, 1);
    var BUD = enemyBudget(wIdx, cfg.stageIdx);
    if (!S.isChallenge) BUD = { min: Math.round(BUD.min * 1.5), max: Math.round(BUD.max * 1.5) }; // fases maiores, mais bichos
    if (S.isChallenge) BUD = { min: 10, max: 16 };
    // v3.3: 12% a 20% menos bichos por fase (mais leve no começo, a subida continua)
    var EZ = 1 - Math.min(0.20, 0.12 + 0.012 * Math.max(0, wIdx | 0));
    BUD = { min: Math.max(3, Math.round(BUD.min * EZ)), max: Math.max(4, Math.round(BUD.max * EZ)) };
    // v4.1: com dois personagens (dupla sertaneja), a fase tem +70% de inimigos e perigos redobrados
    if (S.duo) BUD = { min: Math.round(BUD.min * 1.7), max: Math.round(BUD.max * 1.7) + 3 };
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
      if (wIdx < 2) n = Math.min(n, wIdx === 0 ? 1 : 2);
      var x0 = p.x + 20, span = p.w - 40, slot = span / n;
      for (var i = 0; i < n; i++) {
        var t = nextGround();
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
        var t = nextFlyer();
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
        var t = nextGround();
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
        // ---------- v3.0: segmentos novos ----------
        case 'thorns': // faixas de xique-xique no chão (pule por cima)
          if (S.biome === 'sertao' && stIdx < 4) { p = gapTo(R.int(100, 170), nextY(), R.int(380, 560)); spawnGround(p); break; }
          p = gapTo(R.int(110, 160), nextY(70), R.int(540, 660));
          n = p.w > 600 ? 2 : 1;
          for (i = 0; i < n; i++) {
            var tw = R.int(64, 92), tx = Math.round(p.x + p.w * (n === 1 ? 0.5 : (0.3 + 0.42 * i)) - tw / 2);
            S.hazards.push({ x: tx, y: p.y - 14, w: tw, h: 14, kind: 'espinho' });
            addArc(S, tx - 40, p.y, tx + tw + 40, p.y, 4, 90);
          }
          spawnGround(p, 1);
          if (R.chance(0.6)) spawnFlyer(p, 1);
          break;
        case 'log': // tronco oco: passa por dentro ou por cima (altura ampliada proporcional aos personagens)
          p = gapTo(R.int(110, 170), nextY(70), R.int(500, 620));
          var lw = R.int(220, 270), lx = Math.round(p.x + p.w * 0.45 - lw / 2);
          S.logs.push({ x: lx, y: p.y - 78, w: lw, h: 78 });
          plats.push({ x: lx, y: p.y - 82, w: lw, h: 16, theme: 'log', oneWay: true, optional: true, isLogTop: true });
          addLine(S, lx + 30, p.y - 30, Math.max(3, Math.floor((lw - 40) / 45)), 45);
          spawnGround({ x: p.x, y: p.y, w: Math.max(260, lx - p.x) }, 1);
          if (ground.length && R.chance(0.5)) { var lt = R.pick(ground); S.enemies.push(decorate({ type: lt, x: lx + Math.round(lw / 2), y: p.y - 32, dir: -1, patrol: { minX: lx + 10, maxX: lx + lw - 10 } }, lt)); }
          spawnFlyer(p, 1);
          break;
        case 'cart': // espinhal largo: só passa de carroça
          if (S.biome === 'sertao' && stIdx < 3) { p = gapTo(R.int(100, 170), nextY(), R.int(380, 560)); spawnGround(p); break; }
          var fw = R.int(620, 720);
          var field = gapTo(6, y, fw, { theme: themeA, thornField: true });
          S.hazards.push({ x: field.x, y: field.y - 16, w: field.w, h: 16, kind: 'espinho' });
          S.movingPlatforms.push({ x: Math.round(field.x + field.w / 2 - 70), y: field.y - 46, w: 140, h: 22, axis: 'x',
            range: Math.round(field.w / 2 - 40), speed: 0.011, phase: -1.5708, style: 'carroca' });
          addLine(S, field.x + 80, field.y - 120, Math.floor((field.w - 120) / 70), 70);
          p = gapTo(6, y, R.int(420, 540));
          spawnGround(p, 1);
          if (R.chance(0.5)) spawnFlyer(field, 1);
          break;
        case 'balloon': // balões de São João sobem e descem sobre o vão
          gap = R.int(250, 310); ny = nextY(60);
          var by0 = Math.min(y, ny);
          S.movingPlatforms.push({ x: Math.round(x + gap / 2 - 50), y: by0 - 70, w: 100, h: 20, axis: 'y', range: 100,
            speed: 0.02, phase: Math.round(R.range(0, 6.28) * 100) / 100, style: 'balao' });
          p = gapTo(gap, ny, R.int(400, 540), null, 'balloon');
          spawnGround(p, 2);
          spawnFlyer(p, 1);
          break;
        case 'fogueira': // fogueira com labareda que sobe e desce
          p = gapTo(R.int(110, 170), nextY(70), R.int(480, 620));
          S.fires.push({ x: Math.round(p.x + p.w * 0.5 - 26), y: p.y, w: 52, period: 170, phase: R.int(0, 169) });
          addArc(S, p.x + p.w * 0.5 - 90, p.y, p.x + p.w * 0.5 + 90, p.y, 5, 120);
          spawnGround({ x: p.x + p.w * 0.6, y: p.y, w: p.w * 0.4 }, 1);
          spawnFlyer(p, 1);
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
    // v2.4: LENDAS do Nordeste no fim de algumas fases (o mastro só libera depois de vencê-las)
    var LEGENDS_BY_STAGE = { '1-3': 'caipora', '1-6': 'cabra_cabriola', '2-3': 'cabra_cabriola', '2-6': 'caipora', '3-3': 'perna_cabeluda', '3-6': 'cabra_cabriola',
      '4-3': 'cabeca_de_cuia', '4-6': 'perna_cabeluda', '5-3': 'labatut', '5-6': 'perna_cabeluda', '6-2': 'caipora', '6-3': 'cabeca_de_cuia', '6-4': 'labatut', '6-6': 'quibungo',
      '7-3': 'quibungo', '7-6': 'labatut', '★-3': 'caipora', '★-6': 'quibungo' };
    var lg = !S.isChallenge && LEGENDS_BY_STAGE[cfg.code];
    if (lg) {
      S.enemies = S.enemies.filter(function (e) { return e.x < fin.x - 40; });
      S.enemies.push({ type: lg, x: fin.x + 260, y: fin.y - 110, dir: -1, legend: true });
    }
    // v2.4: itens nas fases (arma + proteção/cura)
    var itemPlats = mains.filter(function (m, k) { return k > 0 && m !== fin && !m.falling && m.w >= 140; });
    if (itemPlats.length) {
      // v3.6: 15 armas de Tonho (incluindo Peixeira, Bacamarte, Berimbau e Rede de Dormir)
      var weaponPool = wIdx === 0 ? (stIdx >= 2 ? ['baleadeira', 'pandeiro', 'porrete', 'chocalho', 'laco', 'peixeira', 'rede'] : ['baleadeira', 'porrete', 'peixeira'])
        : wIdx === 1 ? ['baleadeira', 'pandeiro', 'sanfona', 'porrete', 'candeeiro', 'laco', 'chocalho', 'peixeira', 'berimbau', 'rede']
        : ['baleadeira', 'pandeiro', 'rojao', 'sanfona', 'porrete', 'laco', 'zabumba', 'candeeiro', 'chocalho', 'triangulo', 'peixeira', 'bacamarte', 'berimbau', 'rede'];
      var wp = itemPlats[clamp(Math.floor(itemPlats.length * 0.2), 0, itemPlats.length - 1)];
      var w1 = weaponPool[R.int(0, weaponPool.length - 1)];
      S.items.push({ type: w1, x: Math.round(wp.x + wp.w / 2 - 15), y: wp.y - 70 });
      if (itemPlats.length > 3) {
        var wp2 = itemPlats[clamp(Math.floor(itemPlats.length * 0.78), 0, itemPlats.length - 1)];
        var w2 = weaponPool[R.int(0, weaponPool.length - 1)]; if (w2 === w1) w2 = weaponPool[(weaponPool.indexOf(w1) + 1) % weaponPool.length];
        if (wp2 !== wp) S.items.push({ type: w2, x: Math.round(wp2.x + wp2.w / 2 - 40), y: wp2.y - 70 });
      }
      // v3.6: armas do parceiro da fase (Zefinha, Menino Cabeça de Vento, Galinha Melindrosa ou Bode Toddy)
      var pKind = (S.partner && S.partner.kind) || 'zefinha';
      var partnerPools = {
        zefinha: wIdx === 0 ? ['presilha', 'fita', 'boneca_pano', 'corda'] : ['presilha', 'fita', 'chapeu', 'espelho', 'sombrinha', 'boneca_pano', 'corda', 'bilro', 'cajuina'],
        cabeca_vento: ['pipa', 'chiclete', 'piao', 'bolinha_gude', 'bombinha', 'aviao_papel', 'ioio'],
        galinha: ['ciscar', 'ovo_ouro', 'cacarejo', 'bicada_furadeira', 'ninho_pintinhos', 'redemoinho_penas'],
        bode_toddy: ['chifrada_toddy', 'berro_bode', 'cabecada_sismica', 'coice_bode', 'lata_toddy', 'salto_cabrito', 'furia_toddy'],
        seu_lunga: ['sanfona_fole', 'resposta_braba', 'bengala_couro', 'cachimbo_fumaca', 'espora_prata', 'forro_trovao'],
        tatu_bola: ['giro_tatu', 'placa_casco', 'cavada_sertaneja', 'terremoto_tatu', 'espinho_mandacaru', 'tatu_foguete']
      };
      var zPool = partnerPools[pKind] || partnerPools.zefinha;
      var nZ = S.duo ? 3 : ((wIdx >= 0 && !S.isChallenge && R.chance(0.45)) ? 1 : 0);
      for (var zi = 0; zi < nZ; zi++) { var zp = itemPlats[clamp(Math.floor(itemPlats.length * (0.12 + zi * 0.32)), 0, itemPlats.length - 1)]; S.items.push({ type: zPool[R.int(0, zPool.length - 1)], x: Math.round(zp.x + zp.w / 2 + 40), y: zp.y - 70 }); }
      // v3.1: fantasias por tempo (Mandacaru, Boi-Bumbá, Sol) — não nas primeiras fases
      if (wIdx >= 1 && !S.isChallenge && (stIdx >= 2 || wIdx >= 3) && R.chance(wIdx >= 3 ? 0.8 : 0.55)) {
        var ct = { sertao: 'cacto', caatinga: 'cacto', canion: 'sol', trono: 'sol', caverna: 'sol', pantano: 'boi', mangue: 'boi' }[S.biome] || R.pick(['cacto', 'boi', 'sol']);
        var cp = itemPlats[clamp(Math.floor(itemPlats.length * 0.5), 0, itemPlats.length - 1)];
        S.items.push({ type: 'fantasia_' + ct, x: Math.round(cp.x + cp.w / 2 - 50), y: cp.y - 80 });
      }
      // v3.1: especiais (milho, pamonha, tapioca) só nas fases difíceis: mundo 4 em diante
      if (wIdx >= 3 && !S.isChallenge && stIdx >= 1 && R.chance(wIdx >= 5 ? 0.6 : 0.45)) {
        var sp = itemPlats[clamp(Math.floor(itemPlats.length * 0.3), 0, itemPlats.length - 1)];
        S.items.push({ type: 'especial_' + R.pick(['milho', 'pamonha', 'tapioca']), x: Math.round(sp.x + sp.w / 2 + 70), y: sp.y - 80 });
      }
      // v3.6: Montarias (Jegue ou Bode Toddy) disponíveis nas fases!
      var wantMount = S.biome === 'caatinga' || S.biome === 'saojoao' || stIdx >= 1 || (S.isChallenge && R.chance(0.4));
      if (wantMount) {
        var jp = itemPlats[clamp(Math.floor(itemPlats.length * 0.33), 0, itemPlats.length - 1)];
        var mType = (stIdx % 2 === 1) ? 'bode_toddy_mount' : 'jegue';
        S.items.push({ type: mType, x: Math.round(jp.x + jp.w / 2 + 50), y: jp.y - 44 });
      }
      // v3.6: Relíquia Rara da União (só desbloqueia quando o jogador coleta quase tudo da fase!)
      if (!S.isChallenge && itemPlats.length > 2) {
        var up = itemPlats[clamp(Math.floor(itemPlats.length * 0.82), 0, itemPlats.length - 1)];
        S.items.push({ type: 'reliquia_uniao', x: Math.round(up.x + up.w / 2), y: up.y - 82 });
      }
      var hp = itemPlats[clamp(Math.floor(itemPlats.length * 0.62), 0, itemPlats.length - 1)];
      S.items.push({ type: R.chance(0.5) ? 'gibao' : 'cuscuz', x: Math.round(hp.x + hp.w / 2 + 20), y: hp.y - 70 });
      if (lg) { var lp = itemPlats[itemPlats.length - 1]; S.items.push({ type: wIdx >= 2 ? R.pick(['rojao', 'sanfona', 'zabumba', 'triangulo', 'bacamarte']) : R.pick(['pandeiro', 'porrete', 'laco', 'peixeira']), x: Math.round(lp.x + lp.w / 2 - 15), y: lp.y - 70 });
        S.items.push({ type: 'cuscuz', x: Math.round(lp.x + lp.w / 2 + 25), y: lp.y - 70 }); }
      if (wIdx === 0) { var ep = itemPlats[clamp(Math.floor(itemPlats.length * 0.4), 0, itemPlats.length - 1)]; S.items.push({ type: 'cuscuz', x: Math.round(ep.x + ep.w / 2), y: ep.y - 70 }); }
    }
    // v3.2: fases em dupla: mais rodas de mandacaru e espinhos; bichos mais brabos
    if (S.duo) {
      var duoPlats = mains.filter(function (m, k) { return k > 1 && m !== fin && !m.falling && m.w >= 380 && bodePlats.indexOf(m) < 0; });
      for (var dq = 0; dq < duoPlats.length; dq += 2) { var dm = duoPlats[dq];
        if (dq % 4 === 0) S.hazardWheels.push(wheel(dm.x + dm.w * 0.35, dm.y - 95, 80, 0.04));
        else S.hazards.push({ x: Math.round(dm.x + dm.w * 0.62), y: dm.y - 14, w: 70, h: 14, kind: 'espinho' }); }
      S.enemies.forEach(function (e) { if (!e.legend && R.chance(0.2)) e.elite = true; });
    }
    if (S.items.some(function (it) { return /^especial_/.test(it.type); }) && ground.length) {
      // depois de um especial a fase aperta: mais bichos na segunda metade
      var late = mains.filter(function (m, k) { return k > mains.length / 2 && m !== fin && !m.falling && m.w >= 300; });
      for (var li2 = 0; li2 < Math.min(3, late.length); li2++) { var lm = late[li2], lt2 = R.pick(ground); S.enemies.push(decorate({ type: lt2, x: Math.round(lm.x + lm.w * 0.6), y: lm.y - 32, dir: -1, elite: true, patrol: { minX: lm.x + 10, maxX: lm.x + lm.w - 10 } }, lt2)); }
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
    [1 / 4, 2 / 4, 3 / 4].forEach(function (f) {
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
    sertao:  ['escorpiao', 'urubu', 'calango', 'tatu', 'cacto_atirador', 'bode_doido', 'carcara',
              'sapo_cururu', 'marimbondo', 'jararaca', 'cangaceiro_sombra', 'mula_sem_cabeca',
              'boitata_fogo', 'lobisomem'],
    caverna: ['escorpiao', 'morcego', 'tatu', 'cacto_atirador', 'fulozinha',
              'sapo_cururu', 'marimbondo', 'jararaca', 'cangaceiro_sombra', 'mula_sem_cabeca',
              'boitata_fogo', 'lobisomem'],
    pantano: ['carcara', 'fulozinha', 'papa_figo', 'calango',
              'sapo_cururu', 'marimbondo', 'jararaca', 'cangaceiro_sombra', 'mula_sem_cabeca',
              'boitata_fogo', 'lobisomem'],
    mangue:  ['jacare', 'urubu', 'caranguejo', 'baiacu', 'carcara',
              'sapo_cururu', 'marimbondo', 'jararaca', 'cangaceiro_sombra', 'mula_sem_cabeca',
              'boitata_fogo', 'lobisomem'],
    canion:  ['escorpiao', 'urubu', 'salamandra', 'bode_doido', 'carcara', 'tatu',
              'sapo_cururu', 'marimbondo', 'jararaca', 'cangaceiro_sombra', 'mula_sem_cabeca',
              'boitata_fogo', 'lobisomem'],
    trono:   ['escorpiao', 'urubu', 'jacare', 'calango', 'tatu', 'caranguejo', 'salamandra', 'papa_figo', 'morcego',
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
    trono:   ['updraft', 'vine', 'geyser', 'falling', 'bode', 'wind', 'ledge'],
    caatinga: ['thorns', 'log', 'cart', 'thorns'],
    saojoao: ['balloon', 'fogueira', 'log', 'balloon']
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
    S.items = [{ type: 'baleadeira', x: 685, y: 205 }, { type: 'cuscuz', x: 345, y: 300 }];
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

  /* ------------------------------------------------------------------------
   * Fases Especiais de Teletransporte (1-4 Pac-Oxe · 2-4 OxeCraft · 3-4 Oxe-Kart)
   * ---------------------------------------------------------------------- */
  function buildPacOxeStage(S) {
    S.specialMode = 'pacman';
    S.levelW = 1200; S.levelH = 540;
    S.respawnX = 584; S.respawnY = 396;
    S.platforms = [
      // Moldura externa do labirinto (com abertura lateral no meio para teletransporte esquerda<->direita!)
      { x: 40, y: 20, w: 1120, h: 22, theme: 'neon' },
      { x: 40, y: 500, w: 1120, h: 22, theme: 'neon' },
      { x: 40, y: 20, w: 22, h: 210, theme: 'neon' },
      { x: 40, y: 310, w: 22, h: 212, theme: 'neon' },
      { x: 1138, y: 20, w: 22, h: 210, theme: 'neon' },
      { x: 1138, y: 310, w: 22, h: 212, theme: 'neon' },
      // Blocos internos simétricos do Labirinto Come-Rapadura
      { x: 130, y: 88, w: 180, h: 36, theme: 'neon' },
      { x: 380, y: 88, w: 150, h: 36, theme: 'neon' },
      { x: 670, y: 88, w: 150, h: 36, theme: 'neon' },
      { x: 890, y: 88, w: 180, h: 36, theme: 'neon' },
      { x: 130, y: 188, w: 110, h: 140, theme: 'neon' },
      { x: 960, y: 188, w: 110, h: 140, theme: 'neon' },
      { x: 310, y: 188, w: 130, h: 34, theme: 'neon' },
      { x: 760, y: 188, w: 130, h: 34, theme: 'neon' },
      // Casa central das Assombrações
      { x: 490, y: 210, w: 220, h: 96, theme: 'ghostHouse' },
      // Corredores inferiores
      { x: 310, y: 300, w: 130, h: 34, theme: 'neon' },
      { x: 760, y: 300, w: 130, h: 34, theme: 'neon' },
      { x: 130, y: 392, w: 220, h: 36, theme: 'neon' },
      { x: 430, y: 372, w: 340, h: 32, theme: 'neon' },
      { x: 850, y: 392, w: 220, h: 36, theme: 'neon' }
    ];
    // Grade de Rapaduras pelos corredores do labirinto
    for (var gx = 92; gx <= 1108; gx += 46) {
      for (var gy = 58; gy <= 472; gy += 46) {
        var insideWall = S.platforms.some(function (pl) {
          return gx > pl.x - 14 && gx < pl.x + pl.w + 14 && gy > pl.y - 14 && gy < pl.y + pl.h + 14;
        });
        if (!insideWall && Math.hypot(gx - 596, gy - 406) > 34) {
          S.rapaduras.push({ x: gx - 11, y: gy - 9 });
        }
      }
    }
    // 4 Cajus Energizantes nos 4 cantos + 1 Estrela no topo central
    S.cajus = [
      { x: 86, y: 54, index: 0 },
      { x: 1094, y: 54, index: 1 },
      { x: 86, y: 454, index: 2 }
    ];
    S.asaBrancaStars = [
      { x: 1094, y: 454 },
      { x: 585, y: 52 }
    ];
    // Os 4 Fantasmas do Folclore no Labirinto
    S.enemies = [
      { type: 'papa_figo', x: 540, y: 156, dir: -1, pacGhost: true, ghostColor: '#FF4D4D', ghostName: 'Papa-Figo' },
      { type: 'fulozinha', x: 630, y: 156, dir: 1, pacGhost: true, ghostColor: '#FF85C0', ghostName: 'Fulozinha' },
      { type: 'alamoa', x: 350, y: 256, dir: 1, pacGhost: true, ghostColor: '#4DABF7', ghostName: 'Alamoa' },
      { type: 'bode_doido', x: 820, y: 256, dir: -1, pacGhost: true, ghostColor: '#FFA94D', ghostName: 'Bode Assombrado' }
    ];
    S.flagpolePos = { x: 590, y: 20 };
    S.signs = [{
      x: 584, y: 460, title: '🌀 LABIRINTO COME-RAPADURA!', icon: '🟡',
      textTouch: 'Use as 4 direções para correr no labirinto! Pegue os Cajus/Estrelas nos cantos para deixar os vilões AZUIS e engoli-los!',
      textKey: 'Use ← → ↑ ↓ (ou WASD) para andar no labirinto! Pegue os Cajus nos cantos para deixar os vilões AZUIS e devorá-los!'
    }];
    return S;
  }

  function buildOxeCraftStage(S, cfg) {
    S.specialMode = 'minecraft';
    // v4.3: OxeCraft Gigante (5600x680) - Mina da Serra da Capivara com 3 andares de escavação, trilhos e blocos
    S.levelW = 5600; S.levelH = 680;
    S.respawnX = 120; S.respawnY = 380;
    S.platforms = [];
    S.enemies = [];
    S.craftBlocks = [];
    S.rapaduras = [];
    S.cajus = [];
    S.checkpoints = [];
    S.signs = [];
    S.fires = [];

    // 1. ZONA DA SUPERFÍCIE (x: 0 a 1400) - Entrada da Mina & Andaimes de Madeira
    S.platforms.push({ x: 0, y: 440, w: 580, h: 240, theme: 'soil' });
    S.platforms.push({ x: 620, y: 410, w: 380, h: 270, theme: 'stone' });
    S.platforms.push({ x: 1040, y: 380, w: 420, h: 300, theme: 'stone' });
    // Andaimes elevados de madeira de baraúna
    S.platforms.push({ x: 320, y: 310, w: 220, h: 24, oneWay: true, theme: 'wood' });
    S.platforms.push({ x: 740, y: 270, w: 240, h: 24, oneWay: true, theme: 'wood' });
    S.platforms.push({ x: 1120, y: 240, w: 260, h: 24, oneWay: true, theme: 'wood' });

    // 2. ZONA DOS TRILHOS E MINA PROFUNDA (x: 1460 a 3700) - Andares Múltiplos
    // Andar Superior (Y: 260 - 320)
    S.platforms.push({ x: 1480, y: 280, w: 460, h: 28, theme: 'wood' });
    S.platforms.push({ x: 2020, y: 250, w: 520, h: 28, theme: 'wood' });
    S.platforms.push({ x: 2620, y: 280, w: 480, h: 28, theme: 'wood' });
    S.platforms.push({ x: 3180, y: 260, w: 520, h: 28, theme: 'wood' });

    // Andar Médio da Mina (Y: 410 - 460)
    S.platforms.push({ x: 1540, y: 450, w: 520, h: 230, theme: 'stone' });
    S.platforms.push({ x: 2140, y: 430, w: 460, h: 250, theme: 'stone' });
    S.platforms.push({ x: 2680, y: 460, w: 540, h: 220, theme: 'stone' });
    S.platforms.push({ x: 3300, y: 440, w: 480, h: 240, theme: 'stone' });

    // Andar Subterrâneo Profundo (Y: 570 - 620)
    S.platforms.push({ x: 1700, y: 590, w: 380, h: 90, theme: 'stone' });
    S.platforms.push({ x: 2260, y: 580, w: 400, h: 100, theme: 'stone' });
    S.platforms.push({ x: 2840, y: 590, w: 420, h: 90, theme: 'stone' });

    // 3. ZONA DO MAGMA E CRISTA DO DIAMANTE (x: 3800 a 5600)
    S.platforms.push({ x: 3840, y: 480, w: 440, h: 200, theme: 'stone' });
    S.platforms.push({ x: 4360, y: 440, w: 460, h: 240, theme: 'stone' });
    S.platforms.push({ x: 4900, y: 390, w: 380, h: 290, theme: 'stone' });
    S.platforms.push({ x: 5320, y: 350, w: 280, h: 330, theme: 'stone' });
    // Passarelas sobre a lava
    S.platforms.push({ x: 4020, y: 340, w: 220, h: 24, oneWay: true, theme: 'wood' });
    S.platforms.push({ x: 4540, y: 300, w: 240, h: 24, oneWay: true, theme: 'wood' });
    S.platforms.push({ x: 5080, y: 260, w: 200, h: 24, oneWay: true, theme: 'wood' });

    // Poços de Lava borbulhante no abismo
    S.fires.push({ x: 1420, y: 660, w: 100, period: 160, phase: 0 });
    S.fires.push({ x: 3720, y: 660, w: 100, period: 150, phase: 45 });
    S.fires.push({ x: 4290, y: 660, w: 60, period: 140, phase: 30 });
    S.fires.push({ x: 4830, y: 660, w: 60, period: 130, phase: 60 });

    // GERADOR DE BLOCOS MINERÁVEIS (90+ BLOCOS: Diamante, Ouro, Redstone, TNT, Baú, Madeira)
    var blockDefs = [
      // Superfície (Madeira, Grama e primeiros Minérios)
      { x: 380, y: 278, kind: 'wood_crate' }, { x: 412, y: 278, kind: 'wood_crate' },
      { x: 800, y: 378, kind: 'gold_ore' }, { x: 832, y: 378, kind: 'gold_ore' }, { x: 800, y: 346, kind: 'stone_ore' },
      { x: 1200, y: 348, kind: 'tnt' }, { x: 1232, y: 348, kind: 'gold_ore' }, { x: 1200, y: 208, kind: 'chest' },
      
      // Mina Andar Superior
      { x: 1620, y: 248, kind: 'gold_ore' }, { x: 1652, y: 248, kind: 'redstone_ore' }, { x: 1684, y: 248, kind: 'stone_ore' },
      { x: 2180, y: 218, kind: 'redstone_ore' }, { x: 2212, y: 218, kind: 'diamond_ore' }, { x: 2244, y: 218, kind: 'wood_crate' },
      { x: 2760, y: 248, kind: 'tnt' }, { x: 2792, y: 248, kind: 'tnt' }, { x: 2824, y: 248, kind: 'gold_ore' },
      { x: 3340, y: 228, kind: 'diamond_ore' }, { x: 3372, y: 228, kind: 'chest' }, { x: 3404, y: 228, kind: 'redstone_ore' },

      // Mina Andar Médio (Veios densos de minério de Cariri)
      { x: 1720, y: 418, kind: 'stone_ore' }, { x: 1752, y: 418, kind: 'gold_ore' }, { x: 1784, y: 418, kind: 'stone_ore' },
      { x: 1752, y: 386, kind: 'diamond_ore' }, { x: 1784, y: 386, kind: 'gold_ore' },
      { x: 2320, y: 398, kind: 'redstone_ore' }, { x: 2352, y: 398, kind: 'tnt' }, { x: 2384, y: 398, kind: 'redstone_ore' },
      { x: 2352, y: 366, kind: 'gold_ore' }, { x: 2384, y: 366, kind: 'chest' },
      { x: 2860, y: 428, kind: 'gold_ore' }, { x: 2892, y: 428, kind: 'diamond_ore' }, { x: 2924, y: 428, kind: 'stone_ore' },
      { x: 2892, y: 396, kind: 'tnt' }, { x: 2924, y: 396, kind: 'tnt' },
      { x: 3480, y: 408, kind: 'diamond_ore' }, { x: 3512, y: 408, kind: 'diamond_ore' }, { x: 3544, y: 408, kind: 'redstone_ore' },

      // Mina Subterrânea Profunda (Diamantes escondidos)
      { x: 1840, y: 558, kind: 'diamond_ore' }, { x: 1872, y: 558, kind: 'diamond_ore' }, { x: 1904, y: 558, kind: 'chest' },
      { x: 2400, y: 548, kind: 'gold_ore' }, { x: 2432, y: 548, kind: 'tnt' }, { x: 2464, y: 548, kind: 'diamond_ore' },
      { x: 2980, y: 558, kind: 'redstone_ore' }, { x: 3012, y: 558, kind: 'diamond_ore' }, { x: 3044, y: 558, kind: 'tnt' },

      // Zona Magmática & Saída da Mina (Paredes de TNT e Tesouros do Sertão)
      { x: 3960, y: 448, kind: 'tnt' }, { x: 3992, y: 448, kind: 'gold_ore' }, { x: 4024, y: 448, kind: 'redstone_ore' },
      { x: 4120, y: 308, kind: 'chest' }, { x: 4152, y: 308, kind: 'diamond_ore' },
      { x: 4480, y: 408, kind: 'tnt' }, { x: 4512, y: 408, kind: 'tnt' }, { x: 4544, y: 408, kind: 'diamond_ore' },
      { x: 4640, y: 268, kind: 'gold_ore' }, { x: 4672, y: 268, kind: 'chest' },
      { x: 5020, y: 358, kind: 'diamond_ore' }, { x: 5052, y: 358, kind: 'diamond_ore' }, { x: 5084, y: 358, kind: 'redstone_ore' },
      { x: 5180, y: 228, kind: 'tnt' }, { x: 5212, y: 228, kind: 'diamond_ore' }
    ];

    blockDefs.forEach(function (b) {
      S.craftBlocks.push({
        x: b.x, y: b.y, w: 32, h: 32,
        kind: b.kind,
        hp: b.kind === 'diamond_ore' ? 3 : (b.kind === 'tnt' ? 1 : 2)
      });
    });

    // INIMIGOS ADAPTADOS ESTILO MINECRAFT SERTANEJO (Creepers-Cacto, Esqueletos, Aranhas, Zumbis)
    S.enemies = [
      // Superfície
      { type: 'bode_doido', x: 700, y: 360, isCreeper: true, name: 'Creeper-Cacto' },
      { type: 'cangaceiro_sombra', x: 1150, y: 330, isSkeleton: true },
      { type: 'morcego', x: 1300, y: 180 },

      // Mina Andares Médio e Superior
      { type: 'cangaceiro_sombra', x: 1700, y: 230, isSkeleton: true },
      { type: 'escorpiao', x: 1820, y: 420, isSpider: true },
      { type: 'bode_doido', x: 2200, y: 380, isCreeper: true },
      { type: 'calango', x: 2350, y: 210 },
      { type: 'cangaceiro_sombra', x: 2780, y: 230, isSkeleton: true },
      { type: 'escorpiao', x: 2900, y: 430, isSpider: true },
      { type: 'bode_doido', x: 3000, y: 550, isCreeper: true },
      { type: 'morcego', x: 3200, y: 200 },
      { type: 'tatu', x: 3450, y: 400 },

      // Mina Profunda e Zona de Magma
      { type: 'cangaceiro_sombra', x: 4050, y: 430, isSkeleton: true },
      { type: 'bode_doido', x: 4200, y: 290, isCreeper: true },
      { type: 'escorpiao', x: 4500, y: 400, isSpider: true },
      { type: 'cangaceiro_sombra', x: 4700, y: 250, isSkeleton: true },
      { type: 'bode_doido', x: 5000, y: 340, isCreeper: true },
      { type: 'mula_sem_cabeca', x: 5200, y: 300 }
    ];

    // COLEÇÃO DE RECURSOS E RAPADURAS
    addLine(S, 240, 390, 4, 40);
    addLine(S, 840, 240, 4, 38);
    addLine(S, 1680, 240, 5, 42);
    addLine(S, 2300, 210, 5, 42);
    addLine(S, 2880, 240, 5, 42);
    addLine(S, 4100, 310, 4, 44);
    addLine(S, 4650, 270, 4, 44);

    // CAJUS RAROS
    S.cajus.push({ x: 1200, y: 170, index: 0 });
    S.cajus.push({ x: 2240, y: 175, index: 1 });
    S.cajus.push({ x: 3500, y: 360, index: 2 });
    S.cajus.push({ x: 5100, y: 215, index: 3 });

    // CHECKPOINTS
    S.checkpoints.push({ x: 1480, y: 280 });
    S.checkpoints.push({ x: 3700, y: 440 });

    // ESTRELA ASA BRANCA & BANDEIRA FINAL
    S.asaBrancaStars = [{ x: 4680, y: 180 }];
    S.flagpolePos = { x: 5480, y: 120 };

    S.signs.unshift({
      x: 240, y: 440, title: '⛏️ OXECRAFT: A MINA DA SERRA DA CAPIVARA!', icon: '⛏️',
      textTouch: 'Mundo em Blocos Gigante! Quebre Ouro, Redstone, Diamantes (cura vida!) e Baús de Tesouro. CUIDADO com Creepers-Cacto (chiam e explodem!) e Esqueletos!',
      textKey: 'Mundo em Blocos Gigante! Quebre Ouro, Redstone, Diamantes (J / X) para curar e ganhar pontos. CUIDADO com Creepers-Cacto (chiam e explodem!) e Esqueletos!'
    });
    return S;
  }

  function buildOxeKartStage(S) {
    S.specialMode = 'kart';
    // v4.3: Grande Corrida de Jegue 3D - Circuito Grand Prix Expandido (15.600 px de percurso total, 3 voltas de 5.200m)
    S.levelW = 15600; S.levelH = 540;
    S.respawnX = 120; S.respawnY = 390;
    S.kartLapLength = 5200;
    S.kartTotalLaps = 3;
    S.platforms = [];
    S.kartTrack = {
      boostPads: [], itemBoxes: [], oilSlicks: [],
      cactusObstacles: [], rollingRocks: [], fallenLogs: [], chickens: []
    };

    // 28 segmentos contínuos para compatibilidade com física 2D, bandeira e colisores
    var x = 0, y = 450;
    for (var seg = 0; seg < 28; seg++) {
      var w = seg === 0 ? 880 : (seg === 27 ? 1200 : 540);
      var gap = seg === 0 ? 0 : (seg % 4 === 0 ? 95 : 60);
      x += gap;
      if (seg > 0 && seg < 27) {
        y = clamp(y + (seg % 2 === 0 ? -32 : 28), 340, 465);
      } else if (seg === 27) y = 440;
      S.platforms.push({ x: x, y: y, w: w, h: 90, theme: 'kart_road' });

      // Tapetes Turbo 3D antes de rampas
      if (seg < 27 && seg % 2 === 1) {
        S.kartTrack.boostPads.push({ x: x + w - 140, y: y - 10, w: 100, h: 14 });
      }
      // Caixas de Itens [ ? ] estilo Mario Kart
      if (seg >= 1 && seg <= 26 && seg % 2 === 0) {
        S.kartTrack.itemBoxes.push({ x: x + Math.round(w * 0.42), y: y - 56, w: 32, h: 32, cooldown: 0 });
        S.kartTrack.itemBoxes.push({ x: x + Math.round(w * 0.42) + 56, y: y - 108, w: 32, h: 32, cooldown: 0 });
      }
      // Obstáculos: Poças de Óleo de Mamona
      if (seg >= 2 && seg <= 25 && seg % 3 === 0) {
        S.kartTrack.oilSlicks.push({ x: x + Math.round(w * 0.52), y: y - 8, w: 56, h: 12 });
      }
      // Obstáculos: Espinhos de Mandacaru e Troncos caídos
      if (seg >= 3 && seg <= 25 && seg % 4 === 1) {
        S.kartTrack.cactusObstacles.push({ x: x + Math.round(w * 0.65), y: y - 18, w: 46, h: 26 });
      }
      if (seg >= 4 && seg <= 25 && seg % 5 === 2) {
        S.kartTrack.fallenLogs.push({ x: x + Math.round(w * 0.35), y: y - 22, w: 58, h: 28 });
      }

      // Arcos de rapaduras
      addLine(S, x + 80, y - 40, 4, 52);
      if (seg === 6 || seg === 13 || seg === 20) {
        S.cajus.push({ x: x + Math.round(w * 0.5), y: y - 120, index: Math.floor(seg / 7) });
      }
      if (seg === 9 || seg === 18) {
        S.checkpoints.push({ x: x + 60, y: y });
      }
      x += w;
    }
    S.levelW = x;
    S.asaBrancaStars = [{ x: Math.round(S.levelW * 0.55), y: 240 }];
    S.flagpolePos = { x: S.levelW - 240, y: 200 };

    // 7 CORREDORES RIVAIS DO FOLCLORE NORDESTINO (IA avançada com ultrapassagem, vácuo e armadilhas)
    S.kartRivals = [
      { name: 'Boi de Fogo', kind: 'bull', color: '#E03131', hatColor: '#FFD43B', lane: -0.55, z: 340, x: 260, y: 390, vx: 7.2, baseSpd: 7.2, quote: 'Muuu! Sai da frente!' },
      { name: 'Papa-Figo', kind: 'papa_figo', color: '#845EF7', hatColor: '#343A40', lane: 0.52, z: 290, x: 220, y: 390, vx: 7.0, baseSpd: 7.0, quote: 'Esse fígado é meu!' },
      { name: 'Fulozinha', kind: 'fulozinha', color: '#20C997', hatColor: '#2B8A3E', lane: -0.28, z: 240, x: 190, y: 390, vx: 6.85, baseSpd: 6.85, quote: 'Fiufiuuu! Ninguém me pega!' },
      { name: 'Cabra-Cabriola', kind: 'cabra', color: '#FD7E14', hatColor: '#5C3D2E', lane: 0.36, z: 190, x: 160, y: 390, vx: 6.7, baseSpd: 6.7, quote: 'Béee! Pega esse casco!' },
      { name: 'Cap. Corisco', kind: 'cangaceiro', color: '#3BC9DB', hatColor: '#8A4F22', lane: -0.06, z: 140, x: 140, y: 390, vx: 6.6, baseSpd: 6.6, quote: 'Fogo na poeira!' },
      { name: 'Lampião Sombra', kind: 'sombra', color: '#FF6B6B', hatColor: '#1A1A1A', lane: 0.16, z: 90, x: 120, y: 390, vx: 6.5, baseSpd: 6.5, quote: 'Aqui quem manda sou eu!' },
      { name: 'A Alamoa', kind: 'alamoa', color: '#FFE066', hatColor: '#E8590C', lane: -0.42, z: 40, x: 100, y: 390, vx: 6.4, baseSpd: 6.4, quote: 'Oxe! Vem me alcançar!' }
    ];

    // ELEMENTOS CENOGRÁFICOS 3D AO REDOR DA PISTA (Mandacarus gigantes, Cercas, Caveiras, Moinhos, Casas)
    S.scenery3D = [
      { z: 120, side: -1.45, type: 'mandacaru_tall' },
      { z: 280, side: 1.5, type: 'fence_post' },
      { z: 460, side: -1.6, type: 'cattle_skull' },
      { z: 680, side: 1.7, type: 'windmill' },
      { z: 890, side: -1.5, type: 'carnauba_palm' },
      { z: 1100, side: 1.55, type: 'taipa_house' },
      { z: 1320, side: -1.4, type: 'mandacaru_tall' },
      { z: 1540, side: 1.6, type: 'fence_post' },
      { z: 1780, side: -1.65, type: 'cattle_skull' },
      { z: 2020, side: 1.45, type: 'carnauba_palm' },
      { z: 2260, side: -1.55, type: 'windmill' },
      { z: 2500, side: 1.65, type: 'taipa_house' },
      { z: 2750, side: -1.4, type: 'mandacaru_tall' },
      { z: 3000, side: 1.5, type: 'fence_post' },
      { z: 3280, side: -1.6, type: 'cattle_skull' },
      { z: 3550, side: 1.7, type: 'carnauba_palm' },
      { z: 3820, side: -1.5, type: 'windmill' },
      { z: 4100, side: 1.6, type: 'taipa_house' },
      { z: 4380, side: -1.45, type: 'mandacaru_tall' },
      { z: 4650, side: 1.5, type: 'fence_post' },
      { z: 4950, side: -1.55, type: 'carnauba_palm' }
    ];

    S.signs = [{
      x: 200, y: 450, title: '🫏 GRANDE CIRCUITO 3D DO JEGUE VELOZ (MARIO KART)!', icon: '🏁',
      textTouch: '3 Voltas de 5.200m! Use ◀ ▶ para guiar o Jegue, PULO para Derrapar (Drift Nitro), pule sobre troncos/cactos e aperte ATAQUE para soltar Cascos e Rojões nos 7 Vilões!',
      textKey: '3 Voltas de 5.200m! Use ◀ ▶ (A/D) para guiar o Jegue, ESPAÇO para Derrapar (Drift Nitro), pule sobre troncos/cactos e aperte J/X para soltar Cascos e Rojões nos 7 Vilões!'
    }];
    return S;
  }

  function buildBrawlOxeStage(S, wIdx) {
    S.specialMode = 'brawlstars';
    // v4.2: Arena Oxe-Stars ampliada em 5x (3400x1180 = ~4M px², 5.02x maior em área) e mais desafiadora
    S.levelW = 3400; S.levelH = 1180;
    S.respawnX = 140; S.respawnY = 560;
    S.duo = false;
    // Paredes Perimetrais e Estruturas Táticas da Grande Arena
    S.platforms = [
      // Perímetro externo
      { x: 24, y: 18, w: 3352, h: 28, theme: 'brawl_wall' },
      { x: 24, y: 1134, w: 3352, h: 28, theme: 'brawl_wall' },
      { x: 24, y: 18, w: 28, h: 1144, theme: 'brawl_wall' },
      { x: 3348, y: 18, w: 28, h: 1144, theme: 'brawl_wall' },
      // Setor Oeste (Entrada)
      { x: 360, y: 160, w: 140, h: 80, theme: 'brawl_wall' },
      { x: 360, y: 880, w: 140, h: 80, theme: 'brawl_wall' },
      { x: 620, y: 360, w: 160, h: 180, theme: 'brawl_wall' },
      { x: 620, y: 640, w: 160, h: 180, theme: 'brawl_wall' },
      // Setor Central (Pátio dos Brawlers)
      { x: 1120, y: 160, w: 180, h: 100, theme: 'brawl_wall' },
      { x: 1120, y: 920, w: 180, h: 100, theme: 'brawl_wall' },
      { x: 1480, y: 340, w: 200, h: 120, theme: 'brawl_wall' },
      { x: 1480, y: 720, w: 200, h: 120, theme: 'brawl_wall' },
      { x: 1720, y: 520, w: 180, h: 140, theme: 'brawl_wall' },
      { x: 2040, y: 180, w: 160, h: 120, theme: 'brawl_wall' },
      { x: 2040, y: 880, w: 160, h: 120, theme: 'brawl_wall' },
      // Setor Leste (Portão da Vitória)
      { x: 2480, y: 360, w: 160, h: 180, theme: 'brawl_wall' },
      { x: 2480, y: 640, w: 160, h: 180, theme: 'brawl_wall' },
      { x: 2840, y: 200, w: 140, h: 100, theme: 'brawl_wall' },
      { x: 2840, y: 880, w: 140, h: 100, theme: 'brawl_wall' }
    ];
    // 16 Moitas de Capim (Bushes táticos) espalhadas por toda a arena
    S.brawlBushes = [
      { x: 180, y: 220, w: 140, h: 140 },
      { x: 180, y: 760, w: 140, h: 140 },
      { x: 440, y: 460, w: 130, h: 220 },
      { x: 840, y: 140, w: 200, h: 120 },
      { x: 840, y: 900, w: 200, h: 120 },
      { x: 920, y: 480, w: 160, h: 180 },
      { x: 1350, y: 180, w: 180, h: 120 },
      { x: 1350, y: 860, w: 180, h: 120 },
      { x: 1700, y: 260, w: 180, h: 140 },
      { x: 1700, y: 760, w: 180, h: 140 },
      { x: 2040, y: 480, w: 160, h: 180 },
      { x: 2280, y: 140, w: 180, h: 120 },
      { x: 2280, y: 900, w: 180, h: 120 },
      { x: 2700, y: 460, w: 140, h: 220 },
      { x: 3040, y: 200, w: 160, h: 140 },
      { x: 3040, y: 820, w: 160, h: 140 }
    ];
    // 14 Caixas de Power Cube (Rapadura Cubo Verde brilhante)
    S.brawlCrates = [
      { x: 400, y: 360, w: 46, h: 46, hp: 4, maxHp: 4 },
      { x: 400, y: 740, w: 46, h: 46, hp: 4, maxHp: 4 },
      { x: 880, y: 260, w: 46, h: 46, hp: 4, maxHp: 4 },
      { x: 880, y: 840, w: 46, h: 46, hp: 4, maxHp: 4 },
      { x: 1240, y: 460, w: 46, h: 46, hp: 4, maxHp: 4 },
      { x: 1240, y: 660, w: 46, h: 46, hp: 4, maxHp: 4 },
      { x: 1620, y: 200, w: 46, h: 46, hp: 4, maxHp: 4 },
      { x: 1620, y: 920, w: 46, h: 46, hp: 4, maxHp: 4 },
      { x: 1980, y: 360, w: 46, h: 46, hp: 4, maxHp: 4 },
      { x: 1980, y: 760, w: 46, h: 46, hp: 4, maxHp: 4 },
      { x: 2360, y: 240, w: 46, h: 46, hp: 4, maxHp: 4 },
      { x: 2360, y: 860, w: 46, h: 46, hp: 4, maxHp: 4 },
      { x: 2760, y: 380, w: 46, h: 46, hp: 4, maxHp: 4 },
      { x: 2760, y: 720, w: 46, h: 46, hp: 4, maxHp: 4 }
    ];
    // Os 3 Vilões Brawlers Chefes da Grande Arena (Mais fortes e desafiadores)
    var bossTrio = wIdx === 3
      ? [
          { type: 'papa_figo', name: '★ BRAWLER: PAPA-FIGO SOMBRIO', x: 1420, y: 260, hp: 18, maxHp: 18, brawlBoss: true, color: '#9C36B5', spd: 2.15 },
          { type: 'cabra_cabriola', name: '★ BRAWLER: CABRA-CABRIOLA', x: 1840, y: 880, hp: 20, maxHp: 20, brawlBoss: true, color: '#FA5252', spd: 2.4 },
          { type: 'serpente', name: '★ BRAWLER: SERPENTE DA MARÉ', x: 2650, y: 560, hp: 22, maxHp: 22, brawlBoss: true, color: '#20C997', spd: 2.25 }
        ]
      : (wIdx === 5
        ? [
            { type: 'cangaceiro_sombra', name: '★ BRAWLER: CAPITÃO CORISCO', x: 1420, y: 260, hp: 20, maxHp: 20, brawlBoss: true, color: '#845EF7', spd: 2.35 },
            { type: 'quibungo', name: '★ BRAWLER: REI QUIBUNGO', x: 1840, y: 880, hp: 22, maxHp: 22, brawlBoss: true, color: '#E8590C', spd: 2.45 },
            { type: 'labatut', name: '★ BRAWLER: GENERAL LABATUT', x: 2650, y: 560, hp: 24, maxHp: 24, brawlBoss: true, color: '#D9480F', spd: 2.3 }
          ]
        : [
            { type: 'mula_sem_cabeca', name: '★ BRAWLER: MULA DE FOGO', x: 1420, y: 260, hp: 20, maxHp: 20, brawlBoss: true, color: '#FF922B', spd: 2.45 },
            { type: 'lobisomem', name: '★ BRAWLER: LOBISOMEM DA SERRA', x: 1840, y: 880, hp: 22, maxHp: 22, brawlBoss: true, color: '#FCC419', spd: 2.5 },
            { type: 'boi_encantado', name: '★ BRAWLER: BOI ENCANTADO', x: 2650, y: 560, hp: 24, maxHp: 24, brawlBoss: true, color: '#E03131', spd: 2.35 }
          ]);
    S.enemies = bossTrio.concat([
      { type: 'calango', x: 740, y: 240, hp: 4, maxHp: 4, brawlMinion: true },
      { type: 'sapo_cururu', x: 740, y: 880, hp: 4, maxHp: 4, brawlMinion: true },
      { type: 'cacto_atirador', x: 1280, y: 560, hp: 5, maxHp: 5, brawlMinion: true },
      { type: 'tatu', x: 1620, y: 380, hp: 5, maxHp: 5, brawlMinion: true },
      { type: 'jararaca', x: 1620, y: 760, hp: 4, maxHp: 4, brawlMinion: true },
      { type: 'cacto_atirador', x: 2240, y: 560, hp: 5, maxHp: 5, brawlMinion: true },
      { type: 'onca_pintada', x: 2880, y: 360, hp: 6, maxHp: 6, brawlMinion: true },
      { type: 'escorpiao', x: 2880, y: 780, hp: 4, maxHp: 4, brawlMinion: true }
    ]);
    // Rapaduras e Cajus em trilhas pela grande arena
    for (var rx = 240; rx <= 3160; rx += 220) {
      S.rapaduras.push({ x: rx, y: 90 });
      S.rapaduras.push({ x: rx, y: 560 });
      S.rapaduras.push({ x: rx, y: 1040 });
    }
    S.cajus = [
      { x: 740, y: 560, index: 0 },
      { x: 1720, y: 120, index: 1 },
      { x: 2680, y: 1040, index: 2 }
    ];
    S.asaBrancaStars = [{ x: 1720, y: 1040 }];
    S.flagpolePos = { x: 3260, y: 560 };
    S.brawlExitLocked = true;
    S.signs = [{
      x: 160, y: 560, title: '⭐ GRANDE ARENA OXE-STARS (5X MAIOR)!', icon: '⭐',
      textTouch: 'Arena 5x maior estilo Brawl Stars! Colete Cubos de Força nas caixas, use as moitas para emboscar, DERROTE OS 3 CHEFES BRAWLERS e atravesse o Portão Dourado de Saída no extremo Leste!',
      textKey: 'Arena 5x maior estilo Brawl Stars! Mova com WASD/Setas, quebre caixas para coletar Cubos de Força, DERROTE OS 3 CHEFES BRAWLERS e alcance o Portão Dourado de Saída!'
    }];
    return S;
  }

  function buildShmupOxeStage(S) {
    S.specialMode = 'shmup';
    S.levelW = 6800; S.levelH = 540;
    S.respawnX = 140; S.respawnY = 250;
    S.duo = true;
    S.partner = { x: 180, y: 250, kind: DUO_STAGES[S.code] || 'galinha', joined: true };
    S.platforms = [
      { x: 0, y: 506, w: 6800, h: 40, theme: 'stone' }
    ];
    // Ondas aéreas de inimigos voadores + anéis de rapadura no céu
    for (var wx = 520; wx < 6200; wx += 290) {
      var wy = 90 + ((wx * 7) % 300);
      var fTypes = ['carcara', 'boitata_fogo', 'marimbondo', 'rasga_mortalha', 'ararinha_azul', 'cumacanga'];
      var ft = fTypes[Math.floor(wx / 290) % fTypes.length];
      S.enemies.push({ type: ft, x: wx, y: wy, dir: -1, fly: true, shmupWave: true, hp: 2, maxHp: 2, patrol: { minX: wx - 120, maxX: wx + 120 } });
      if (wx % 580 === 0) {
        S.enemies.push({ type: 'cangaceiro_sombra', x: wx + 90, y: clamp(wy + 90, 90, 410), dir: -1, fly: true, shmupWave: true, elite: true, hp: 4, maxHp: 4 });
      }
      for (var k = 0; k < 4; k++) {
        S.rapaduras.push({ x: wx - 80 + k * 38, y: clamp(wy - 40 + (k % 2) * 24, 60, 440) });
      }
    }
    S.cajus = [
      { x: 1800, y: 140, index: 0 },
      { x: 3600, y: 360, index: 1 },
      { x: 5200, y: 160, index: 2 }
    ];
    S.asaBrancaStars = [{ x: 4400, y: 240 }];
    S.flagpolePos = { x: 6480, y: 220 };
    S.signs = [{
      x: 180, y: 506, title: '🚀 VOO DO CARCARÁ (ASA-DELTA TURBO)!', icon: '🚀',
      textTouch: 'Voe livremente em 4 direções no Balão-Foguete Sertanejo e atire rajadas aéreas contra as esquadrilhas do Cânion!',
      textKey: 'Voe livremente (← → ↑ ↓) no Balão-Foguete Sertanejo e segure J/X para disparar rajadas aéreas!'
    }];
    return S;
  }

  function buildBeatEmUpOxeStage(S) {
    S.specialMode = 'beatemup';
    S.levelW = 3600; S.levelH = 540;
    S.respawnX = 140; S.respawnY = 390;
    S.duo = true;
    S.partner = { x: 200, y: 390, kind: DUO_STAGES[S.code] || 'seu_lunga', joined: true };
    S.platforms = [
      { x: 0, y: 450, w: 3600, h: 90, theme: 'soil' },
      { x: 520, y: 330, w: 220, h: 20, theme: 'wood', oneWay: true },
      { x: 1380, y: 320, w: 240, h: 20, theme: 'wood', oneWay: true },
      { x: 2280, y: 330, w: 240, h: 20, theme: 'wood', oneWay: true }
    ];
    var waves = [
      { x: 750, list: ['caititu', 'bode_doido', 'cangaceiro_sombra', 'lobisomem'] },
      { x: 1650, list: ['onca_pintada', 'mula_sem_cabeca', 'cangaceiro_sombra', 'caipora'] },
      { x: 2580, list: ['lobisomem', 'quibungo', 'labatut', 'cabra_cabriola'] }
    ];
    waves.forEach(function (wv, wi) {
      wv.list.forEach(function (tp, ti) {
        S.enemies.push({
          type: tp, x: wv.x + ti * 85, y: 418, dir: -1, elite: ti >= 2,
          legend: ti === 3, waveIdx: wi + 1, patrol: { minX: wv.x - 180, maxX: wv.x + 380 }
        });
      });
      addLine(S, wv.x - 60, 390, 5, 48);
    });
    S.cajus = [
      { x: 620, y: 270, index: 0 },
      { x: 1490, y: 260, index: 1 },
      { x: 2390, y: 270, index: 2 }
    ];
    S.asaBrancaStars = [{ x: 1950, y: 290 }];
    S.items = [
      { type: 'cuscuz', x: 1120, y: 390 },
      { type: 'gibao', x: 2050, y: 390 },
      { type: 'reliquia_uniao', x: 2450, y: 260 }
    ];
    S.flagpolePos = { x: 3320, y: 210 };
    S.signs = [{
      x: 190, y: 450, title: '🥊 RINGUE DA FEIRA (STREET OXE)!', icon: '🥊',
      textTouch: 'Pancadaria Franca na Feira! Use combos, armas e seu parceiro para derrotar os 3 Trio de Valentões e Campeões!',
      textKey: 'Pancadaria Franca na Feira! Derrote as 3 ondas de Valentões e Campeões usando seus combos e armas!'
    }];
    return S;
  }

  function diffOf(w) { var W = WORLDS[w]; return W && W.diff != null ? W.diff : w; }
  function getLevelSpec(idx) {
    idx = clamp(Math.floor(Number(idx) || 0), 0, TOTAL_LEVELS - 1);
    if (idx === 0) return finalizeSpec(buildLevel1_1());
    var w = Math.floor(idx / SPW), s = idx % SPW;
    var W = WORLDS[w], st = W.stages[s], d = diffOf(w);
    var S = emptySpec({
      idx: idx, worldIdx: w, stageIdx: s, code: st.code, name: st.name, diffIdx: d,
      worldName: W.name, biome: W.biome, music: W.music, mechanic: W.mechanic,
      levelW: Math.round((5200 + Math.min(s, 5) * 260) * 1.5) // v3.2: fases 50% maiores
    });
    if (s === BOSS_STAGE) return finalizeSpec(buildBossArena(S, w));
    if (SPECIAL_MODE_STAGES[st.code] === 'pacman') return finalizeSpec(buildPacOxeStage(S));
    if (SPECIAL_MODE_STAGES[st.code] === 'kart') return finalizeSpec(buildOxeKartStage(S));
    if (SPECIAL_MODE_STAGES[st.code] === 'brawlstars') return finalizeSpec(buildBrawlOxeStage(S, w));
    if (SPECIAL_MODE_STAGES[st.code] === 'shmup') return finalizeSpec(buildShmupOxeStage(S));
    if (SPECIAL_MODE_STAGES[st.code] === 'beatemup') return finalizeSpec(buildBeatEmUpOxeStage(S));
    var gen = mergeGen(W.biome, st.code);
    if (s === 0) addMechanicSign(S);
    if (DUO_STAGES[st.code]) {
      var pKind = typeof DUO_STAGES[st.code] === 'string' ? DUO_STAGES[st.code] : 'zefinha';
      var pMeta = {
        zefinha: { icon: '👧', title: 'Parceira: Zefinha!', desc: 'A Zefinha entrou na parada! Tem pulo duplo e 10 armas arretadas.' },
        cabeca_vento: { icon: '🪁', title: 'Amigo: Menino Cabeça de Vento!', desc: 'Chegou o Cabeça de Vento! Faz travessuras com Pipa, Chiclete, Pião, Bolinha de Gude e mais!' },
        galinha: { icon: '🐔', title: 'Amiga: Galinha Melindrosa!', desc: 'A Galinha Melindrosa chegou! Atira penas, cisca matando geral ao redor, bota ovo explosivo e voa!' },
        bode_toddy: { icon: '🐐', title: 'Amigo: Bode Toddy!', desc: 'O Bode Toddy está na área! Sai chifrando todo mundo e você também pode MONTAR nele (M)!' },
        seu_lunga: { icon: '🪗', title: 'Amigo: Mestre Seu Lunga!', desc: 'O Mestre Seu Lunga chegou! Toca sanfona de trovão, solta Resposta Braba explosiva e bate de bengala!' },
        tatu_bola: { icon: '🛡️', title: 'Amigo: Tatu-Bola Cascudo!', desc: 'O Tatu-Bola entrou no time! Rola blindado atropelando tudo, cava túneis e solta terremoto!' }
      }[pKind] || { icon: '👧', title: 'Fase com Amigo!', desc: 'Seu amigo vai ajudar na fase!' };
      S.duo = true; S.partner = { x: 440, y: GROUND_Y, kind: pKind };
      S.signs.push({ x: 300, y: GROUND_Y, title: pMeta.title, icon: pMeta.icon,
        textTouch: pMeta.desc + '\nToque no rosto (⇄) no alto da tela para trocar de personagem!',
        textKey: pMeta.desc + '\nAperte C para trocar de personagem (ou M para montar no Bode Toddy)!' });
    }
    if (SPECIAL_MODE_STAGES[st.code] === 'minecraft') {
      return finalizeSpec(buildOxeCraftStage(S, {
        rand: makeRand(hashSeed('oxe-level-' + st.code)),
        gen: gen, worldIdx: d, stageIdx: s, code: st.code
      }));
    }
    return finalizeSpec(buildProcedural(S, {
      rand: makeRand(hashSeed('oxe-level-' + st.code)),
      gen: gen, worldIdx: d, stageIdx: s, code: st.code
    }));
  }

  function getDailySeedString(date) {
    var d = date || new Date();
    return 'OXE-' + d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate());
  }

  function getChallengeSpec(seedStr) {
    seedStr = String(seedStr == null ? getDailySeedString() : seedStr);
    var R = wrapRand(mulberry32(hashSeed(seedStr)));
    // v3.0: o desafio do dia sorteia só entre os 3 primeiros mundos (antes caía no mundo 6 e ninguém passava)
    var w = R.int(0, 2), s = R.int(0, 3);
    var W = WORLDS[w];
    var S = emptySpec({
      idx: -1, worldIdx: w, stageIdx: s, code: 'DESAFIO', diffIdx: w, name: 'Desafio Diário · ' + seedStr,
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
    STAGES_PER_WORLD: SPW,
    DUO_STAGES: DUO_STAGES,
    SPECIAL_MODE_STAGES: SPECIAL_MODE_STAGES,
    BOSS_STAGE: BOSS_STAGE,
    V3_SPECIES: V3_SPECIES,
    diffOf: diffOf,
    mulberry32: mulberry32,
    hashSeed: hashSeed,
    getDailySeedString: getDailySeedString,
    getLevelSpec: getLevelSpec,
    getChallengeSpec: getChallengeSpec
  };

  if (typeof window !== 'undefined') window.OxeLevels = OxeLevels;
  if (typeof module !== 'undefined' && module.exports) module.exports = OxeLevels;
})();
