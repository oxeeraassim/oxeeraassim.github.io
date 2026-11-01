/* ==========================================================================
 * jogo-do-oxe / graphics_hd.js  —  window.OxeHD
 * Motor de upgrade visual "3D-to-2D" (estilo UbiArt / Mario Wonder) +
 * 7 novos inimigos folclóricos + gimmicks interativos.
 * - Não altera w/h físicos (escala apenas visual).
 * - Sem dependências externas. Seguro no navegador e no Node `vm`.
 * ========================================================================== */
(function (root) {
  'use strict';

  var G = root || (typeof globalThis !== 'undefined' ? globalThis : this);
  var OUT = '#1e120a';
  var TAU = Math.PI * 2;

  /* ------------------------------------------------------------------ utils */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }

  function hexToRgb(hex) {
    if (typeof hex !== 'string') return { r: 128, g: 128, b: 128 };
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return { r: 128, g: 128, b: 128 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function shade(hex, amt) {
    var c = hexToRgb(hex);
    var f = function (v) {
      v = amt >= 0 ? v + (255 - v) * amt : v * (1 + amt);
      return clamp(Math.round(v), 0, 255);
    };
    return 'rgb(' + f(c.r) + ',' + f(c.g) + ',' + f(c.b) + ')';
  }
  function rgba(hex, a) {
    var c = hexToRgb(hex);
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
  }

  function rrPath(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function ellPath(ctx, x, y, rx, ry, rot) {
    ctx.beginPath();
    if (ctx.ellipse) ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU);
    else ctx.arc(x, y, Math.max(0.1, (rx + ry) / 2), 0, TAU);
  }

  /* Corpo volumétrico 2.5D: gradiente radial 4-stops (luz topo-esq, sombra de núcleo, rim light e bounce) */
  function ball(ctx, x, y, rx, ry, base, opts) {
    opts = opts || {};
    var g = ctx.createRadialGradient(x - rx * 0.38, y - ry * 0.45, Math.max(1, Math.min(rx, ry) * 0.08), x + rx * 0.1, y + ry * 0.12, Math.max(rx, ry) * 1.18);
    g.addColorStop(0, shade(base, 0.56));
    g.addColorStop(0.38, base);
    g.addColorStop(0.8, shade(base, -0.34));
    g.addColorStop(1, shade(base, -0.54));
    ellPath(ctx, x, y, rx, ry, opts.rot);
    ctx.fillStyle = g;
    ctx.fill();
    if (opts.outline !== false) {
      ctx.lineWidth = opts.lw || 2.3;
      ctx.strokeStyle = OUT;
      ctx.stroke();
    }
    if (opts.rim !== false) {
      ctx.save();
      ctx.globalAlpha = 0.46;
      ctx.strokeStyle = '#fff9e6';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      if (ctx.ellipse) ctx.ellipse(x, y, rx * 0.82, ry * 0.82, opts.rot || 0, Math.PI * 1.08, Math.PI * 1.48);
      ctx.stroke();
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = shade(base, -0.6);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      if (ctx.ellipse) ctx.ellipse(x, y, rx * 0.86, ry * 0.86, opts.rot || 0, Math.PI * 0.1, Math.PI * 0.48);
      ctx.stroke();
      ctx.restore();
    }
  }

  function roundBox(ctx, x, y, w, h, r, base) {
    var g = ctx.createLinearGradient(x, y, x + w * 0.15, y + h);
    g.addColorStop(0, shade(base, 0.46));
    g.addColorStop(0.42, base);
    g.addColorStop(0.82, shade(base, -0.32));
    g.addColorStop(1, shade(base, -0.48));
    rrPath(ctx, x, y, w, h, r);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#fff8dc';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + r, y + 1.5);
    ctx.lineTo(x + w - r, y + 1.5);
    ctx.stroke();
    ctx.restore();
    ctx.lineWidth = 2.1;
    ctx.strokeStyle = OUT;
    ctx.stroke();
  }

  /* Olho cartoon: esclera, íris, pupila e catchlight */
  function eye(ctx, x, y, r, lx, ly, opts) {
    opts = opts || {};
    var blink = opts.blink || 0;
    ctx.save();
    ellPath(ctx, x, y, r, r * (1.12 - blink * 1.05));
    ctx.fillStyle = opts.sclera || '#ffffff';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = OUT;
    ctx.stroke();
    if (blink < 0.8) {
      ctx.clip();
      var px = x + clamp(lx || 0, -1, 1) * r * 0.35;
      var py = y + clamp(ly || 0, -1, 1) * r * 0.35;
      ellPath(ctx, px, py, r * 0.62, r * 0.7);
      ctx.fillStyle = opts.iris || '#3a2410';
      ctx.fill();
      ellPath(ctx, px, py, r * 0.34, r * 0.4);
      ctx.fillStyle = '#0a0503';
      ctx.fill();
      ellPath(ctx, px - r * 0.25, py - r * 0.3, r * 0.2, r * 0.2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ellPath(ctx, px + r * 0.2, py + r * 0.22, r * 0.09, r * 0.09);
      ctx.fill();
    }
    ctx.restore();
    if (opts.angry) {
      ctx.save();
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      var s = opts.angry > 0 ? 1 : -1;
      ctx.moveTo(x - r * 1.0, y - r * (1.2 + 0.35 * s));
      ctx.lineTo(x + r * 1.0, y - r * (1.2 - 0.35 * s));
      ctx.stroke();
      ctx.restore();
    }
  }

  function groundShadow(ctx, x, y, w, a) {
    var baseA = a == null ? 0.32 : a;
    ctx.save();
    ctx.globalAlpha = baseA * 0.55;
    ellPath(ctx, x, y + 1, w * 0.64, w * 0.17);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.globalAlpha = baseA;
    ellPath(ctx, x, y, w * 0.45, w * 0.11);
    ctx.fillStyle = '#0a0400';
    ctx.fill();
    ctx.restore();
  }

  function star5(ctx, x, y, r, col) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var rr = i % 2 === 0 ? r : r * 0.45;
      var a = -Math.PI / 2 + i * Math.PI / 5;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    var g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    g.addColorStop(0, '#fffbe0');
    g.addColorStop(0.5, col || '#FFD43B');
    g.addColorStop(1, shade(col || '#FFD43B', -0.35));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = OUT;
    ctx.stroke();
  }

  function dizzyStars(ctx, x, y, t) {
    for (var i = 0; i < 3; i++) {
      var a = t * 0.12 + i * TAU / 3;
      star5(ctx, x + Math.cos(a) * 16, y + Math.sin(a) * 5, 5, i === 1 ? '#74C0FC' : '#FFD43B');
    }
  }

  function interp(o, alpha) {
    var a = num(alpha, 1);
    var x = (typeof o.prevX === 'number') ? lerp(o.prevX, o.x, a) : num(o.x, 0);
    var y = (typeof o.prevY === 'number') ? lerp(o.prevY, o.y, a) : num(o.y, 0);
    return { x: x, y: y };
  }

  function facingOf(o) {
    if (typeof o.facing === 'number') return o.facing >= 0 ? 1 : -1;
    if (typeof o.dir === 'number') return o.dir >= 0 ? 1 : -1;
    if (o.facingRight === false) return -1;
    if (o.facingRight === true) return 1;
    if (typeof o.vx === 'number' && Math.abs(o.vx) > 0.05) return o.vx > 0 ? 1 : -1;
    return 1;
  }

  /* --------------------------------------------------- catálogo de inimigos */
  var BASE_DEFAULTS = {
    calango:     { w: 34, h: 22, hp: 1, spd: 1.2, color: '#82C91E' },
    tatu:        { w: 34, h: 26, hp: 2, spd: 0.9, color: '#A9845A' },
    escorpiao:   { w: 34, h: 24, hp: 1, spd: 1.0, color: '#E8590C' },
    urubu:       { w: 36, h: 28, hp: 1, spd: 1.4, color: '#343A40', fly: true },
    carcara:     { w: 38, h: 30, hp: 2, spd: 1.7, color: '#8B5A2B', fly: true },
    cobra:       { w: 38, h: 20, hp: 1, spd: 1.1, color: '#5C940D' },
    morcego:     { w: 30, h: 24, hp: 1, spd: 1.5, color: '#5F3DC4', fly: true },
    caranguejo:  { w: 34, h: 24, hp: 2, spd: 1.0, color: '#F03E3E' },
    jacare:      { w: 48, h: 26, hp: 3, spd: 0.8, color: '#2B8A3E' },
    aranha:      { w: 32, h: 26, hp: 1, spd: 1.2, color: '#5C3D2E' },
    bode:        { w: 40, h: 36, hp: 2, spd: 1.6, color: '#CED4DA' }
  };
  var NEW_DEFS = {
    sapo_cururu:       { w: 38, h: 32, hp: 2, spd: 1.0, color: '#40C057' },
    marimbondo:        { w: 32, h: 28, hp: 1, spd: 1.8, color: '#FAB005', fly: true },
    jararaca:          { w: 36, h: 28, hp: 2, spd: 1.3, color: '#E03131' },
    cangaceiro_sombra: { w: 36, h: 44, hp: 3, spd: 1.1, color: '#845EF7' },
    mula_sem_cabeca:   { w: 46, h: 40, hp: 3, spd: 2.2, color: '#FF6B6B' },
    boitata_fogo:      { w: 40, h: 26, hp: 2, spd: 1.6, color: '#FFD43B', fly: true },
    lobisomem:         { w: 40, h: 44, hp: 3, spd: 1.9, color: '#495057' }
  };
  var NEW_TYPES = Object.keys(NEW_DEFS);

  function buildDefs() {
    var src = (G && G.ENEMY_DEF && typeof G.ENEMY_DEF === 'object') ? G.ENEMY_DEF : BASE_DEFAULTS;
    var out = {};
    var k;
    for (k in src) if (Object.prototype.hasOwnProperty.call(src, k)) out[k] = Object.assign({}, src[k]);
    for (k in NEW_DEFS) out[k] = Object.assign({}, NEW_DEFS[k]);
    return out;
  }
  var ENEMY_DEF_HD = buildDefs();

  /* ------------------------------------------------------------ paletas */
  var WORLDS = [
    { name: 'sertao',  sky: ['#4aa3ff', '#8fd0ff', '#ffe3a3', '#ffb36b'], hills: ['#e9b872', '#d39a52', '#b77a3c', '#8f5a2a'], fog: '#ffe2b0', ground: '#c8874a', top: '#e8c45a', topD: '#b8922e', particle: 'pollen' },
    { name: 'mata',    sky: ['#3d8fd9', '#7fc8e8', '#c8f0c0', '#f0f7c8'], hills: ['#7fc86a', '#5aa84a', '#3e8a3a', '#2a6a2e'], fog: '#d8f5c8', ground: '#7a5230', top: '#69db7c', topD: '#2f9e44', particle: 'leaves' },
    { name: 'mangue',  sky: ['#2c5d7a', '#4f8fa0', '#9ec7b0', '#e0d9a0'], hills: ['#5a8a74', '#46705e', '#33584a', '#223e34'], fog: '#bfe0c8', ground: '#4e3b2a', top: '#5c940d', topD: '#365c0b', particle: 'fireflies' },
    { name: 'caverna', sky: ['#120c24', '#22184a', '#2f2463', '#3a2a5a'], hills: ['#3b2f6b', '#2e2556', '#221b42', '#17122e'], fog: '#5f4b9a', ground: '#3a3350', top: '#63e6be', topD: '#12b886', particle: 'fireflies' },
    { name: 'canion',  sky: ['#3b1a2e', '#a33a2e', '#f07a3a', '#ffcf6b'], hills: ['#b2502e', '#8f3a22', '#6e2a1a', '#4a1a10'], fog: '#ff9a5a', ground: '#6e2f1e', top: '#ff922b', topD: '#d9480f', particle: 'embers' },
    { name: 'sombra',  sky: ['#0b0b18', '#1e1a33', '#3a2a4a', '#6a3a4a'], hills: ['#2d2a40', '#24213a', '#1a182c', '#100f1e'], fog: '#5a4a6a', ground: '#2a2638', top: '#9775fa', topD: '#6741d9', particle: 'embers' },
    // v3.0
    { name: 'caatinga', sky: ['#6aa8d8', '#b8d8e8', '#f2dfb0', '#e8b878'], hills: ['#b9a884', '#9d8c68', '#7f6f50', '#5e5038'], fog: '#efe0bf', ground: '#9a7650', top: '#b8a868', topD: '#857845', particle: 'pollen' },
    { name: 'saojoao', sky: ['#070b24', '#141a4a', '#3a2a6a', '#8a4a5a'], hills: ['#2a2450', '#221d44', '#1a1636', '#110e26'], fog: '#6a4a8a', ground: '#4a3424', top: '#d9a441', topD: '#9c6b30', particle: 'fireflies' }
  ];
  var THEME_ALIAS = { desert: 0, sertao: 0, caatinga: 0, forest: 1, mata: 1, jungle: 1, pantano: 1, swamp: 2, mangue: 2, cave: 3, caverna: 3, canyon: 4, canion: 4, lava: 4, volcano: 4, shadow: 5, sombra: 5, castle: 5, trono: 5, caatinga: 6, saojoao: 7 };
  var WORLD_IDX_TO_PAL = [0, 3, 1, 2, 4, 5, 6, 7]; // ordem dos mundos do jogo -> paletas

  // v2.2: antes todos os mundos caíam na paleta do sertão (o bioma fica em L.spec.biome)
  function worldOf(L) {
    if (!L) return WORLDS[0];
    var t = (L.spec && L.spec.biome) || L.theme || L.biome;
    if (typeof t !== 'string' && typeof L.worldIdx === 'number') return WORLDS[WORLD_IDX_TO_PAL[clamp(L.worldIdx, 0, 7)]];
    if (typeof t === 'string' && THEME_ALIAS.hasOwnProperty(t.toLowerCase())) return WORLDS[THEME_ALIAS[t.toLowerCase()]];
    var w = num(L.world, num(L.worldIndex, 0));
    if (w >= 1 && w <= 6 && L.world !== 0) w = w - 1;
    return WORLDS[clamp(Math.floor(w), 0, WORLDS.length - 1)];
  }

  function hash(n) { var s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

  function mixHex(c1, c2, t) {
    var a = hexToRgb(c1), b = hexToRgb(c2);
    var r = Math.round(lerp(a.r, b.r, t)), g = Math.round(lerp(a.g, b.g, t)), bl = Math.round(lerp(a.b, b.b, t));
    var h = function (n) { var s = clamp(n, 0, 255).toString(16); return s.length < 2 ? '0' + s : s; };
    return '#' + h(r) + h(g) + h(bl);
  }

  /* Variação de clima/horário fase a fase (0..6) dentro de cada mundo para diferenciar as 56 fases */
  function stageSubPalette(L, baseP) {
    var st = (L && typeof L.stageIdx === 'number') ? clamp(L.stageIdx, 0, 6) : 0;
    if (st === 0) return baseP;
    var sky = baseP.sky.slice(), hills = baseP.hills.slice(), fog = baseP.fog, ground = baseP.ground, top = baseP.top, topD = baseP.topD;
    var indoor = baseP.name === 'caverna';
    if (st === 1) { // Sol forte do meio-dia
      sky = [mixHex(sky[0], '#1c7ed6', 0.18), mixHex(sky[1], '#74c0fc', 0.15), mixHex(sky[2], '#fff3bf', 0.2), mixHex(sky[3], '#ffd43b', 0.15)];
      ground = mixHex(ground, '#d99b52', 0.12);
    } else if (st === 2) { // Tarde dourada
      sky = [mixHex(sky[0], '#e67700', 0.22), mixHex(sky[1], '#fab005', 0.22), mixHex(sky[2], '#ffd8a8', 0.25), mixHex(sky[3], '#ff922b', 0.25)];
      hills = hills.map(function (c) { return mixHex(c, '#d97828', 0.16); });
      fog = mixHex(fog, '#ffd8a8', 0.25);
    } else if (st === 3) { // Pôr do sol arretado (alaranjado/lilás)
      sky = indoor
        ? [mixHex(sky[0], '#2b0b30', 0.35), mixHex(sky[1], '#5f2568', 0.35), mixHex(sky[2], '#9c36b5', 0.25), mixHex(sky[3], '#e8590c', 0.25)]
        : [mixHex(sky[0], '#5f2568', 0.42), mixHex(sky[1], '#c92a2a', 0.38), mixHex(sky[2], '#f76707', 0.4), mixHex(sky[3], '#ffd43b', 0.35)];
      hills = hills.map(function (c) { return mixHex(c, '#7a2e3a', 0.22); });
      fog = mixHex(fog, '#ffa94d', 0.35);
      ground = mixHex(ground, '#9c4a24', 0.15);
    } else if (st === 4) { // Crepúsculo / entardecer
      sky = [mixHex(sky[0], '#181438', 0.48), mixHex(sky[1], '#3b2860', 0.44), mixHex(sky[2], '#8a4058', 0.38), mixHex(sky[3], '#e8804c', 0.32)];
      hills = hills.map(function (c) { return mixHex(c, '#3a284c', 0.28); });
      fog = mixHex(fog, '#b197fc', 0.25);
    } else if (st === 5) { // Noite de luar no sertão
      sky = [mixHex(sky[0], '#090d24', 0.65), mixHex(sky[1], '#162044', 0.6), mixHex(sky[2], '#283868', 0.52), mixHex(sky[3], '#485c88', 0.45)];
      hills = hills.map(function (c) { return mixHex(c, '#1c2848', 0.38); });
      fog = mixHex(fog, '#91a7ff', 0.3);
      ground = mixHex(ground, '#3a3852', 0.2);
    } else if (st === 6) { // Arena dramática do Chefão
      sky = [mixHex(sky[0], '#1f0812', 0.55), mixHex(sky[1], '#5c1424', 0.5), mixHex(sky[2], '#a62e22', 0.45), mixHex(sky[3], '#ff922b', 0.4)];
      hills = hills.map(function (c) { return mixHex(c, '#4a141c', 0.32); });
      fog = mixHex(fog, '#ff6b6b', 0.3);
      ground = mixHex(ground, '#6e2a1e', 0.22);
    }
    return { name: baseP.name, sky: sky, hills: hills, fog: fog, ground: ground, top: top, topD: topD, particle: baseP.particle, stageIdx: st };
  }

  /* ======================================================= PARALLAX HD */
  function drawParallaxHD(ctx, camX, camY, L, frameCount, W, H) {
    W = num(W, 960); H = num(H, 540); camX = num(camX, 0); camY = num(camY, 0);
    var t = num(frameCount, 0);
    var spMode = (L && L.specialMode) || (L && L.spec && L.spec.specialMode) || null;
    G._oxeSpecialMode = spMode;
    if (spMode === 'pacman') {
      ctx.save();
      var pacPow = num(G._pacPowerTimer, 0) > 0;
      var pg = ctx.createLinearGradient(0, 0, 0, H);
      pg.addColorStop(0, pacPow ? '#0b1e3d' : '#090718');
      pg.addColorStop(0.55, pacPow ? '#123059' : '#181030');
      pg.addColorStop(1, '#26132e');
      ctx.fillStyle = pg; ctx.fillRect(0, 0, W, H);
      // Serras do Sertão 2.5D ao fundo + Mandacarus em silhueta iluminada
      ctx.fillStyle = 'rgba(45, 22, 54, 0.75)';
      ctx.beginPath(); ctx.moveTo(0, H);
      for (var px = 0; px <= W; px += 40) {
        var py = H * 0.68 - Math.sin((px + camX * 0.15) * 0.008) * 32 - Math.cos((px + camX * 0.08) * 0.018) * 18;
        ctx.lineTo(px, py);
      }
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
      // Ladrilhos 2.5D em perspectiva de Xilogravura / Cordel no piso do labirinto
      var gs = 46;
      var gox = -(Math.floor(camX) % gs);
      ctx.strokeStyle = pacPow ? 'rgba(116,192,252,0.26)' : 'rgba(255,212,59,0.14)';
      ctx.lineWidth = 1.2;
      for (var gx = gox; gx < W; gx += gs) {
        ctx.beginPath(); ctx.moveTo(gx, 40); ctx.lineTo(gx, H); ctx.stroke();
      }
      for (var gy = 46; gy < H; gy += gs) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
        for (var dx = gox + gs / 2; dx < W; dx += gs * 2) {
          ctx.fillStyle = pacPow ? 'rgba(77,171,247,0.12)' : 'rgba(255,146,43,0.09)';
          ctx.beginPath();
          ctx.moveTo(dx, gy - 6); ctx.lineTo(dx + 6, gy); ctx.lineTo(dx, gy + 6); ctx.lineTo(dx - 6, gy);
          ctx.closePath(); ctx.fill();
        }
      }
      // Bandeirinhas de São João neon no topo do labirinto Pac-Oxe
      var bCols = ['#ffd43b', '#ff6b6b', '#51cf66', '#4dabf7', '#f783ac'];
      for (var fx = -(Math.floor(camX * 0.5) % 28); fx < W; fx += 28) {
        var idxF = Math.abs(Math.floor((fx + camX * 0.5) / 28)) % bCols.length;
        ctx.fillStyle = bCols[idxF];
        ctx.beginPath(); ctx.moveTo(fx, 40); ctx.lineTo(fx + 18, 40); ctx.lineTo(fx + 9, 54 + Math.sin(t * 0.08 + idxF) * 2); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      return;
    }
    if (spMode === 'brawlstars') {
      ctx.save();
      var bgCol1 = '#d99b52', bgCol2 = '#c98840', rimCol = '#8a5428';
      if (L && L.worldIdx === 3) { bgCol1 = '#4d8a6a'; bgCol2 = '#3f7659'; rimCol = '#264a36'; }
      else if (L && L.worldIdx === 5) { bgCol1 = '#483863'; bgCol2 = '#392c50'; rimCol = '#221933'; }
      else if (L && L.worldIdx === 7) { bgCol1 = '#854932'; bgCol2 = '#6e3a26'; rimCol = '#422013'; }
      ctx.fillStyle = bgCol1; ctx.fillRect(0, 0, W, H);
      // Ladrilhos 2.5D de Terreiro Nordestino com relevo chanfrado
      var ts = 64;
      var ox = -(Math.floor(camX) % (ts * 2));
      for (var tx = ox - ts * 2; tx < W + ts * 2; tx += ts) {
        for (var ty = 0; ty < H + ts; ty += ts) {
          var cellX = Math.floor((tx + Math.floor(camX)) / ts);
          var cellY = Math.floor(ty / ts);
          if ((cellX + cellY) % 2 === 0) {
            ctx.fillStyle = bgCol2;
            ctx.fillRect(tx, ty, ts, ts);
            ctx.strokeStyle = 'rgba(255,245,220,0.12)';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(tx + 2, ty + 2, ts - 4, ts - 4);
          }
        }
      }
      // Borda 3D superior e inferior da Arena de Cordel (Mourões de Madeira e Corda Sisal)
      ctx.fillStyle = rimCol;
      ctx.fillRect(0, 0, W, 42);
      ctx.fillRect(0, H - 36, W, 36);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(0, 42, W, 8);
      for (var mx = -(Math.floor(camX) % 96); mx < W + 96; mx += 96) {
        roundBox(ctx, mx - 8, 8, 16, 36, 4, '#5c3a1e');
        ball(ctx, mx, 10, 8, 6, '#ffd43b', { lw: 1.5 });
      }
      // Rosácea / Sol do Sertão 2.5D nos centros da Arena Oxe-Stars
      for (var ai = 0; ai < 2; ai++) {
        var acx = (740 + ai * 760) - camX, acy = 275 - camY;
        if (acx < -180 || acx > W + 180) continue;
        ctx.strokeStyle = 'rgba(255,235,175,0.34)'; ctx.lineWidth = 6;
        ellPath(ctx, acx, acy, 132, 132); ctx.stroke();
        ctx.strokeStyle = 'rgba(92,58,30,0.35)'; ctx.lineWidth = 3;
        ellPath(ctx, acx, acy, 94, 94); ctx.stroke();
        star5(ctx, acx, acy, 44, 'rgba(255,212,59,0.32)');
      }
      ctx.restore();
      return;
    }
    var P = stageSubPalette(L, worldOf(L));
    var stIdx = P.stageIdx || 0;
    ctx.save();

    // Céu multi-stop
    var sky = ctx.createLinearGradient(0, 0, 0, H);
    if (spMode === 'minecraft') {
      sky.addColorStop(0, '#4dabf7'); sky.addColorStop(0.65, '#a5d8ff'); sky.addColorStop(1, '#d0ebff');
    } else {
      sky.addColorStop(0, P.sky[0]); sky.addColorStop(0.4, P.sky[1]);
      sky.addColorStop(0.75, P.sky[2]); sky.addColorStop(1, P.sky[3]);
    }
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

    // Estrelas cintilantes em fases de crepúsculo/luar/São João
    var dark = P.name === 'caverna' || P.name === 'sombra' || P.name === 'saojoao' || stIdx === 5;
    if ((dark || stIdx === 4 || stIdx === 6) && P.name !== 'caverna' && spMode !== 'minecraft') {
      ctx.save();
      for (var si = 0; si < 38; si++) {
        var sx = ((hash(si * 5.3) * W * 1.2 - camX * 0.015) % W + W) % W;
        var sy = hash(si * 2.9 + 11) * H * 0.46;
        ctx.globalAlpha = (stIdx === 5 ? 0.55 : 0.3) + 0.35 * Math.sin(t * 0.04 + si);
        ctx.fillStyle = si % 4 === 0 ? '#ffe8a3' : '#ffffff';
        ctx.fillRect(sx, sy, si % 3 === 0 ? 2.2 : 1.5, si % 3 === 0 ? 2.2 : 1.5);
      }
      ctx.restore();
    }

    // Sol / lua com halo volumétrico (ou Sol Quadrado em OxeCraft!)
    var sunX = W * (0.78 - stIdx * 0.04) - (camX * 0.02) % 40, sunY = H * (stIdx === 3 ? 0.31 : stIdx === 1 ? 0.15 : 0.2);
    var A3 = G.OxeArt3, BIO = (L && L.spec && L.spec.biome) || P.name;
    if (spMode === 'minecraft') {
      ctx.save();
      ctx.fillStyle = 'rgba(255,243,191,0.35)'; ctx.fillRect(sunX - 46, sunY - 46, 92, 92);
      ctx.fillStyle = '#FFE066'; ctx.fillRect(sunX - 32, sunY - 32, 64, 64);
      ctx.fillStyle = '#FFF9DB'; ctx.fillRect(sunX - 24, sunY - 24, 48, 48);
      ctx.strokeStyle = '#F08C00'; ctx.lineWidth = 2.5; ctx.strokeRect(sunX - 32, sunY - 32, 64, 64);
      // Nuvens em blocos 3D estilo Minecraft
      for (var mc = 0; mc < 6; mc++) {
        var mSpan = W + 400;
        var mcx = ((hash(mc * 11) * mSpan - camX * 0.06 - t * 0.12) % mSpan + mSpan) % mSpan - 180;
        var mcy = 42 + (mc % 3) * 34;
        ctx.fillStyle = '#d0ebff'; ctx.fillRect(mcx + 6, mcy + 8, 96, 22);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(mcx, mcy, 96, 22);
        ctx.fillRect(mcx + 22, mcy - 14, 52, 16);
        ctx.strokeStyle = '#339af0'; ctx.lineWidth = 1.5; ctx.strokeRect(mcx, mcy, 96, 22);
      }
      ctx.restore();
    } else {
      var halo = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 195);
      halo.addColorStop(0, dark ? 'rgba(220,210,255,0.62)' : (stIdx === 3 ? 'rgba(255,180,100,0.92)' : 'rgba(255,250,210,0.92)'));
      halo.addColorStop(0.28, dark ? 'rgba(180,160,255,0.22)' : 'rgba(255,210,120,0.38)');
      halo.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = halo; ctx.fillRect(sunX - 195, sunY - 195, 390, 390);
      ball(ctx, sunX, sunY, stIdx === 3 ? 40 : 35, stIdx === 3 ? 40 : 35, dark ? '#e8e0ff' : (stIdx === 3 ? '#ff922b' : '#fff6c8'), { outline: false, rim: false });
    }

    var LQ = !!(G.OxeHD && G.OxeHD.lowQuality);
    // God rays
    if (P.name !== 'caverna' && !LQ) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (var r = 0; r < 6; r++) {
        var ang = 0.35 + r * 0.16 + Math.sin(t * 0.004 + r) * 0.03;
        var a = 0.05 + 0.03 * Math.sin(t * 0.01 + r * 1.7);
        ctx.fillStyle = dark ? 'rgba(160,140,255,' + (a * 0.6) + ')' : 'rgba(255,240,190,' + a + ')';
        ctx.beginPath();
        ctx.moveTo(sunX, sunY);
        ctx.lineTo(sunX - Math.cos(ang) * H * 2.2 - 40, sunY + Math.sin(ang) * H * 2.2);
        ctx.lineTo(sunX - Math.cos(ang + 0.07) * H * 2.2 + 40, sunY + Math.sin(ang + 0.07) * H * 2.2);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }

    // Nuvens fofas com volume 2.5D
    if (P.name !== 'caverna') {
      for (var c = 0; c < 7; c++) {
        var span = W + 400;
        var cx = ((hash(c + stIdx * 7) * span - camX * (0.05 + c * 0.012) - t * (0.08 + hash(c + 9) * 0.1)) % span + span) % span - 200;
        var cy = 38 + hash(c + 3) * H * 0.28 - camY * 0.03;
        var s = 0.8 + hash(c + 5) * 0.85;
        drawCloud(ctx, cx, cy, s, dark);
      }
    }

    if (A3 && A3.skyExtra) A3.skyExtra(ctx, BIO, camX, camY, t, W, H);
    // 4 camadas de serras 2.5D com chanfro de luz/sombra e neblina
    var factors = [0.12, 0.22, 0.36, 0.52];
    for (var l = 0; l < 4; l++) {
      var f = factors[l];
      var baseY = H * (0.48 + l * 0.095) - camY * f * 0.3;
      var amp = (78 - l * 10) * (1 + (stIdx % 3) * 0.05);
      var off = camX * f + stIdx * 230;
      var hg = ctx.createLinearGradient(0, baseY - amp, 0, H);
      hg.addColorStop(0, shade(P.hills[l], 0.26));
      hg.addColorStop(0.32, P.hills[l]);
      hg.addColorStop(1, shade(P.hills[l], -0.42));
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.moveTo(0, H);
      var pts = [];
      for (var x = -20; x <= W + 20; x += 16) {
        var wx = x + off;
        var y = baseY - (Math.sin(wx * 0.004 + l * 1.3 + stIdx * 0.5) * 0.5 + 0.5) * amp
                       - (Math.sin(wx * 0.011 + l * 2.1) * 0.5 + 0.5) * amp * 0.45;
        ctx.lineTo(x, y);
        pts.push(x, y);
      }
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
      // Facetas 2.5D de relevo nas encostas das serras
      if (!LQ && l >= 1) {
        ctx.save();
        ctx.globalAlpha = 0.14;
        ctx.fillStyle = '#000000';
        for (var pi = 2; pi < pts.length - 2; pi += 4) {
          if (pts[pi + 1] > pts[pi - 1]) {
            ctx.beginPath();
            ctx.moveTo(pts[pi - 2], pts[pi - 1]);
            ctx.lineTo(pts[pi], pts[pi + 1]);
            ctx.lineTo(pts[pi] - 18, pts[pi + 1] + 55);
            ctx.lineTo(pts[pi - 2] - 12, pts[pi - 1] + 45);
            ctx.closePath();
            ctx.fill();
          }
        }
        ctx.restore();
      }
      // rim light topo 2.5D
      ctx.save(); ctx.globalAlpha = 0.25; ctx.strokeStyle = '#fff5d6'; ctx.lineWidth = 2.4; ctx.stroke(); ctx.restore();

      if (l === 1) { if (P.name !== 'caatinga' && P.name !== 'saojoao') drawFarProps(ctx, P, off, baseY, W, t); if (A3 && A3.scenery) A3.scenery(ctx, BIO, camX, camY, t, W, H, 1, stIdx); }
      if (l === 3) { if (P.name !== 'caatinga' && P.name !== 'saojoao') drawNearProps(ctx, P, off, baseY, W, H, t); if (A3 && A3.scenery) A3.scenery(ctx, BIO, camX, camY, t, W, H, 3, stIdx); }

      if (LQ) continue;
      // neblina atmosférica de profundidade entre camadas
      var fogG = ctx.createLinearGradient(0, baseY - 24, 0, baseY + 95);
      fogG.addColorStop(0, rgba(P.fog, 0));
      fogG.addColorStop(0.5, rgba(P.fog, 0.24 - l * 0.03));
      fogG.addColorStop(1, rgba(P.fog, 0));
      ctx.fillStyle = fogG; ctx.fillRect(0, baseY - 24, W, 119);
    }

    // Bandeirolas de São João (sertão/mata)
    if (P.name === 'sertao' || P.name === 'mata' || P.name === 'saojoao') {
      var bOff = camX * 0.6;
      var cols = ['#e03131', '#fab005', '#1c7ed6', '#40c057', '#f783ac'];
      for (var bi = -1; bi < 4; bi++) {
        var bx0 = ((bi * 360 - bOff) % 1440 + 1440) % 1440 - 360;
        var by = H * 0.12 - camY * 0.2;
        ctx.strokeStyle = 'rgba(60,40,20,0.6)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(bx0, by); ctx.quadraticCurveTo(bx0 + 180, by + 50, bx0 + 360, by); ctx.stroke();
        for (var fi = 1; fi < 12; fi++) {
          var tt = fi / 12;
          var fx = bx0 + 360 * tt;
          var fy = by + 4 * 50 * tt * (1 - tt) * 0.5 * 2 * 0.5 + Math.sin(t * 0.05 + fi) * 1.5;
          var sw = Math.sin(t * 0.06 + fi * 0.8) * 2;
          ctx.fillStyle = cols[fi % cols.length];
          ctx.beginPath(); ctx.moveTo(fx - 7, fy); ctx.lineTo(fx + 7, fy); ctx.lineTo(fx + sw, fy + 16); ctx.closePath(); ctx.fill();
        }
      }
    }

    if (LQ) { ctx.restore(); return; }
    // Partículas ambientais
    drawAmbient(ctx, P, camX, camY, t, W, H);

    // Vinheta suave
    var vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.9);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(20,8,0,0.25)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function drawCloud(ctx, x, y, s, dark) {
    var puffs = [[0, 0, 26], [24, -10, 30], [52, -2, 24], [30, 8, 26], [-20, 6, 18], [70, 8, 16]];
    var top = dark ? '#8a7fb0' : '#ffffff', bot = dark ? '#4a3f6a' : '#ffd6c0';
    var g = ctx.createLinearGradient(0, y - 40 * s, 0, y + 30 * s);
    g.addColorStop(0, top); g.addColorStop(0.55, dark ? '#6a5f90' : '#fff4ea'); g.addColorStop(1, bot);
    ctx.save(); ctx.globalAlpha = dark ? 0.5 : 0.92;
    ctx.fillStyle = g;
    for (var i = 0; i < puffs.length; i++) {
      ellPath(ctx, x + puffs[i][0] * s, y + puffs[i][1] * s, puffs[i][2] * s, puffs[i][2] * s * 0.85);
      ctx.fill();
    }
    ctx.globalAlpha = dark ? 0.15 : 0.5; ctx.fillStyle = '#ffffff';
    ellPath(ctx, x + 18 * s, y - 16 * s, 14 * s, 7 * s); ctx.fill();
    ctx.restore();
  }

  function drawFarProps(ctx, P, off, baseY, W, t) {
    // Casario nordestino / rochas distantes (escala aumentada +25%)
    for (var i = -1; i < 8; i++) {
      var span = 260;
      var x = ((i * span - off * 0.9) % (span * 8) + span * 8) % (span * 8) - span;
      var h = hash(i + 40 + (P.stageIdx || 0) * 13);
      if (P.name === 'sertao' || P.name === 'mata') {
        if (h > 0.45) drawHouse(ctx, x, baseY - 6, (0.6 + h * 0.3) * 1.25, P);
      } else if (P.name !== 'caverna') {
        drawRock(ctx, x, baseY - 4, (30 + h * 30) * 1.25, shade(P.hills[1], -0.1));
      }
    }
  }

  function drawHouse(ctx, x, y, s, P) {
    var walls = ['#f8e6c4', '#f3c4a0', '#c8e6f5', '#f5d0e0'];
    var w = 52 * s, h = 34 * s;
    var col = walls[Math.floor(Math.abs(x) / 50) % walls.length];
    ctx.save(); ctx.globalAlpha = 0.85;
    roundBox(ctx, x, y - h, w, h, 4 * s, col);
    ctx.fillStyle = '#b5482e';
    ctx.beginPath(); ctx.moveTo(x - 6 * s, y - h); ctx.lineTo(x + w / 2, y - h - 22 * s); ctx.lineTo(x + w + 6 * s, y - h); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#5a3a1e'; rrPath(ctx, x + w * 0.4, y - h * 0.62, w * 0.2, h * 0.62, 3); ctx.fill();
    ctx.fillStyle = '#2b6cb0'; rrPath(ctx, x + w * 0.1, y - h * 0.7, w * 0.18, h * 0.3, 2); ctx.fill();
    rrPath(ctx, x + w * 0.72, y - h * 0.7, w * 0.18, h * 0.3, 2); ctx.fill();
    ctx.restore();
  }

  function drawRock(ctx, x, y, s, col) {
    var g = ctx.createLinearGradient(x, y - s, x, y);
    g.addColorStop(0, shade(col, 0.3)); g.addColorStop(1, shade(col, -0.35));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.7, y);
    ctx.quadraticCurveTo(x - s * 0.8, y - s * 0.7, x - s * 0.2, y - s);
    ctx.quadraticCurveTo(x + s * 0.5, y - s * 1.1, x + s * 0.75, y - s * 0.4);
    ctx.quadraticCurveTo(x + s * 0.85, y, x + s * 0.7, y);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rgba('#1e120a', 0.6); ctx.lineWidth = 1.5; ctx.stroke();
  }

  function drawMandacaru(ctx, x, y, s, t, flower) {
    var col = '#3f8f3a';
    function arm(ax, ay, w, h) {
      var g = ctx.createLinearGradient(ax - w / 2, 0, ax + w / 2, 0);
      g.addColorStop(0, shade(col, -0.35)); g.addColorStop(0.4, shade(col, 0.25)); g.addColorStop(1, shade(col, -0.5));
      rrPath(ctx, ax - w / 2, ay - h, w, h, w / 2);
      ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
      ctx.strokeStyle = 'rgba(20,60,20,0.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ax, ay - h + w / 2); ctx.lineTo(ax, ay - 2); ctx.stroke();
      if (flower) {
        var fy = ay - h - 2;
        var p = 1 + Math.sin(t * 0.05 + ax) * 0.08;
        for (var i = 0; i < 5; i++) {
          var a = i * TAU / 5 + t * 0.003;
          ellPath(ctx, ax + Math.cos(a) * 4 * s * p, fy + Math.sin(a) * 3 * s * p, 3.5 * s, 2.5 * s, a);
          ctx.fillStyle = '#ffffff'; ctx.fill();
        }
        ellPath(ctx, ax, fy, 2.4 * s, 2.4 * s); ctx.fillStyle = '#ffd43b'; ctx.fill();
      }
    }
    arm(x, y, 16 * s, 90 * s);
    // braços laterais
    rrPath(ctx, x - 26 * s, y - 52 * s, 26 * s, 10 * s, 5 * s); ctx.fillStyle = shade(col, -0.1); ctx.fill();
    arm(x - 22 * s, y - 44 * s, 12 * s, 36 * s);
    rrPath(ctx, x, y - 64 * s, 24 * s, 10 * s, 5 * s); ctx.fillStyle = shade(col, -0.1); ctx.fill();
    arm(x + 20 * s, y - 56 * s, 12 * s, 30 * s);
  }

  function drawNearProps(ctx, P, off, baseY, W, H, t) {
    for (var i = -1; i < 7; i++) {
      var span = 320;
      var x = ((i * span - off) % (span * 6) + span * 6) % (span * 6) - span;
      var h = hash(i + 77 + (P.stageIdx || 0) * 19);
      var gy = baseY + 34;
      if (P.name === 'sertao') {
        if (h > 0.32) drawMandacaru(ctx, x + h * 80, gy, (0.8 + h * 0.5) * 1.25, t, true);
        else drawRock(ctx, x, gy, (40 + h * 40) * 1.25, '#a8743e');
      } else if (P.name === 'mata' || P.name === 'mangue') {
        // árvores arredondadas maiores e mais volumosas
        var tx = x + h * 60;
        ctx.fillStyle = '#5a3a1e';
        rrPath(ctx, tx - 8, gy - 88, 16, 98, 6); ctx.fill();
        ball(ctx, tx, gy - 98, (40 + h * 14) * 1.25, (32 + h * 10) * 1.25, P.name === 'mata' ? '#3e8a3a' : '#2f6a4e', { lw: 1.8 });
        ball(ctx, tx - 28, gy - 82, 30, 25, P.name === 'mata' ? '#4aa04a' : '#3a7a5a', { lw: 1.6 });
      } else if (P.name === 'caverna') {
        // estalactites e cristais maiores
        ctx.fillStyle = '#2a2050';
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 22, 0); ctx.lineTo(x + 11, (60 + h * 60) * 1.25); ctx.closePath(); ctx.fill();
        var cg = ctx.createLinearGradient(x, gy - 52, x + 26, gy);
        cg.addColorStop(0, '#c5f6fa'); cg.addColorStop(1, '#3bc9db');
        ctx.fillStyle = cg; ctx.globalAlpha = 0.6 + 0.3 * Math.sin(t * 0.05 + i);
        ctx.beginPath(); ctx.moveTo(x + 40, gy); ctx.lineTo(x + 53, gy - (40 + h * 20) * 1.25); ctx.lineTo(x + 66, gy); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        drawRock(ctx, x, gy, (50 + h * 50) * 1.25, shade(P.hills[2], 0.1));
      }
    }
  }

  function drawAmbient(ctx, P, camX, camY, t, W, H) {
    ctx.save();
    var n = 28;
    for (var i = 0; i < n; i++) {
      var sx = hash(i * 3.1), sy = hash(i * 7.3);
      var px = ((sx * (W + 100) - camX * 0.4 + Math.sin(t * 0.01 + i) * 30) % (W + 100) + W + 100) % (W + 100) - 50;
      var py, col, r = 2;
      if (P.particle === 'embers') {
        py = ((sy * H - t * (0.4 + sx * 0.6)) % H + H) % H;
        col = i % 2 ? '#ffa94d' : '#ff6b6b'; r = 1.5 + sx * 2;
        ctx.globalCompositeOperation = 'lighter';
      } else if (P.particle === 'leaves') {
        py = ((sy * H + t * (0.3 + sx * 0.4)) % H + H) % H;
        col = i % 2 ? '#94d82d' : '#ffa94d';
        ctx.globalAlpha = 0.8;
        ellPath(ctx, px, py, 4, 2, t * 0.03 + i); ctx.fillStyle = col; ctx.fill();
        continue;
      } else if (P.particle === 'fireflies') {
        py = sy * H * 0.8 + Math.sin(t * 0.02 + i * 2) * 20 - camY * 0.1;
        col = '#d8f5a2'; r = 2;
        ctx.globalAlpha = 0.4 + 0.6 * Math.max(0, Math.sin(t * 0.06 + i * 1.7));
        ctx.globalCompositeOperation = 'lighter';
      } else {
        py = sy * H * 0.85 + Math.sin(t * 0.015 + i) * 14 - camY * 0.1;
        col = '#ffe066'; r = 1.6;
        ctx.globalAlpha = 0.7;
      }
      var g = ctx.createRadialGradient(px, py, 0, px, py, r * 3);
      g.addColorStop(0, col); g.addColorStop(1, rgba('#ffffff', 0));
      ctx.fillStyle = g; ctx.fillRect(px - r * 3, py - r * 3, r * 6, r * 6);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  /* ======================================================= PLATAFORMAS HD */
  function drawPlatformsHD(ctx, camX, camY, L, frameCount, W, H) {
    if (!L || !L.platforms) return;
    W = num(W, 960); H = num(H, 540);
    var t = num(frameCount, 0);
    var spMode = (L && L.specialMode) || (L && L.spec && L.spec.specialMode) || null;
    G._oxeSpecialMode = spMode;
    var P = stageSubPalette(L, worldOf(L));
    var plats = L.platforms;
    for (var i = 0; i < plats.length; i++) {
      var p = plats[i];
      if (!p) continue;
      if (p.state === 'fallen') continue;
      if (p.style || p.isLogTop) continue; // v3.0: carroça, balão e tronco oco são desenhados em art_v3.js
      var a = num(L._alpha, 1);
      var px = (p.isMoving && typeof p.prevX === 'number') ? p.prevX + (p.x - p.prevX) * a : p.x;
      var py = (p.isMoving && typeof p.prevY === 'number') ? p.prevY + (p.y - p.prevY) * a : p.y;
      var x = px - camX, y = py - camY, w = num(p.w, 32), h = num(p.h, 32);
      if (x + w < -40 || x > W + 40 || y + h < -40 || y > H + 60) continue;
      if (spMode === 'pacman') {
        drawPacMazeWall(ctx, x, y, w, h, p.theme, t);
      } else if (spMode === 'minecraft') {
        drawMinecraftPlat(ctx, x, y, w, h, p.oneWay);
      } else if (spMode === 'kart') {
        drawKartRoadPlat(ctx, x, y, w, h, t);
      } else if (spMode === 'brawlstars') {
        drawBrawlWall(ctx, x, y, w, h, t);
      } else if (p.isMoving || p.type === 'wood' || p.oneWay || p.type === 'oneway') {
        drawWoodPlat(ctx, x, y, w, h, t, p.isMoving);
      } else {
        drawGroundBlock(ctx, x, y, w, h, P, t, i);
      }
    }
    // Elementos especiais de OxeCraft (blocos mineráveis de Ouro, Diamante, Caixa e TNT)
    if (spMode === 'minecraft' && L.craftBlocks) {
      for (var cb = 0; cb < L.craftBlocks.length; cb++) {
        var blk = L.craftBlocks[cb];
        if (!blk || blk.broken) continue;
        drawCraftBlock(ctx, blk.x - camX, blk.y - camY, blk.w || 32, blk.h || 32, blk.kind, blk.hp, t);
      }
    }
    // Elementos especiais de Oxe-Kart (Boost Pads, Item Boxes [?], Poças de Tapioca/Óleo)
    if (spMode === 'kart' && L.kartTrack) {
      var kt = L.kartTrack;
      (kt.boostPads || []).forEach(function (bp) {
        var bx = bp.x - camX, by = bp.y - camY;
        if (bx + bp.w < -20 || bx > W + 20) return;
        ctx.save();
        var bg = ctx.createLinearGradient(bx, by, bx + bp.w, by);
        bg.addColorStop(0, '#ff922b'); bg.addColorStop(0.5, '#ffd43b'); bg.addColorStop(1, '#51cf66');
        roundBox(ctx, bx, by, bp.w, bp.h, 4, '#ff922b');
        ctx.fillStyle = bg; ctx.fillRect(bx + 2, by + 2, bp.w - 4, bp.h - 4);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('>>> TURBO >>>', bx + bp.w / 2, by + bp.h - 2);
        ctx.restore();
      });
      (kt.oilSlicks || []).forEach(function (ol) {
        var ox = ol.x - camX, oy = ol.y - camY;
        if (ox + ol.w < -20 || ox > W + 20) return;
        ctx.save();
        ellPath(ctx, ox + ol.w / 2, oy + 4, ol.w / 2, 6);
        ctx.fillStyle = '#3b2410'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#ffd43b'; ctx.stroke();
        ctx.restore();
      });
      (kt.itemBoxes || []).forEach(function (ib, idx) {
        if (ib.cooldown > 0) return;
        var ix = ib.x - camX, iy = ib.y - camY + Math.sin(t * 0.1 + idx) * 4;
        if (ix + ib.w < -20 || ix > W + 20) return;
        ctx.save();
        ctx.translate(ix + 16, iy + 16);
        ctx.rotate(Math.sin(t * 0.06 + idx) * 0.18);
        var cols = ['#ff6b6b', '#ffd43b', '#51cf66', '#339af0', '#cc5de8'];
        var c1 = cols[(Math.floor(t / 10) + idx) % cols.length];
        roundBox(ctx, -15, -15, 30, 30, 6, c1);
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center';
        ctx.strokeStyle = OUT; ctx.lineWidth = 3;
        ctx.strokeText('?', 0, 7); ctx.fillText('?', 0, 7);
        ctx.restore();
      });
    }
    // Elementos especiais da Arena Oxe-Stars (Caixas 3D de Power Cube + Moitas 2.5D de Macambira)
    if (spMode === 'brawlstars') {
      (L.brawlCrates || []).forEach(function (cr) {
        if (cr.hp <= 0 || cr.broken) return;
        var cx = cr.x - camX, cy = cr.y - camY;
        ctx.save();
        // Sombra e extrusão 3D do caixote de feira nordestina
        ctx.fillStyle = 'rgba(0,0,0,0.38)';
        rrPath(ctx, cx + 6, cy + 10, cr.w, cr.h, 6); ctx.fill();
        // Face lateral/inferior 3D
        roundBox(ctx, cx + 4, cy + 6, cr.w, cr.h, 6, '#5c3a1e');
        // Topo do caixote
        roundBox(ctx, cx, cy, cr.w, cr.h - 3, 6, '#9c6634');
        roundBox(ctx, cx + 5, cy + 4, cr.w - 10, cr.h - 11, 4, '#b87d46');
        // Ripas diagonais de madeira
        ctx.strokeStyle = '#5c3a1e'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx + 6, cy + 5); ctx.lineTo(cx + cr.w - 6, cy + cr.h - 8); ctx.stroke();
        // Emblema 3D de Cubo de Poder (Estrela de Caju Esmeralda)
        ball(ctx, cx + cr.w / 2, cy + cr.h / 2 - 1, 11, 11, '#2b8a3e', { lw: 1.5 });
        star5(ctx, cx + cr.w / 2, cy + cr.h / 2 - 1, 9, '#69db7c');
        // Barra de vida 3D da caixa
        var bw = 42, pct = Math.max(0, cr.hp / (cr.maxHp || 3));
        roundBox(ctx, cx + cr.w / 2 - bw / 2, cy - 13, bw, 8, 3, '#1a1a1a');
        roundBox(ctx, cx + cr.w / 2 - bw / 2 + 1, cy - 12, Math.max(4, (bw - 2) * pct), 6, 2, '#51cf66');
        ctx.restore();
      });
      (L.brawlBushes || []).forEach(function (bs, bi) {
        var bx = bs.x - camX, by = bs.y - camY;
        ctx.save();
        // Sombra 3D da moita no chão
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        rrPath(ctx, bx + 6, by + 8, bs.w, bs.h, 14); ctx.fill();
        ctx.globalAlpha = bs._heroInside ? 0.45 : 0.94;
        for (var kx = 16; kx < bs.w - 8; kx += 24) {
          for (var ky = 16; ky < bs.h - 8; ky += 24) {
            var sway = Math.sin(t * 0.06 + bi + kx * 0.1) * 1.8;
            ball(ctx, bx + kx, by + ky + 4, 20, 16, '#1b4332', { lw: 1.2, rim: false });
            ball(ctx, bx + kx + sway, by + ky, 19, 15, (kx + ky) % 48 === 0 ? '#40c057' : '#2f9e44', { lw: 1.6 });
            if ((kx + ky) % 72 === 0) {
              ball(ctx, bx + kx + 4, by + ky - 4, 3.5, 3.5, '#ffd43b', { lw: 0.8 });
            }
          }
        }
        if (bs._heroInside) {
          ctx.globalAlpha = 0.95;
          ctx.fillStyle = '#ffe066'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('👁️ FURTIVO', bx + bs.w / 2, by - 4);
        }
        ctx.restore();
      });
    }
  }

  function drawPacMazeWall(ctx, x, y, w, h, theme, t) {
    ctx.save();
    // Extrusão 3D (mistura 2D clássico com blocos de relevo 3D e estética de Couro/Xilogravura Neon do Oxe)
    var dx3 = 6, dy3 = 8;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    rrPath(ctx, x + dx3 + 2, y + dy3 + 3, w, h, 8); ctx.fill();
    if (theme === 'ghostHouse') {
      roundBox(ctx, x + dx3, y + dy3, w, h, 10, '#190d33');
      roundBox(ctx, x, y, w, h, 10, '#321b59');
      ctx.strokeStyle = '#ff922b'; ctx.lineWidth = 3;
      rrPath(ctx, x + 3, y + 3, w - 6, h - 6, 8); ctx.stroke();
      // Portão neon dourado/rosa no topo do Curral das Assombrações
      ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x + w * 0.32, y + 2); ctx.lineTo(x + w * 0.68, y + 2); ctx.stroke();
      ctx.fillStyle = '#ffe066'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('👻 CURRAL DAS ASSOMBRAÇÕES', x + w / 2, y + h / 2 + 4);
    } else {
      var pacPow = num(G._pacPowerTimer, 0) > 0;
      // Parede lateral 3D
      roundBox(ctx, x + dx3, y + dy3, w, h, 8, pacPow ? '#0b3c78' : '#5c2b0e');
      // Face frontal 2.5D com chanfro de couro e ouro neon
      roundBox(ctx, x, y, w, h, 8, pacPow ? '#1971c2' : '#9c4a1a');
      ctx.strokeStyle = pacPow ? '#74c0fc' : '#ffd43b';
      ctx.lineWidth = 2.2;
      rrPath(ctx, x + 3, y + 3, Math.max(4, w - 6), Math.max(4, h - 6), 5); ctx.stroke();
      // Tachas douradas de couro nos cantos dos blocos maiores
      if (w >= 48 && h >= 22) {
        ctx.fillStyle = '#ffe066';
        ctx.beginPath();
        ctx.arc(x + 8, y + 8, 2.2, 0, Math.PI * 2);
        ctx.arc(x + w - 8, y + 8, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawMinecraftPlat(ctx, x, y, w, h, oneWay) {
    var bs = 32;
    ctx.save();
    // Sombra 3D cúbica
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fillRect(x + 6, y + 8, w, h);
    var cols = Math.max(1, Math.ceil(w / bs));
    var rows = Math.max(1, Math.ceil(h / bs));
    for (var r = 0; r < Math.min(rows, 5); r++) {
      for (var c = 0; c < cols; c++) {
        var bx = x + c * bs, by = y + r * bs;
        var bw = Math.min(bs, x + w - bx), bh = Math.min(bs, y + h - by);
        if (bw <= 0 || bh <= 0) continue;
        // Extrusão lateral direita/inferior 3D
        ctx.fillStyle = oneWay ? '#5c3a1e' : (r === 0 ? '#4a321a' : '#3d3d3d');
        ctx.fillRect(bx + 4, by + 4, bw, bh);
        // Bloco principal
        ctx.fillStyle = oneWay ? '#a06a38' : (r === 0 ? '#8b5a2b' : (r === 1 ? '#7a4e24' : '#70757a'));
        ctx.fillRect(bx, by, bw, bh);
        // Grama quadrada verde no topo (estilo bloco de grama do Minecraft)
        if (r === 0 && !oneWay) {
          ctx.fillStyle = '#51cf66';
          ctx.fillRect(bx, by, bw, Math.min(10, bh));
          ctx.fillStyle = '#37b24d';
          for (var k = 0; k < bw - 4; k += 8) {
            ctx.fillRect(bx + k, by + 9, 4, (c + k) % 16 === 0 ? 5 : 3);
          }
        }
        // Pixels de textura voxel
        ctx.fillStyle = 'rgba(0,0,0,0.14)';
        ctx.fillRect(bx + 6, by + 16, 5, 5);
        ctx.fillRect(bx + 18, by + 20, 6, 4);
        ctx.strokeStyle = '#1e120a'; ctx.lineWidth = 1.6;
        ctx.strokeRect(bx, by, bw, bh);
      }
    }
    ctx.restore();
  }

  function drawCraftBlock(ctx, x, y, w, h, kind, hp, t) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + 5, y + 6, w, h);
    var base = kind === 'tnt' ? '#e03131' : (kind === 'diamond_ore' ? '#70757a' : (kind === 'gold_ore' ? '#7a7267' : '#a06a38'));
    ctx.fillStyle = shade(base, -0.35); ctx.fillRect(x + 4, y + 4, w, h);
    ctx.fillStyle = base; ctx.fillRect(x, y, w, h);
    if (kind === 'tnt') {
      ctx.fillStyle = '#f8f9fa'; ctx.fillRect(x, y + 9, w, 13);
      ctx.fillStyle = '#111'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
      ctx.fillText('TNT', x + w / 2, y + 19);
    } else if (kind === 'diamond_ore' || kind === 'gold_ore') {
      var oreCol = kind === 'diamond_ore' ? '#3bc9db' : '#ffd43b';
      ctx.fillStyle = oreCol;
      ctx.fillRect(x + 5, y + 5, 6, 6); ctx.fillRect(x + 19, y + 8, 7, 5);
      ctx.fillRect(x + 8, y + 19, 7, 6); ctx.fillRect(x + 18, y + 18, 6, 6);
    } else {
      ctx.strokeStyle = '#5c3a1e'; ctx.lineWidth = 2;
      ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
    }
    if (hp === 1) {
      ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 6, y + 4); ctx.lineTo(x + 16, y + 16); ctx.lineTo(x + 26, y + 28); ctx.stroke();
    }
    ctx.strokeStyle = '#1e120a'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  function drawKartRoadPlat(ctx, x, y, w, h, t) {
    ctx.save();
    roundBox(ctx, x, y, w, h, 8, '#495057');
    // Faixa de asfalto + zebras vermelhas e brancas no topo
    var stripeW = 24;
    for (var sx = 0; sx < w; sx += stripeW) {
      var sw = Math.min(stripeW, w - sx);
      ctx.fillStyle = (Math.floor(sx / stripeW) % 2 === 0) ? '#e03131' : '#f8f9fa';
      ctx.fillRect(x + sx, y, sw, 9);
    }
    // Linha tracejada amarela da pista
    ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 3;
    ctx.setLineDash([16, 14]);
    ctx.beginPath(); ctx.moveTo(x + 12, y + 24); ctx.lineTo(x + w - 12, y + 24); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawBrawlWall(ctx, x, y, w, h, t) {
    ctx.save();
    // Parede 2.5D/3D de Taipa & Couro com volume alto visto de cima na Arena Oxe-Stars
    var dx3 = 6, dy3 = 12;
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    rrPath(ctx, x + dx3 + 3, y + dy3 + 4, w, h, 8); ctx.fill();
    // Face frontal/lateral 3D escura
    roundBox(ctx, x + 3, y + 8, w, h, 8, '#4a2c18');
    // Topo iluminado 2.5D
    roundBox(ctx, x, y, w, Math.max(12, h - 4), 8, '#b87d46');
    ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 1.8;
    rrPath(ctx, x + 4, y + 4, Math.max(4, w - 8), Math.max(4, h - 12), 5); ctx.stroke();
    // Tachas de couro de cangaceiro no topo do muro
    ctx.fillStyle = '#ffe066';
    for (var sx = x + 14; sx < x + w - 10; sx += 28) {
      ctx.beginPath(); ctx.arc(sx, y + Math.min(12, h * 0.35), 2.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawGroundBlock(ctx, x, y, w, h, P, t, seed) {
    var r = Math.min(14, w / 2, h / 2);
    var LQp = !!(G.OxeHD && G.OxeHD.lowQuality);
    var dx3 = 6, dy3 = 9;
    // sombra projetada 2.5D mais profunda
    ctx.save(); ctx.globalAlpha = 0.32; ctx.fillStyle = '#000';
    rrPath(ctx, x + dx3 + 3, y + dy3 + 4, w, h, r); ctx.fill(); ctx.restore();
    // parede lateral/inferior extrudada 3D (efeito 2.5D com volume real)
    var sideG = ctx.createLinearGradient(x, y, x + dx3, y + h + dy3);
    sideG.addColorStop(0, shade(P.ground, -0.32));
    sideG.addColorStop(1, shade(P.ground, -0.62));
    rrPath(ctx, x + dx3, y + dy3, w, h, r);
    ctx.fillStyle = sideG; ctx.fill();
    ctx.lineWidth = 2.2; ctx.strokeStyle = OUT; ctx.stroke();
    // corpo frontal
    var g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, shade(P.ground, 0.25)); g.addColorStop(0.45, P.ground); g.addColorStop(1, shade(P.ground, -0.45));
    rrPath(ctx, x, y, w, h, r); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 2.4; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.save();
    rrPath(ctx, x, y, w, h, r); ctx.clip();
    // chanfro interno 2.5D (luz topo-esq, sombra base-dir)
    ctx.strokeStyle = 'rgba(255,245,220,0.32)'; ctx.lineWidth = 3;
    rrPath(ctx, x + 3, y + 3, w - 6, h - 6, Math.max(2, r - 3)); ctx.stroke();
    // pedras redondas incrustadas
    var cnt = LQp ? 0 : Math.floor(w * h / 1800);
    for (var k = 0; k < Math.min(cnt, 40); k++) {
      var sx = x + 8 + hash(seed * 13 + k) * (w - 16), sy = y + 22 + hash(seed * 7 + k * 3) * Math.max(1, h - 28);
      var sr = 3.5 + hash(seed + k * 11) * 5.5;
      ball(ctx, sx, sy, sr, sr * 0.8, shade(P.ground, -0.15 + hash(k) * 0.3), { lw: 1, rim: false });
    }
    // veios de lava (cânion)
    if (P.name === 'canion' && h > 30) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,120,30,' + (0.35 + 0.25 * Math.sin(t * 0.06 + seed)) + ')';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x, y + h * 0.6);
      for (var vx = 0; vx <= w; vx += 18) ctx.lineTo(x + vx, y + h * 0.6 + Math.sin(vx * 0.15 + seed) * 8);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
    // raízes (mangue)
    if (P.name === 'mangue') {
      ctx.strokeStyle = '#3a2a18'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      for (var rk = 0; rk < w; rk += 40) {
        ctx.beginPath(); ctx.moveTo(x + rk + 10, y + 12);
        ctx.bezierCurveTo(x + rk, y + 30, x + rk + 30, y + 34, x + rk + 18, y + 52); ctx.stroke();
      }
    }
    // sombra de oclusão sob a aba de grama/pedra do topo
    var topH = Math.min(17, h * 0.52);
    ctx.fillStyle = 'rgba(15,6,0,0.32)';
    ctx.fillRect(x, y + topH - 1, w, 6);
    ctx.restore();
    // cobertura estufada 3D
    var tg = ctx.createLinearGradient(x, y - 7, x, y + topH);
    tg.addColorStop(0, shade(P.top, 0.42)); tg.addColorStop(0.55, P.top); tg.addColorStop(1, P.topD);
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.moveTo(x + 2, y + topH);
    ctx.lineTo(x - 3, y + r * 0.5);
    ctx.quadraticCurveTo(x - 3, y - 4, x + 10, y - 4);
    var bumps = Math.max(1, Math.floor((w - 20) / 22));
    var bw = (w - 20) / bumps;
    for (var b = 0; b < bumps; b++) {
      var bx = x + 10 + b * bw;
      ctx.quadraticCurveTo(bx + bw / 2, y - 9 - hash(seed + b) * 3, bx + bw, y - 4);
    }
    ctx.quadraticCurveTo(x + w + 3, y - 4, x + w + 3, y + r * 0.5);
    ctx.lineTo(x + w - 2, y + topH);
    for (var d = bumps * 2; d >= 0; d--) {
      var dx = x + (w / (bumps * 2)) * d;
      ctx.quadraticCurveTo(dx + w / (bumps * 4), y + topH + 5, dx, y + topH);
    }
    ctx.closePath(); ctx.fill();
    ctx.lineWidth = 2.1; ctx.strokeStyle = OUT; ctx.stroke();
    // brilho especular do topo
    ctx.save(); ctx.globalAlpha = 0.52; ctx.strokeStyle = '#fffbe0'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(x + 10, y - 1); ctx.lineTo(x + w - 10, y - 1); ctx.stroke(); ctx.restore();
    // tufos e flores
    for (var f = 12; f < w - 8; f += (LQp ? 52 : 26)) {
      var hh = hash(seed * 5 + f);
      var sway = Math.sin(t * 0.05 + f * 0.1) * 2;
      ctx.strokeStyle = P.topD; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x + f, y - 2); ctx.quadraticCurveTo(x + f - 3, y - 8, x + f - 4 + sway, y - 12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + f + 2, y - 2); ctx.quadraticCurveTo(x + f + 4, y - 9, x + f + 5 + sway, y - 13); ctx.stroke();
      if (hh > 0.6 && P.name !== 'caverna' && P.name !== 'canion') {
        var fc = ['#ff8787', '#ffffff', '#ffd43b', '#da77f2'][Math.floor(hh * 4) % 4];
        for (var pe = 0; pe < 5; pe++) {
          var pa = pe * TAU / 5;
          ellPath(ctx, x + f + 8 + sway + Math.cos(pa) * 2.5, y - 10 + Math.sin(pa) * 2.5, 2, 2);
          ctx.fillStyle = fc; ctx.fill();
        }
        ellPath(ctx, x + f + 8 + sway, y - 10, 1.4, 1.4); ctx.fillStyle = '#f08c00'; ctx.fill();
      }
      if (P.name === 'caverna' && hh > 0.5) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.5 + 0.4 * Math.sin(t * 0.07 + f);
        ellPath(ctx, x + f, y - 4, 4, 2); ctx.fillStyle = '#96f2d7'; ctx.fill();
        ctx.restore();
      }
    }
  }

  function drawWoodPlat(ctx, x, y, w, h, t, moving) {
    var hh = Math.max(14, Math.min(h, 24));
    // Sombra e extrusão inferior 2.5D do tronco
    ctx.save(); ctx.globalAlpha = 0.28; ctx.fillStyle = '#000';
    rrPath(ctx, x + 5, y + 9, w, hh, hh / 2); ctx.fill(); ctx.restore();
    rrPath(ctx, x + 3, y + 4, w, hh, hh / 2);
    ctx.fillStyle = '#4a2810'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
    var g = ctx.createLinearGradient(x, y, x, y + hh);
    g.addColorStop(0, '#eab676'); g.addColorStop(0.45, '#b9773f'); g.addColorStop(1, '#6e3f1c');
    rrPath(ctx, x, y, w, hh, hh / 2); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 2.2; ctx.strokeStyle = OUT; ctx.stroke();
    // veios
    ctx.strokeStyle = 'rgba(90,50,20,0.55)'; ctx.lineWidth = 1;
    for (var v = 0; v < 2; v++) {
      ctx.beginPath(); ctx.moveTo(x + 10, y + hh * (0.4 + v * 0.25));
      ctx.bezierCurveTo(x + w * 0.3, y + hh * (0.3 + v * 0.3), x + w * 0.7, y + hh * (0.55 + v * 0.2), x + w - 10, y + hh * (0.45 + v * 0.25));
      ctx.stroke();
    }
    // tampas roliças
    for (var e = 0; e < 2; e++) {
      var ex = e ? x + w - hh / 2 : x + hh / 2;
      ellPath(ctx, ex, y + hh / 2, hh * 0.38, hh * 0.42);
      ctx.fillStyle = '#d9a066'; ctx.fill(); ctx.strokeStyle = '#6e3f1c'; ctx.lineWidth = 1.2; ctx.stroke();
      ellPath(ctx, ex, y + hh / 2, hh * 0.18, hh * 0.2); ctx.stroke();
    }
    // pregos dourados
    for (var n = hh + 8; n < w - hh; n += 34) {
      ball(ctx, x + n, y + hh * 0.35, 2.4, 2.4, '#ffd43b', { lw: 1, rim: false });
    }
    ctx.save(); ctx.globalAlpha = 0.4; ctx.strokeStyle = '#fff0d0'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + hh / 2, y + 3); ctx.lineTo(x + w - hh / 2, y + 3); ctx.stroke(); ctx.restore();
    if (moving) {
      ctx.save(); ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 0.1);
      ctx.fillStyle = '#ffe066';
      ellPath(ctx, x + w / 2, y + hh + 4, 5, 2.5); ctx.fill(); ctx.restore();
    }
  }

  /* ======================================================= TONHO HD */
  function drawTonhoHD(ctx, camX, camY, tonho, renderAlpha, frameCount) {
    if (!tonho) return;
    var t = num(frameCount, 0);
    var pos = interp(tonho, renderAlpha);
    var w = num(tonho.w, 28), h = num(tonho.h, 40);
    var cx = pos.x - camX + w / 2, by = pos.y - camY + h;
    var dir = facingOf(tonho);
    var S = 2.08;
    var vx = num(tonho.vx, 0), vy = num(tonho.vy, 0);
    var onG = !!tonho.onGround;
    var running = onG && Math.abs(vx) > 0.4;
    var gliding = !!tonho.gliding;
    var whip = num(tonho.whipTimer, 0);
    var inv = num(tonho.invincible, num(tonho.invTimer, num(tonho.iframes, 0)));
    if (inv > 0 && Math.floor(t / 4) % 2 === 0) return;

    var runPh = running ? Math.sin(t * 0.35 * clamp(Math.abs(vx) / 3, 0.6, 1.6)) : 0;
    var bob = running ? Math.abs(runPh) * 1.5 : Math.sin(t * 0.06) * 0.6;
    var squash = !onG ? clamp(1 + vy * 0.012, 0.9, 1.1) : 1;

    groundShadow(ctx, cx, by + 1, w * S * 0.9, onG ? 0.3 : 0.15);

    if (G._oxeSpecialMode === 'minecraft') {
      var hk = tonho.hero || 'tonho';
      var VOX_PAL = {
        tonho:        { leg: '#4a2810', torso: '#9a5b2a', trim: '#e03131', skin: '#f2c094', hat: '#8a4f22', pick: '#3bc9db' },
        zefinha:      { leg: '#8a4f22', torso: '#f06595', trim: '#ffe066', skin: '#f5cba7', hat: '#ffd43b', pick: '#f783ac' },
        cabeca_vento: { leg: '#1c7ed6', torso: '#4dabf7', trim: '#ffd43b', skin: '#f5cba7', hat: '#ff6b6b', pick: '#69db7c' },
        galinha:      { leg: '#f59f00', torso: '#ffffff', trim: '#fa5252', skin: '#ffffff', hat: '#e03131', pick: '#ffd43b' },
        bode_toddy:   { leg: '#343a40', torso: '#ced4da', trim: '#e03131', skin: '#dee2e6', hat: '#845ef7', pick: '#ff922b' },
        seu_lunga:    { leg: '#3b2818', torso: '#d9a066', trim: '#495057', skin: '#f2c094', hat: '#5c3d2e', pick: '#ffd43b' },
        tatu_bola:    { leg: '#5c4033', torso: '#a68a64', trim: '#ffd43b', skin: '#d9b99b', hat: '#7f5539', pick: '#94d82d' }
      }[hk] || { leg: '#4a2810', torso: '#9a5b2a', trim: '#e03131', skin: '#f2c094', hat: '#8a4f22', pick: '#3bc9db' };
      ctx.save();
      ctx.translate(cx, by);
      ctx.scale(S * dir, S);
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.4;
      // Se estiver montado no Jegue ou Bode Toddy, desenha a montaria em blocos 3D estilo Minecraft!
      if (tonho.mount) {
        var isToddyM = tonho.mount.type === 'bode_toddy';
        ctx.fillStyle = isToddyM ? '#adb5bd' : '#8d6e63';
        ctx.fillRect(-14, -14, 28, 10); ctx.strokeRect(-14, -14, 28, 10);
        ctx.fillRect(8, -24, 10, 12); ctx.strokeRect(8, -24, 10, 12);
        ctx.fillStyle = '#3e2723';
        ctx.fillRect(-12, -4, 5, 4); ctx.fillRect(-3, -4, 5, 4); ctx.fillRect(7, -4, 5, 4);
        ctx.translate(0, -10);
      }
      // Pernas quadradas estilo Minecraft
      var mLeg = running ? runPh * 6 : (!onG ? 4 : 0);
      ctx.fillStyle = VOX_PAL.leg;
      ctx.fillRect(-7, -12 + mLeg * 0.3, 6, 12); ctx.strokeRect(-7, -12 + mLeg * 0.3, 6, 12);
      ctx.fillRect(1, -12 - mLeg * 0.3, 6, 12); ctx.strokeRect(1, -12 - mLeg * 0.3, 6, 12);
      // Tronco cúbico
      ctx.fillStyle = VOX_PAL.torso; ctx.fillRect(-8, -26, 16, 14); ctx.strokeRect(-8, -26, 16, 14);
      ctx.fillStyle = VOX_PAL.trim; ctx.fillRect(-7, -26, 14, 3);
      // Cabeça quadrada 3D
      ctx.fillStyle = shade(VOX_PAL.skin, -0.15); ctx.fillRect(-6, -42, 16, 16);
      ctx.fillStyle = VOX_PAL.skin; ctx.fillRect(-8, -42, 16, 16); ctx.strokeRect(-8, -42, 16, 16);
      ctx.fillStyle = '#111'; ctx.fillRect(2, -36, 3, 3); ctx.fillRect(-3, -36, 3, 3);
      if (hk === 'galinha') {
        // Bico e barbela quadrados estilo Chicken do Minecraft!
        ctx.fillStyle = '#ff922b'; ctx.fillRect(6, -34, 6, 4); ctx.strokeRect(6, -34, 6, 4);
        ctx.fillStyle = '#e03131'; ctx.fillRect(7, -30, 4, 4);
      } else if (hk === 'seu_lunga') {
        // Barba branca quadrada em blocos
        ctx.fillStyle = '#f8f9fa'; ctx.fillRect(-6, -31, 13, 7); ctx.strokeRect(-6, -31, 13, 7);
      }
      // Chapéu / Crista / Chifres em blocos
      ctx.fillStyle = VOX_PAL.hat;
      if (hk === 'bode_toddy') {
        ctx.fillRect(-6, -48, 4, 6); ctx.strokeRect(-6, -48, 4, 6);
        ctx.fillRect(3, -48, 4, 6); ctx.strokeRect(3, -48, 4, 6);
      } else if (hk === 'cabeca_vento') {
        ctx.fillRect(-9, -46, 18, 4); ctx.strokeRect(-9, -46, 18, 4);
        ctx.fillStyle = '#ffd43b'; ctx.fillRect(-6 + (t % 4) * 2, -50, 12, 3);
      } else {
        ctx.fillRect(-13, -46, 26, 5); ctx.strokeRect(-13, -46, 26, 5);
        ctx.fillRect(-8, -52, 16, 6); ctx.strokeRect(-8, -52, 16, 6);
        ctx.fillStyle = '#ffd43b'; ctx.fillRect(-2, -50, 4, 4);
      }
      // Picareta de Diamante / Ferramenta Voxel na mão!
      ctx.save();
      ctx.translate(6, -22);
      ctx.rotate(whip > 0 ? 0.9 : -0.35);
      ctx.fillStyle = '#6f4518'; ctx.fillRect(0, -14, 3, 18);
      ctx.fillStyle = VOX_PAL.pick; ctx.fillRect(-6, -17, 15, 4);
      ctx.strokeRect(-6, -17, 15, 4);
      ctx.restore();
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.translate(cx, by);
    ctx.scale(S * dir / squash, S * squash);
    ctx.translate(0, -bob);

    // ---- Paraquedas / planagem
    if (gliding) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 0.8;
      for (var wl = 0; wl < 3; wl++) {
        var wy = -50 + wl * 8, wo = (t * 2 + wl * 20) % 40;
        ctx.beginPath(); ctx.moveTo(-30 + wo, wy); ctx.quadraticCurveTo(-20 + wo, wy - 3, -8 + wo, wy); ctx.stroke();
      }
      ctx.strokeStyle = OUT; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(-6, -24); ctx.lineTo(-16, -50); ctx.moveTo(6, -24); ctx.lineTo(16, -50); ctx.stroke();
      var cg = ctx.createLinearGradient(0, -66, 0, -48);
      cg.addColorStop(0, '#ff8787'); cg.addColorStop(1, '#c92a2a');
      ctx.beginPath(); ctx.moveTo(-20, -50); ctx.quadraticCurveTo(0, -72 + Math.sin(t * 0.2), 20, -50);
      ctx.quadraticCurveTo(10, -46, 0, -50); ctx.quadraticCurveTo(-10, -46, -20, -50); ctx.closePath();
      ctx.fillStyle = cg; ctx.fill(); ctx.lineWidth = 1.4; ctx.stroke();
      ctx.fillStyle = '#ffd43b';
      ellPath(ctx, -8, -58, 2.5, 2.5); ctx.fill(); ellPath(ctx, 8, -58, 2.5, 2.5); ctx.fill();
      ctx.restore();
    }

    // ---- Pernas / botas
    var legA = running ? runPh * 5 : (!onG ? -2 : 0);
    var legB = running ? -runPh * 5 : (!onG ? 3 : 0);
    drawLeg(ctx, -4, legB, !onG);
    drawLeg(ctx, 4, legA, !onG);

    // ---- Torso (gibão)
    var bg = ctx.createLinearGradient(-9, -24, 9, -9);
    bg.addColorStop(0, '#c98a4b'); bg.addColorStop(0.5, '#9a5b2a'); bg.addColorStop(1, '#5e3416');
    rrPath(ctx, -8.5, -24, 17, 15, 6); ctx.fillStyle = bg; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 0.7; ctx.setLineDash && ctx.setLineDash([1.5, 1.5]);
    rrPath(ctx, -6.5, -22, 13, 11, 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(0, -11); ctx.stroke();
    ctx.setLineDash && ctx.setLineDash([]);
    // cinturão
    rrPath(ctx, -9, -12, 18, 3.5, 1.5); ctx.fillStyle = '#3a200c'; ctx.fill();
    ball(ctx, 0, -10.3, 2, 1.7, '#ffd43b', { lw: 0.8, rim: false });

    // ---- Braço traseiro + chicote
    var armAng = whip > 0 ? -1.2 + (1 - whip / 15) * 2.6 : (running ? runPh * 0.6 : (gliding ? -2.6 : 0.2));
    ctx.save(); ctx.translate(6, -21); ctx.rotate(armAng);
    rrPath(ctx, -2.3, 0, 4.6, 10, 2.3); ctx.fillStyle = '#9a5b2a'; ctx.fill(); ctx.lineWidth = 1.1; ctx.strokeStyle = OUT; ctx.stroke();
    ball(ctx, 0, 11, 2.6, 2.6, '#f2c094', { lw: 1, rim: false });
    ctx.restore();

    // ---- Lenço vermelho com física secundária
    var flow = clamp(-vx * 0.8, -4, 4) * 0 - Math.abs(vx) * 1.2 - (gliding ? 3 : 0);
    var flap = Math.sin(t * 0.3) * (1 + Math.abs(vx) * 0.4);
    ctx.beginPath();
    ctx.moveTo(-3, -24);
    ctx.quadraticCurveTo(-8 + flow * 0.5, -25 + flap * 0.5, -12 + flow, -22 + flap);
    ctx.quadraticCurveTo(-9 + flow * 0.6, -21 + flap * 0.6, -4, -22);
    ctx.closePath();
    ctx.fillStyle = '#e03131'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = OUT; ctx.stroke();
    rrPath(ctx, -6, -26, 12, 3.6, 1.8);
    var lg = ctx.createLinearGradient(0, -26, 0, -22); lg.addColorStop(0, '#ff6b6b'); lg.addColorStop(1, '#a51d1d');
    ctx.fillStyle = lg; ctx.fill(); ctx.stroke();

    // ---- Cabeça
    ball(ctx, 0.5, -33, 9.5, 9, '#f2c094', { lw: 1.4 });
    // bochecha
    ctx.save(); ctx.globalAlpha = 0.4; ellPath(ctx, 5, -30, 2.5, 1.6); ctx.fillStyle = '#ff8787'; ctx.fill(); ctx.restore();
    // olhos / expressão
    var blink = (t % 180) < 6 ? 1 : 0;
    var lookY = !onG ? (vy < 0 ? -0.6 : 0.6) : 0;
    if (whip > 0) {
      eye(ctx, 4.5, -34, 2.7, 0.8, 0, { angry: 1 });
      eye(ctx, -1, -34, 2.5, 0.8, 0, { angry: 1 });
    } else {
      eye(ctx, 4.5, -34, 2.8, 0.5, lookY, { blink: blink });
      eye(ctx, -1, -34, 2.6, 0.5, lookY, { blink: blink });
    }
    // boca
    ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.lineCap = 'round';
    ctx.beginPath();
    if (whip > 0 || (!onG && vy < -2)) { ellPath(ctx, 4, -28.5, 1.8, 1.5); ctx.fillStyle = '#7a1f1f'; ctx.fill(); ctx.stroke(); }
    else if (gliding) { ctx.arc(4, -29.5, 2, 0.1, Math.PI - 0.1); ctx.stroke(); }
    else { ctx.arc(4, -30, 2.4, 0.3, Math.PI - 0.6); ctx.stroke(); }

    // ---- Chapéu de couro meia-lua
    ctx.save();
    ctx.translate(0.5, -40);
    ctx.rotate(running ? -0.06 : (!onG ? -0.1 : 0));
    var hg = ctx.createLinearGradient(0, -10, 0, 4);
    hg.addColorStop(0, '#c98a4b'); hg.addColorStop(0.55, '#8a4f22'); hg.addColorStop(1, '#4a2810');
    // aba meia-lua
    ctx.beginPath();
    ctx.moveTo(-15, 1);
    ctx.quadraticCurveTo(-17, -9, -11, -5);
    ctx.quadraticCurveTo(0, 3, 11, -5);
    ctx.quadraticCurveTo(17, -9, 15, 1);
    ctx.quadraticCurveTo(0, 7, -15, 1);
    ctx.closePath(); ctx.fillStyle = hg; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = OUT; ctx.stroke();
    // copa
    ctx.beginPath(); ctx.moveTo(-8, -1); ctx.quadraticCurveTo(-8, -12, 0, -12); ctx.quadraticCurveTo(8, -12, 8, -1); ctx.closePath();
    ctx.fillStyle = hg; ctx.fill(); ctx.stroke();
    // costura dourada
    ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(-13, 0.5); ctx.quadraticCurveTo(0, 5.5, 13, 0.5); ctx.stroke();
    // medalhões 3D
    for (var m = -1; m <= 1; m++) {
      var mx = m * 5, my = -2 + Math.abs(m) * 0.5;
      ball(ctx, mx, my, 1.8, 1.8, '#ffd43b', { lw: 0.7, rim: false });
      ctx.fillStyle = '#fffbe0'; ellPath(ctx, mx - 0.5, my - 0.6, 0.6, 0.6); ctx.fill();
    }
    star5(ctx, 0, -6, 2.3, '#ffd43b');
    ctx.restore();

    // ---- Arco do chicote
    if (whip > 0) {
      var prog = clamp(1 - whip / 15, 0, 1);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var reach = 34;
      var a0 = -1.6 + prog * 0.4, a1 = -1.6 + prog * 2.2;
      ctx.lineCap = 'round';
      for (var k = 0; k < 3; k++) {
        ctx.strokeStyle = k === 0 ? 'rgba(255,140,40,0.35)' : (k === 1 ? 'rgba(255,200,60,0.6)' : 'rgba(255,250,220,0.9)');
        ctx.lineWidth = 7 - k * 2.5;
        ctx.beginPath(); ctx.arc(6, -20, reach - k, a0, a1); ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = '#5a3416'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(6, -20);
      ctx.quadraticCurveTo(6 + Math.cos(a1 - 0.5) * reach * 0.6, -20 + Math.sin(a1 - 0.5) * reach * 0.6, 6 + Math.cos(a1) * reach, -20 + Math.sin(a1) * reach);
      ctx.stroke();
      star5(ctx, 6 + Math.cos(a1) * reach, -20 + Math.sin(a1) * reach, 3, '#ffd43b');
    }
    ctx.restore();
  }

  function drawLeg(ctx, x, swing, air) {
    ctx.save();
    ctx.translate(x, -10);
    ctx.rotate(swing * 0.08);
    var lg = ctx.createLinearGradient(-3, 0, 3, 0);
    lg.addColorStop(0, '#5e3416'); lg.addColorStop(0.5, '#8a5428'); lg.addColorStop(1, '#3e2210');
    rrPath(ctx, -3, 0, 6, 7, 2.5); ctx.fillStyle = lg; ctx.fill(); ctx.lineWidth = 1.1; ctx.strokeStyle = OUT; ctx.stroke();
    // bota arredondada
    var bg = ctx.createLinearGradient(0, 6, 0, 11);
    bg.addColorStop(0, '#6b3a17'); bg.addColorStop(1, '#2a160a');
    ctx.beginPath(); ctx.moveTo(-3.5, 6); ctx.lineTo(3, 6); ctx.quadraticCurveTo(7.5, 7, 7, 10.5); ctx.lineTo(-3.5, 10.5); ctx.quadraticCurveTo(-4.5, 8, -3.5, 6); ctx.closePath();
    ctx.fillStyle = bg; ctx.fill(); ctx.stroke();
    rrPath(ctx, -1, 7, 2.6, 1.8, 0.6); ctx.fillStyle = '#ffd43b'; ctx.fill();
    ctx.restore();
  }

  /* ======================================================= INIMIGOS HD */
  function drawEnemyHD(ctx, camX, camY, enemy, renderAlpha, frameCount) {
    if (!enemy) return;
    if (enemy.dead && !enemy.deathTimer) return;
    var t = num(frameCount, 0);
    var pos = interp(enemy, renderAlpha);
    var def = ENEMY_DEF_HD[enemy.type] || {};
    var w = num(enemy.w, def.w || 32), h = num(enemy.h, def.h || 28);
    var cx = pos.x - camX + w / 2, by = pos.y - camY + h;
    var dir = facingOf(enemy);
    var isBrBoss = !!(enemy.brawlBoss || enemy.isBrawlBoss);
    var S = isBrBoss ? 2.28 : 1.92;
    var col = enemy.color || def.color || '#888';
    var stunned = num(enemy.stunTimer, num(enemy.stunned === true ? 1 : enemy.stunned, num(enemy.dizzy === true ? 1 : enemy.dizzy, 0))) > 0;
    var hurt = num(enemy.hurtTimer, num(enemy.flash, 0)) > 0;

    // Indicador de alvo vermelho no chão estilo Brawl Stars (+ Anel de SUPER do Brawler Chefe!)
    if (G._oxeSpecialMode === 'brawlstars' && !enemy.dead) {
      ctx.save();
      if (isBrBoss && (enemy.superTelegraph || 0) > 0) {
        var stPct = 1 - clamp(enemy.superTelegraph / 36, 0, 1);
        ellPath(ctx, cx, by - 2, 42 + stPct * 72, 18 + stPct * 30);
        ctx.fillStyle = (Math.floor(t / 3) % 2 === 0) ? 'rgba(255,212,59,0.38)' : 'rgba(250,82,82,0.42)';
        ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = '#ffd43b'; ctx.stroke();
      }
      ellPath(ctx, cx, by - 2, isBrBoss ? 36 : 22, isBrBoss ? 14 : 9);
      ctx.fillStyle = isBrBoss ? 'rgba(250,82,82,0.34)' : 'rgba(255,146,43,0.26)';
      ctx.fill();
      ctx.lineWidth = isBrBoss ? 3 : 2;
      ctx.strokeStyle = isBrBoss ? '#fa5252' : '#ff922b';
      ctx.stroke();
      ctx.restore();
    } else if (!def.fly) {
      groundShadow(ctx, cx, by + 1, w * S * 0.8, 0.28);
    }

    // Fantasma de Pac-Oxe quando energizado (fica azul assustado em 2.5D com chapéu de couro!)
    var pacScared = Math.max(num(enemy.scaredTimer, 0), num(G._pacPowerTimer, 0));
    if ((enemy.pacGhost || enemy.isPacGhost) && pacScared > 0 && !enemy.dead) {
      ctx.save();
      ctx.translate(cx + Math.sin(t * 0.45) * 1.5, by - h * 0.65);
      var flashBlue = (pacScared < 120 && Math.floor(t / 8) % 2 === 0) ? '#f8f9fa' : '#1c7ed6';
      // Sombra 3D no piso do labirinto
      ctx.fillStyle = 'rgba(0,0,0,0.38)';
      ellPath(ctx, 3, 18, 20, 7); ctx.fill();
      // Corpo 3D de Fantasma Assombrado
      ball(ctx, 3, -3, 22, 22, '#0b3c78', { lw: 1.5, rim: false });
      ball(ctx, 0, -6, 22, 22, flashBlue, { lw: 2.2 });
      // Chapéu de Couro Nordestino no topo do fantasma
      roundBox(ctx, -14, -29, 28, 6, 3, '#8a4f22');
      ctx.fillStyle = '#ffd43b'; ctx.fillRect(-8, -28, 16, 2);
      ctx.fillStyle = '#fff'; ellPath(ctx, -7, -10, 4.2, 4.2); ctx.fill(); ellPath(ctx, 7, -10, 4.2, 4.2); ctx.fill();
      ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(-10, 2); ctx.lineTo(-5, -2); ctx.lineTo(0, 2); ctx.lineTo(5, -2); ctx.lineTo(10, 2); ctx.stroke();
      ctx.restore();
      return;
    }

    // Aura 2.5D, sombra 3D e chapéu de cangaceiro dos 4 Fantasmas do Pac-Oxe quando normais
    if ((enemy.pacGhost || enemy.isPacGhost) && !enemy.dead) {
      ctx.save();
      var gCol = enemy.ghostColor || '#ff6b6b';
      ctx.globalAlpha = 0.36;
      ellPath(ctx, cx, by - h * 0.55, 30, 30);
      ctx.fillStyle = gCol;
      ctx.fill();
      ctx.globalAlpha = 0.92;
      if (enemy.ghostName) {
        ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
        ctx.fillStyle = '#fff3bf'; ctx.strokeStyle = '#1e120a'; ctx.lineWidth = 2.5;
        ctx.strokeText(enemy.ghostName, cx, by - h - 10);
        ctx.fillText(enemy.ghostName, cx, by - h - 10);
      }
      ctx.restore();
    }

    // Versão em blocos 3D estilo Minecraft (OxeCraft)
    if (G._oxeSpecialMode === 'minecraft' && !enemy.dead) {
      ctx.save();
      ctx.translate(cx, by);
      ctx.scale(S * dir, S);
      ctx.fillStyle = shade(col, -0.25);
      ctx.fillRect(-w * 0.36 + 3, -h * 0.86 + 3, w * 0.72, h * 0.72);
      ctx.fillStyle = col;
      ctx.fillRect(-w * 0.36, -h * 0.86, w * 0.72, h * 0.72);
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.5;
      ctx.strokeRect(-w * 0.36, -h * 0.86, w * 0.72, h * 0.72);
      ctx.fillStyle = '#111';
      ctx.fillRect(w * 0.06, -h * 0.68, 4, 4);
      ctx.fillRect(w * 0.22, -h * 0.68, 4, 4);
      ctx.fillRect(w * 0.1, -h * 0.48, 8, 5);
      ctx.fillStyle = shade(col, -0.35);
      ctx.fillRect(-w * 0.25, -h * 0.14, 6, h * 0.14);
      ctx.fillRect(w * 0.12, -h * 0.14, 6, h * 0.14);
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.translate(cx, by);
    if (enemy.dead) { ctx.globalAlpha = clamp(num(enemy.deathTimer, 10) / 20, 0, 1); ctx.scale(1, -1); ctx.translate(0, h); }
    ctx.scale(S * dir, S);
    var fn = DRAWERS[enemy.type] || drawGenericEnemy;
    fn(ctx, w, h, col, t, enemy, def);
    if (hurt && Math.floor(t / 3) % 2 === 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5;
      ellPath(ctx, 0, -h / 2, w * 0.5, h * 0.55); ctx.fillStyle = '#ffffff'; ctx.fill();
    }
    ctx.restore();
    if (stunned) dizzyStars(ctx, cx, by - h * S - 4, t);
    if ((enemy.pacGhost || enemy.isPacGhost) && enemy.ghostName && !enemy.dead) {
      ctx.save();
      ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
      ctx.strokeStyle = OUT; ctx.lineWidth = 2.5;
      ctx.strokeText(enemy.ghostName, cx, by - h * S - 8);
      ctx.fillStyle = enemy.ghostColor || '#ffd43b';
      ctx.fillText(enemy.ghostName, cx, by - h * S - 8);
      ctx.restore();
    }
    // Barra de vida e nome em cima dos inimigos na Arena Oxe-Stars (estilo Brawl Stars)
    if (G._oxeSpecialMode === 'brawlstars' && !enemy.dead && enemy.maxHp) {
      var bbw = isBrBoss ? 86 : 48;
      var bpct = clamp((enemy.hp || 1) / enemy.maxHp, 0, 1);
      var bby = by - h * S - (isBrBoss ? 22 : 12);
      var bName = enemy.name || enemy.brawlerName;
      roundBox(ctx, cx - bbw / 2, bby, bbw, isBrBoss ? 10 : 7, 4, '#212529');
      if (bpct > 0) roundBox(ctx, cx - bbw / 2 + 1, bby + 1, (bbw - 2) * bpct, isBrBoss ? 8 : 5, 3, isBrBoss ? '#fa5252' : '#ff922b');
      if (isBrBoss && bName) {
        ctx.save();
        ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
        ctx.strokeStyle = OUT; ctx.lineWidth = 3;
        ctx.strokeText(bName, cx, bby - 4);
        ctx.fillStyle = '#ffe066'; ctx.fillText(bName, cx, bby - 4);
        ctx.restore();
      }
    }
  }

  function legsPair(ctx, y, spread, len, col, t, sp) {
    for (var i = -1; i <= 1; i += 2) {
      var a = Math.sin(t * (sp || 0.25) + (i > 0 ? Math.PI : 0)) * 0.4;
      ctx.save(); ctx.translate(i * spread, y); ctx.rotate(a);
      rrPath(ctx, -2.2, 0, 4.4, len, 2.2); ctx.fillStyle = shade(col, -0.25); ctx.fill();
      ctx.lineWidth = 1.2; ctx.strokeStyle = OUT; ctx.stroke();
      ball(ctx, 0.8, len, 3, 2, shade(col, -0.35), { lw: 1, rim: false });
      ctx.restore();
    }
  }

  function drawGenericEnemy(ctx, w, h, col, t, e) {
    var sq = 1 + Math.sin(t * 0.15) * 0.04;
    legsPair(ctx, -h * 0.25, w * 0.22, h * 0.25, col, t);
    ball(ctx, 0, -h * 0.52, w * 0.5 * sq, h * 0.45 / sq, col);
    eye(ctx, w * 0.18, -h * 0.62, w * 0.12, 0.6, 0, { blink: (t % 150) < 5 ? 1 : 0 });
    eye(ctx, -w * 0.04, -h * 0.62, w * 0.11, 0.6, 0, { blink: (t % 150) < 5 ? 1 : 0 });
  }

  var DRAWERS = {
    calango: function (ctx, w, h, col, t) {
      var wag = Math.sin(t * 0.25) * 4;
      ctx.beginPath(); ctx.moveTo(-w * 0.3, -h * 0.4); ctx.quadraticCurveTo(-w * 0.6, -h * 0.5 + wag, -w * 0.75, -h * 0.2 + wag);
      ctx.lineWidth = 4; ctx.strokeStyle = shade(col, -0.2); ctx.lineCap = 'round'; ctx.stroke();
      legsPair(ctx, -h * 0.3, w * 0.25, h * 0.3, col, t, 0.4);
      ball(ctx, -w * 0.05, -h * 0.45, w * 0.36, h * 0.3, col);
      ball(ctx, w * 0.32, -h * 0.6, w * 0.2, h * 0.26, col);
      eye(ctx, w * 0.38, -h * 0.72, w * 0.09, 0.8, 0);
      for (var i = 0; i < 3; i++) { ellPath(ctx, -w * 0.15 + i * w * 0.1, -h * 0.66, 2, 1.5); ctx.fillStyle = '#ffd43b'; ctx.fill(); }
    },
    tatu: function (ctx, w, h, col, t, e) {
      var roll = e.rolling || e.state === 'roll';
      if (roll) { ctx.rotate(t * 0.3); ball(ctx, 0, -h * 0.5, h * 0.45, h * 0.45, col); for (var i = 0; i < 4; i++) { ctx.rotate(Math.PI / 4); ctx.beginPath(); ctx.moveTo(-h * 0.4, -h * 0.5); ctx.lineTo(h * 0.4, -h * 0.5); ctx.strokeStyle = shade(col, -0.35); ctx.lineWidth = 1.4; ctx.stroke(); } return; }
      legsPair(ctx, -h * 0.2, w * 0.22, h * 0.2, col, t);
      ball(ctx, -w * 0.05, -h * 0.5, w * 0.45, h * 0.42, col);
      for (var b = -2; b <= 2; b++) { ctx.beginPath(); ctx.arc(-w * 0.05 + b * w * 0.12, -h * 0.4, h * 0.42, -Math.PI * 0.8, -Math.PI * 0.2); ctx.strokeStyle = shade(col, -0.35); ctx.lineWidth = 1.2; ctx.stroke(); }
      ball(ctx, w * 0.38, -h * 0.4, w * 0.16, h * 0.2, shade(col, 0.15));
      eye(ctx, w * 0.42, -h * 0.48, w * 0.07, 0.6, 0);
    },
    escorpiao: function (ctx, w, h, col, t) {
      legsPair(ctx, -h * 0.2, w * 0.3, h * 0.2, col, t, 0.5);
      legsPair(ctx, -h * 0.2, w * 0.15, h * 0.2, col, t + 5, 0.5);
      ball(ctx, 0, -h * 0.4, w * 0.36, h * 0.26, col);
      var tw = Math.sin(t * 0.1) * 0.2;
      ctx.save(); ctx.translate(-w * 0.3, -h * 0.45);
      for (var i = 0; i < 4; i++) { ctx.rotate(-0.55 + tw); ball(ctx, -3, -4, 4.5 - i * 0.4, 4.5 - i * 0.4, col, { lw: 1.2, rim: false }); ctx.translate(-2, -6); }
      ctx.beginPath(); ctx.moveTo(-2, -2); ctx.lineTo(4, -8); ctx.lineTo(2, 0); ctx.closePath(); ctx.fillStyle = '#fff3bf'; ctx.fill(); ctx.stroke();
      ctx.restore();
      ball(ctx, w * 0.45, -h * 0.5, 5, 4, shade(col, 0.1), { lw: 1.2 });
      eye(ctx, w * 0.18, -h * 0.55, w * 0.08, 0.7, 0, { angry: 1 });
    },
    urubu: function (ctx, w, h, col, t) { drawBird(ctx, w, h, col, t, '#e8a090', false); },
    carcara: function (ctx, w, h, col, t) { drawBird(ctx, w, h, col, t, '#fab005', true); },
    morcego: function (ctx, w, h, col, t) {
      var f = Math.sin(t * 0.5) * 0.6;
      for (var s = -1; s <= 1; s += 2) {
        ctx.save(); ctx.scale(s, 1); ctx.rotate(f * s * 0 + f);
        ctx.beginPath(); ctx.moveTo(4, -h * 0.55); ctx.quadraticCurveTo(w * 0.5, -h * 1.0, w * 0.7, -h * 0.5);
        ctx.quadraticCurveTo(w * 0.5, -h * 0.55, w * 0.45, -h * 0.35); ctx.quadraticCurveTo(w * 0.3, -h * 0.45, 4, -h * 0.4); ctx.closePath();
        ctx.fillStyle = shade(col, -0.2); ctx.fill(); ctx.lineWidth = 1.3; ctx.strokeStyle = OUT; ctx.stroke(); ctx.restore();
      }
      ball(ctx, 0, -h * 0.5, w * 0.28, h * 0.32, col);
      ctx.beginPath(); ctx.moveTo(-6, -h * 0.75); ctx.lineTo(-3, -h * 0.95); ctx.lineTo(-1, -h * 0.75); ctx.moveTo(6, -h * 0.75); ctx.lineTo(3, -h * 0.95); ctx.lineTo(1, -h * 0.75); ctx.fillStyle = col; ctx.fill(); ctx.stroke();
      eye(ctx, 4, -h * 0.55, 3, 0.5, 0.3, { iris: '#c92a2a' }); eye(ctx, -3, -h * 0.55, 3, 0.5, 0.3, { iris: '#c92a2a' });
    },
    caranguejo: function (ctx, w, h, col, t) {
      legsPair(ctx, -h * 0.25, w * 0.32, h * 0.25, col, t, 0.6);
      ball(ctx, 0, -h * 0.45, w * 0.42, h * 0.3, col);
      for (var s = -1; s <= 1; s += 2) {
        var sn = Math.sin(t * 0.2 + s) * 0.2;
        ctx.save(); ctx.translate(s * w * 0.45, -h * 0.6); ctx.rotate(sn * s);
        ball(ctx, s * 4, -4, 6, 5, shade(col, 0.1), { lw: 1.2 });
        ctx.restore();
      }
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-4, -h * 0.7); ctx.lineTo(-5, -h * 0.95); ctx.moveTo(4, -h * 0.7); ctx.lineTo(5, -h * 0.95); ctx.stroke();
      eye(ctx, -5, -h * 0.98, 3, 0, 0); eye(ctx, 5, -h * 0.98, 3, 0, 0);
    },
    jacare: function (ctx, w, h, col, t) {
      legsPair(ctx, -h * 0.25, w * 0.25, h * 0.25, col, t, 0.2);
      ball(ctx, -w * 0.1, -h * 0.45, w * 0.4, h * 0.35, col);
      var jaw = Math.max(0, Math.sin(t * 0.08)) * 0.3;
      ctx.save(); ctx.translate(w * 0.2, -h * 0.5);
      ctx.rotate(-jaw); roundBox(ctx, 0, -6, w * 0.38, 7, 4, col); ctx.restore();
      ctx.save(); ctx.translate(w * 0.2, -h * 0.5); ctx.rotate(jaw * 0.5); roundBox(ctx, 0, 0, w * 0.34, 6, 3, shade(col, -0.1));
      ctx.fillStyle = '#fff'; for (var i = 4; i < w * 0.32; i += 4) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 1.5, -2.5); ctx.lineTo(i + 3, 0); ctx.fill(); } ctx.restore();
      eye(ctx, w * 0.15, -h * 0.85, 3.5, 0.6, 0, { iris: '#f59f00', angry: 1 });
      for (var b = -3; b <= 1; b++) { ball(ctx, b * 6, -h * 0.78, 2.2, 1.8, shade(col, -0.2), { lw: 0.8, rim: false }); }
    },
    cacto_atirador: function (ctx, w, h, col, t, e) {
      var pulse = (e && e.shootTimer !== undefined && e.shootTimer < 15) ? 1.08 : 1;
      roundBox(ctx, -w * 0.22, -h * 0.95 * pulse, w * 0.44, h * 0.95 * pulse, w * 0.2, col);
      for (var s = -1; s <= 1; s += 2) {
        roundBox(ctx, s > 0 ? w * 0.2 : -w * 0.42, -h * 0.6, w * 0.22, h * 0.12, 4, col);
        roundBox(ctx, s > 0 ? w * 0.32 : -w * 0.42, -h * 0.85, w * 0.12, h * 0.3, 4, col);
      }
      ctx.strokeStyle = shade(col, -0.35); ctx.lineWidth = 1;
      for (var i = 0; i < 6; i++) { var yy = -h * 0.85 + i * h * 0.13; ctx.beginPath(); ctx.moveTo(-w * 0.26, yy); ctx.lineTo(-w * 0.32, yy - 2); ctx.moveTo(w * 0.26, yy); ctx.lineTo(w * 0.32, yy - 2); ctx.stroke(); }
      ball(ctx, 0, -h * 0.98, 4, 3, '#ff6b9d', { lw: 1 });
      eye(ctx, -w * 0.08, -h * 0.65, w * 0.08, 0.5, 0, { angry: 1 }); eye(ctx, w * 0.1, -h * 0.65, w * 0.08, 0.5, 0, { angry: 1 });
    },
    bode_doido: function (ctx, w, h, col, t, e) {
      var charge = e && (e.state === 'charge' || e.charging);
      legsPair(ctx, -h * 0.3, w * 0.25, h * 0.3, col, t * (charge ? 2 : 1));
      ball(ctx, -w * 0.05, -h * 0.55, w * 0.42, h * 0.3, col);
      ball(ctx, w * 0.35, -h * 0.72, w * 0.18, h * 0.2, shade(col, 0.1));
      ctx.beginPath(); ctx.moveTo(w * 0.28, -h * 0.88); ctx.quadraticCurveTo(w * 0.1, -h * 1.15, -w * 0.05, -h * 0.9);
      ctx.lineWidth = 4; ctx.strokeStyle = '#ced4da'; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineWidth = 1.2; ctx.strokeStyle = OUT; ctx.stroke();
      ball(ctx, w * 0.42, -h * 0.5, 3, 4, '#f1f3f5', { lw: 0.8, rim: false });
      eye(ctx, w * 0.4, -h * 0.78, w * 0.07, 0.7, 0, { angry: charge ? 1 : 0, iris: '#f59f00' });
    },
    fulozinha: function (ctx, w, h, col, t) {
      var bob = Math.sin(t * 0.12) * 3;
      ctx.translate(0, bob);
      ctx.beginPath(); ctx.moveTo(-w * 0.35, -h * 0.1); ctx.quadraticCurveTo(0, -h * 0.55, w * 0.35, -h * 0.1); ctx.closePath();
      ctx.fillStyle = shade(col, -0.1); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.3; ctx.stroke();
      ball(ctx, 0, -h * 0.4, w * 0.22, h * 0.22, col);
      ball(ctx, 0, -h * 0.72, w * 0.24, h * 0.22, '#ffd8a8');
      for (var i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 4, -h * 0.9); ctx.quadraticCurveTo(i * 8, -h * 0.6, i * 7, -h * 0.35); ctx.strokeStyle = '#2b8a3e'; ctx.lineWidth = 2.5; ctx.stroke(); }
      eye(ctx, -4, -h * 0.74, 3, 0.4, 0, { iris: '#37b24d' }); eye(ctx, 5, -h * 0.74, 3, 0.4, 0, { iris: '#37b24d' });
    },
    papa_figo: function (ctx, w, h, col, t) {
      legsPair(ctx, -h * 0.3, w * 0.18, h * 0.3, '#5c3d2e', t);
      roundBox(ctx, -w * 0.3, -h * 0.75, w * 0.6, h * 0.48, 8, col);
      ball(ctx, -w * 0.35, -h * 0.55, w * 0.22, h * 0.26, '#a87d4f');
      ball(ctx, w * 0.05, -h * 0.85, w * 0.22, h * 0.18, '#e0b48a');
      ctx.beginPath(); ctx.ellipse(w * 0.05, -h * 0.95, w * 0.3, h * 0.06, 0, 0, Math.PI * 2); ctx.fillStyle = '#5c3d2e'; ctx.fill(); ctx.stroke();
      eye(ctx, w * 0.12, -h * 0.86, 3, 0.6, 0, { angry: 1, iris: '#c92a2a' });
      ctx.beginPath(); ctx.arc(w * 0.1, -h * 0.78, 3, 0.2, Math.PI - 0.2); ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.stroke();
    },
    baiacu: function (ctx, w, h, col, t, e) {
      var inf = (e && e.inflated) ? 1.35 : 1 + Math.sin(t * 0.1) * 0.05;
      ctx.beginPath(); ctx.moveTo(-w * 0.35 * inf, -h * 0.5); ctx.lineTo(-w * 0.6, -h * 0.75); ctx.lineTo(-w * 0.6, -h * 0.25); ctx.closePath();
      ctx.fillStyle = shade(col, -0.15); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.stroke();
      ball(ctx, 0, -h * 0.5, w * 0.4 * inf, h * 0.4 * inf, col);
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.2;
      for (var a = 0; a < 12; a++) { var an = a / 12 * Math.PI * 2, r = w * 0.4 * inf; ctx.beginPath(); ctx.moveTo(Math.cos(an) * r, -h * 0.5 + Math.sin(an) * r); ctx.lineTo(Math.cos(an) * (r + 4), -h * 0.5 + Math.sin(an) * (r + 4)); ctx.stroke(); }
      eye(ctx, w * 0.18, -h * 0.6, w * 0.1, 0.5, 0); eye(ctx, w * 0.02, -h * 0.6, w * 0.09, 0.5, 0);
    },
    salamandra: function (ctx, w, h, col, t) {
      var wag = Math.sin(t * 0.3) * 5;
      ctx.beginPath(); ctx.moveTo(-w * 0.25, -h * 0.35); ctx.quadraticCurveTo(-w * 0.55, -h * 0.3 + wag, -w * 0.7, -h * 0.45 + wag);
      ctx.lineWidth = 5; ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.stroke();
      legsPair(ctx, -h * 0.25, w * 0.22, h * 0.25, col, t, 0.5);
      ball(ctx, 0, -h * 0.4, w * 0.35, h * 0.24, col);
      ball(ctx, w * 0.35, -h * 0.5, w * 0.18, h * 0.18, col);
      for (var i = 0; i < 4; i++) ball(ctx, -w * 0.2 + i * w * 0.12, -h * 0.55, 2.5, 2, '#ffd43b', { lw: 0.6, rim: false });
      eye(ctx, w * 0.4, -h * 0.58, w * 0.08, 0.7, 0, { iris: '#e8590c' });
    },
    sapo_cururu: function (ctx, w, h, col, t, e) {
      var jump = e && !e.onGround ? 1 : 0;
      legsPair(ctx, -h * 0.15, w * 0.3, h * (0.15 + jump * 0.2), shade(col, -0.1), t, 0.2);
      ball(ctx, 0, -h * 0.42, w * 0.46, h * 0.36, col);
      ball(ctx, 0, -h * 0.3, w * 0.32, h * 0.18, shade(col, 0.35), { rim: false });
      eye(ctx, -w * 0.18, -h * 0.78, w * 0.12, 0.3, -0.2); eye(ctx, w * 0.18, -h * 0.78, w * 0.12, 0.3, -0.2);
      ctx.beginPath(); ctx.arc(0, -h * 0.5, w * 0.25, 0.2, Math.PI - 0.2); ctx.strokeStyle = OUT; ctx.lineWidth = 1.4; ctx.stroke();
    },
    marimbondo: function (ctx, w, h, col, t) {
      var f = Math.sin(t * 1.2) * 0.5;
      for (var s = -1; s <= 1; s += 2) { ctx.save(); ctx.translate(-2, -h * 0.75); ctx.rotate(s * (0.5 + f)); ellPath(ctx, 0, -6, 4, 8); ctx.fillStyle = 'rgba(220,240,255,0.7)'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.8; ctx.stroke(); ctx.restore(); }
      ball(ctx, -w * 0.15, -h * 0.5, w * 0.3, h * 0.24, '#fab005');
      ctx.strokeStyle = '#212529'; ctx.lineWidth = 3; for (var i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(-w * 0.15 + i * 6, -h * 0.7); ctx.lineTo(-w * 0.15 + i * 6, -h * 0.3); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(-w * 0.45, -h * 0.5); ctx.lineTo(-w * 0.6, -h * 0.45); ctx.lineTo(-w * 0.45, -h * 0.42); ctx.fillStyle = '#212529'; ctx.fill();
      ball(ctx, w * 0.22, -h * 0.55, w * 0.16, h * 0.16, col);
      eye(ctx, w * 0.26, -h * 0.6, w * 0.07, 0.6, 0, { angry: 1 });
    },
    jararaca: function (ctx, w, h, col, t) {
      ctx.lineCap = 'round';
      ctx.beginPath(); for (var i = 0; i <= 10; i++) { var x = -w * 0.5 + i * w * 0.07, y = -h * 0.25 + Math.sin(t * 0.2 + i * 0.8) * 3; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.lineWidth = h * 0.3; ctx.strokeStyle = OUT; ctx.stroke(); ctx.lineWidth = h * 0.24; ctx.strokeStyle = col; ctx.stroke();
      ctx.lineWidth = h * 0.08; ctx.strokeStyle = shade(col, 0.3); ctx.setLineDash([3, 5]); ctx.stroke(); ctx.setLineDash([]);
      ball(ctx, w * 0.3, -h * 0.4, w * 0.17, h * 0.2, col);
      ctx.beginPath(); ctx.moveTo(w * 0.45, -h * 0.35); ctx.lineTo(w * 0.58, -h * 0.38 + Math.sin(t * 0.6) * 2); ctx.strokeStyle = '#e03131'; ctx.lineWidth = 1.2; ctx.stroke();
      eye(ctx, w * 0.34, -h * 0.48, w * 0.06, 0.6, 0, { angry: 1, iris: '#fab005' });
    },
    cangaceiro_sombra: function (ctx, w, h, col, t) {
      ctx.globalAlpha *= 0.8 + Math.sin(t * 0.1) * 0.15;
      legsPair(ctx, -h * 0.3, w * 0.18, h * 0.3, shade(col, -0.2), t);
      roundBox(ctx, -w * 0.28, -h * 0.75, w * 0.56, h * 0.48, 7, col);
      ctx.beginPath(); ctx.moveTo(-w * 0.28, -h * 0.72); ctx.lineTo(w * 0.28, -h * 0.4); ctx.strokeStyle = '#a87d4f'; ctx.lineWidth = 3; ctx.stroke();
      ball(ctx, 0, -h * 0.85, w * 0.2, h * 0.15, shade(col, 0.2));
      ctx.beginPath(); ctx.moveTo(-w * 0.45, -h * 0.92); ctx.quadraticCurveTo(0, -h * 1.25, w * 0.45, -h * 0.92); ctx.closePath();
      ctx.fillStyle = '#5c3d2e'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.3; ctx.stroke();
      ball(ctx, 0, -h * 1.05, 3, 3, '#fab005', { lw: 0.8 });
      eye(ctx, -4, -h * 0.85, 2.5, 0.5, 0, { iris: '#ff6b6b', angry: 1 }); eye(ctx, 5, -h * 0.85, 2.5, 0.5, 0, { iris: '#ff6b6b', angry: 1 });
    },
    mula_sem_cabeca: function (ctx, w, h, col, t) {
      legsPair(ctx, -h * 0.35, w * 0.3, h * 0.35, col, t * 1.5);
      ball(ctx, -w * 0.05, -h * 0.6, w * 0.45, h * 0.28, col);
      ball(ctx, w * 0.35, -h * 0.75, w * 0.12, h * 0.15, shade(col, -0.1));
      for (var i = 0; i < 5; i++) { var fl = Math.sin(t * 0.4 + i) * 4; ball(ctx, w * 0.38 + i * 1.5, -h * 0.95 - i * 4 + fl * 0.3, 6 - i, 7 - i, i % 2 ? '#ffd43b' : '#ff922b', { lw: 0.6, rim: false }); }
      ctx.beginPath(); ctx.moveTo(-w * 0.45, -h * 0.65); ctx.quadraticCurveTo(-w * 0.65, -h * 0.5 + Math.sin(t * 0.3) * 4, -w * 0.6, -h * 0.3); ctx.strokeStyle = '#ff922b'; ctx.lineWidth = 3; ctx.stroke();
    },
    boitata_fogo: function (ctx, w, h, col, t) {
      for (var i = 6; i >= 0; i--) {
        var x = -w * 0.45 + i * w * 0.13, y = -h * 0.45 + Math.sin(t * 0.25 + i * 0.9) * 5, r = h * (0.16 + i * 0.02);
        ball(ctx, x, y, r * 1.3, r * 1.3, 'rgba(255,146,43,0.35)', { lw: 0, rim: false });
        ball(ctx, x, y, r, r, i % 2 ? '#ff922b' : col, { lw: 1 });
      }
      var hy = -h * 0.45 + Math.sin(t * 0.25 + 6.3) * 5;
      eye(ctx, w * 0.42, hy - 4, 4, 0.5, 0, { iris: '#fff3bf' }); eye(ctx, w * 0.32, hy - 4, 3.5, 0.5, 0, { iris: '#fff3bf' });
    },
    lobisomem: function (ctx, w, h, col, t) {
      legsPair(ctx, -h * 0.3, w * 0.22, h * 0.3, shade(col, -0.15), t);
      ball(ctx, 0, -h * 0.55, w * 0.38, h * 0.3, col);
      ball(ctx, w * 0.12, -h * 0.85, w * 0.24, h * 0.18, col);
      ball(ctx, w * 0.32, -h * 0.8, w * 0.14, h * 0.09, shade(col, 0.15));
      ctx.beginPath(); ctx.moveTo(0, -h * 0.95); ctx.lineTo(-w * 0.04, -h * 1.12); ctx.lineTo(w * 0.1, -h * 0.98); ctx.moveTo(w * 0.15, -h * 0.98); ctx.lineTo(w * 0.18, -h * 1.12); ctx.lineTo(w * 0.26, -h * 0.95);
      ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(w * 0.3, -h * 0.74); ctx.lineTo(w * 0.32, -h * 0.68); ctx.lineTo(w * 0.35, -h * 0.74); ctx.fill();
      eye(ctx, w * 0.2, -h * 0.88, w * 0.07, 0.6, 0, { iris: '#fab005', angry: 1 });
    }
  };

  function drawBird(ctx, w, h, col, t, beakCol, crest) {
    var f = Math.sin(t * 0.35);
    for (var s = -1; s <= 1; s += 2) {
      ctx.save(); ctx.translate(-w * 0.05, -h * 0.55); ctx.rotate(s * 0.15 - f * 0.7);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-w * 0.3, -h * 0.6, -w * 0.55, -h * 0.2); ctx.quadraticCurveTo(-w * 0.3, -h * 0.05, 0, 4); ctx.closePath();
      ctx.fillStyle = shade(col, s > 0 ? -0.2 : 0); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.3; ctx.stroke(); ctx.restore();
    }
    ball(ctx, 0, -h * 0.5, w * 0.3, h * 0.26, col);
    ball(ctx, w * 0.28, -h * 0.68, w * 0.15, h * 0.16, crest ? shade(col, 0.3) : beakCol);
    if (crest) { ctx.beginPath(); ctx.moveTo(w * 0.2, -h * 0.8); ctx.lineTo(w * 0.15, -h * 0.98); ctx.lineTo(w * 0.3, -h * 0.82); ctx.fillStyle = shade(col, -0.3); ctx.fill(); ctx.strokeStyle = OUT; ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(w * 0.4, -h * 0.72); ctx.quadraticCurveTo(w * 0.55, -h * 0.68, w * 0.48, -h * 0.58); ctx.lineTo(w * 0.4, -h * 0.62); ctx.closePath();
    ctx.fillStyle = crest ? beakCol : '#495057'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.stroke();
    eye(ctx, w * 0.32, -h * 0.72, w * 0.06, 0.7, 0, { angry: crest ? 1 : 0 });
  }

  function drawBossHD(ctx, camX, camY, boss, renderAlpha, frameCount) {
    if (!boss || boss.dead && !boss.dying) return;
    var a = renderAlpha == null ? 1 : renderAlpha, t = frameCount || 0;
    var bx = (boss.prevX != null ? boss.prevX + (boss.x - boss.prevX) * a : boss.x) - camX;
    var by = (boss.prevY != null ? boss.prevY + (boss.y - boss.prevY) * a : boss.y) - camY;
    var w = boss.w || 64, h = boss.h || 64, kind = boss.type || boss.kind || (boss.constructor && boss.constructor.name) || 'BossBull';
    var S = 1.80, hurt = boss.hurtTimer > 0 || boss.invuln > 0;
    var aura = { BossBull: '#ff6b6b', BossFulozinha: '#69db7c', BossPapaFigo: '#b197fc', BossSerpente: '#38d9a9', BossGuardiaoBrasa: '#ff922b', BossSombraSeca: '#fcc419', BossCorpoSeco: '#c9b898', BossBoiEncantado: '#f06595' }[kind] || '#ffffff';
    var gx = bx + w / 2, gy = by + h;
    if (typeof groundShadow === 'function') groundShadow(ctx, gx, gy, w * 0.7 * S);
    ctx.save();
    var gr = ctx.createRadialGradient(gx, gy - h * 0.5, 4, gx, gy - h * 0.5, w * 1.1 * S);
    gr.addColorStop(0, aura + '55'); gr.addColorStop(1, aura + '00');
    ctx.fillStyle = gr; ctx.fillRect(gx - w * 1.2 * S, gy - h * 1.6 * S, w * 2.4 * S, h * 2 * S);
    ctx.translate(gx, gy); ctx.scale((boss.facing || boss.dir || 1) < 0 ? -S : S, S);
    if (hurt && (t >> 2) % 2) ctx.globalAlpha = 0.5;
    var sq = 1 + Math.sin(t * 0.1) * 0.03, ang = { angry: 1 };
    if (G.OxeArt3 && G.OxeArt3.drawBoss(ctx, kind, boss, w, h, t)) kind = '__done';
    switch (kind) {
      case '__done': break;
      case 'BossBull':
        legsPair(ctx, -h * 0.3, w * 0.3, h * 0.3, '#6b3d1e', t);
        ball(ctx, -w * 0.05, -h * 0.55, w * 0.5 * sq, h * 0.35 / sq, '#8b5a2b');
        ball(ctx, w * 0.38, -h * 0.65, w * 0.24, h * 0.24, '#7a4a22');
        ball(ctx, w * 0.5, -h * 0.55, w * 0.13, h * 0.1, '#e8a090');
        for (var s = -1; s <= 1; s += 2) { ctx.beginPath(); ctx.moveTo(w * 0.32, -h * 0.82); ctx.quadraticCurveTo(w * 0.2 + s * 6, -h * 1.15, w * 0.45 + s * 10, -h * 1.1); ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.strokeStyle = '#fff3bf'; ctx.stroke(); ctx.lineWidth = 1.2; ctx.strokeStyle = OUT; ctx.stroke(); }
        eye(ctx, w * 0.42, -h * 0.72, w * 0.06, 0.6, 0, { angry: 1, iris: '#c92a2a' });
        break;
      case 'BossFulozinha':
        ctx.translate(0, Math.sin(t * 0.08) * 6);
        for (var l = 0; l < 8; l++) { ctx.save(); ctx.translate(0, -h * 0.55); ctx.rotate(l / 8 * Math.PI * 2 + t * 0.02); ellPath(ctx, 0, -w * 0.5, w * 0.12, w * 0.25); ctx.fillStyle = l % 2 ? '#2f9e44' : '#51cf66'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.stroke(); ctx.restore(); }
        DRAWERS.fulozinha(ctx, w, h, '#69db7c', t);
        break;
      case 'BossPapaFigo':
        DRAWERS.papa_figo(ctx, w, h, '#5f3dc4', t);
        ball(ctx, -w * 0.4, -h * 0.3, w * 0.25, h * 0.3, '#a87d4f');
        break;
      case 'BossSerpente':
        DRAWERS.jararaca(ctx, w * 1.4, h, '#20c997', t);
        ctx.beginPath(); ctx.ellipse(w * 0.42, -h * 0.55, w * 0.25, h * 0.32, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(32,201,151,0.35)'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.stroke();
        break;
      case 'BossGuardiaoBrasa':
        for (var fl = 0; fl < 7; fl++) { var fx = -w * 0.4 + fl * w * 0.13, fh = h * (0.32 + Math.abs(Math.sin(t * 0.22 + fl)) * 0.22); ball(ctx, fx, -h * 0.88 - fh * 0.3, 8, fh * 0.52, fl % 2 ? '#ffd43b' : '#ff6b00', { lw: 0.8, rim: false }); }
        legsPair(ctx, -h * 0.3, w * 0.25, h * 0.3, '#5c2d0e', t);
        roundBox(ctx, -w * 0.42, -h * 0.85, w * 0.84, h * 0.58, 14, '#c2410c');
        // Cartucheiras cruzadas de cangaceiro de brasa + chapéu meia-lua em chamas
        ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-w * 0.34, -h * 0.8); ctx.lineTo(w * 0.34, -h * 0.34); ctx.moveTo(w * 0.34, -h * 0.8); ctx.lineTo(-w * 0.34, -h * 0.34); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-w * 0.46, -h * 0.86); ctx.quadraticCurveTo(0, -h * 1.18, w * 0.46, -h * 0.86); ctx.closePath();
        ctx.fillStyle = '#7c2d12'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
        star5(ctx, 0, -h * 0.96, 5, '#ffd43b');
        eye(ctx, -w * 0.12, -h * 0.68, w * 0.08, 0.5, 0, { angry: 1, iris: '#fff3bf' }); eye(ctx, w * 0.15, -h * 0.68, w * 0.08, 0.5, 0, { angry: 1, iris: '#fff3bf' });
        break;
      default:
        // Sombra da Seca: Coroa dos Nove Sóis + manto rachado do sertão
        ctx.save(); ctx.translate(0, -h * 0.95); ctx.rotate(t * 0.012);
        for (var r = 0; r < 9; r++) { ctx.rotate(TAU / 9); ctx.beginPath(); ctx.moveTo(w * 0.22, -4); ctx.lineTo(w * 0.46, 0); ctx.lineTo(w * 0.22, 4); ctx.fillStyle = r % 2 ? '#fcc419' : '#ff922b'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.stroke(); }
        ctx.restore();
        ctx.globalAlpha *= 0.92;
        DRAWERS.cangaceiro_sombra(ctx, w, h, '#2b2638', t);
    }
    if (boss.stunned && typeof dizzyStars === 'function') dizzyStars(ctx, 0, -h * 1.15, t);
    ctx.restore();
    if (boss.maxHp) {
      var bw = Math.max(80, w * 1.4), pct = Math.max(0, boss.hp / boss.maxHp);
      var bxx = gx - bw / 2, byy = by - h * (S - 1) - 22;
      roundBox(ctx, bxx - 2, byy - 2, bw + 4, 10, 5, '#212529');
      if (pct > 0) roundBox(ctx, bxx, byy, bw * pct, 6, 3, pct > 0.5 ? aura : pct > 0.25 ? '#fab005' : '#fa5252');
    }
  }

  function drawCollectibleHD(ctx, camX, camY, item, type, frameCount) {
    if (!item || item.collected) return;
    var t = frameCount || 0, w = item.w || 16, h = item.h || 16;
    var x = item.x - camX + w / 2, y = item.y - camY + h / 2 + Math.sin(t * 0.08 + item.x * 0.05) * 2;
    ctx.save(); ctx.translate(x, y);
    if (type !== 'flagpole') ctx.scale(1.22, 1.22);
    switch (type) {
      case 'rapadura':
        ctx.rotate(Math.sin(t * 0.05) * 0.15);
        roundBox(ctx, -w * 0.5, -h * 0.35, w, h * 0.7, 4, '#b5651d');
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-w * 0.35, -h * 0.25, w * 0.4, 2);
        break;
      case 'caju':
        ball(ctx, 0, 2, w * 0.4, h * 0.42, '#fa5252');
        ctx.beginPath(); ctx.moveTo(-w * 0.15, -h * 0.35); ctx.quadraticCurveTo(0, -h * 0.75, w * 0.2, -h * 0.4); ctx.fillStyle = '#8d6e3f'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.stroke();
        break;
      case 'star':
        ctx.rotate(t * 0.05); var sc = 1 + Math.sin(t * 0.15) * 0.1; ctx.scale(sc, sc);
        ctx.beginPath(); for (var i = 0; i < 10; i++) { var rr = i % 2 ? w * 0.25 : w * 0.55, an = i * Math.PI / 5 - Math.PI / 2; ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); } ctx.closePath();
        var g = ctx.createRadialGradient(-3, -3, 1, 0, 0, w * 0.6); g.addColorStop(0, '#fff9db'); g.addColorStop(1, '#fab005');
        ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.4; ctx.stroke();
        break;
      case 'checkpoint':
        var on = item.active || item.reached;
        ctx.fillStyle = '#868e96'; ctx.fillRect(-2, -h * 0.5, 4, h);
        ctx.beginPath(); ctx.moveTo(2, -h * 0.5); ctx.lineTo(w * 0.6, -h * 0.38 + Math.sin(t * 0.2) * 2); ctx.lineTo(2, -h * 0.22); ctx.closePath();
        ctx.fillStyle = on ? '#40c057' : '#fa5252'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.stroke();
        ball(ctx, 0, -h * 0.52, 4, 4, '#fcc419', { lw: 1 });
        break;
      case 'flagpole':
        ctx.translate(0, -y + item.y - camY + h / 2);
        roundBox(ctx, -3, -h * 0.5, 6, h, 3, '#dee2e6');
        ball(ctx, 0, -h * 0.5, 6, 6, '#fcc419');
        var wv = Math.sin(t * 0.15) * 4;
        ctx.beginPath(); ctx.moveTo(3, -h * 0.47); ctx.quadraticCurveTo(20, -h * 0.47 + wv, 36, -h * 0.42); ctx.lineTo(36, -h * 0.3); ctx.quadraticCurveTo(20, -h * 0.32 - wv, 3, -h * 0.3); ctx.closePath();
        ctx.fillStyle = '#40c057'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.stroke();
        ball(ctx, 19, -h * 0.385, 5, 4, '#fcc419', { lw: 0.8, rim: false });
        break;
      default:
        ball(ctx, 0, 0, w * 0.4, h * 0.4, '#fcc419');
    }
    ctx.globalAlpha = 0.6 + Math.sin(t * 0.2) * 0.4; ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-w * 0.15, -h * 0.2, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /* ======================================================= IA & OBSTÁCULOS HD */
  function updateNewEnemy(e, player, L, H) {
    if (!e || e.dead) return;
    H = H || {};
    var dx = player ? (player.x + (player.w || 28) / 2) - (e.x + (e.w || 32) / 2) : 999;
    var dy = player ? (player.y + (player.h || 44) / 2) - (e.y + (e.h || 32) / 2) : 999;
    switch (e.type) {
      case 'sapo_cururu':
        if (e.physics) e.physics();
        if (e.onGround) {
          e.vx *= 0.7;
          e.facing = Math.sign(dx) || e.facing || -1;
          var playerJumped = player && !player.onGround && player.vy < -2 && Math.abs(dx) < 280;
          if ((e.timer % 85 === 0 && Math.abs(dx) < 380) || (playerJumped && (e._hopCd || 0) <= 0)) {
            e.vy = -(e.hopPower || 9.2);
            e.vx = (Math.sign(dx) || -1) * 2.4;
            e.onGround = false;
            e._hopCd = 45;
            if (H.sfx) H.sfx('jump');
            if (H.spawnDust) H.spawnDust(e.x + e.w / 2, e.y + e.h, 5);
          }
        } else {
          e.x += e.vx;
        }
        if (e._hopCd > 0) e._hopCd--;
        break;
      case 'marimbondo':
        e.x = (e.baseX || e.x) + Math.sin(e.t * 0.04) * (e.range || 80);
        e.y = (e.baseY || e.y) + Math.sin(e.t * 0.09) * 22;
        e.facing = Math.cos(e.t * 0.04) >= 0 ? 1 : -1;
        if (Math.abs(dx) < 220 && Math.abs(dy) < 160 && e.timer % 110 === 0 && H.Projectile && H.projectiles) {
          var a = Math.atan2(dy, dx);
          H.projectiles.push(new H.Projectile(e.x + e.w / 2, e.y + e.h / 2, Math.cos(a) * 3.4, Math.sin(a) * 3.4, 'spine', { life: 90 }));
          if (H.sfx) H.sfx('bee');
        }
        break;
      case 'jararaca':
        if (e.physics) e.physics();
        if (e.onGround && Math.abs(dx) < 170 && Math.abs(dy) < 90 && (e._lungeCd || 0) <= 0) {
          e.vy = -7.8;
          e.vx = (Math.sign(dx) || -1) * 3.8;
          e.facing = Math.sign(dx) || -1;
          e._lungeCd = 75;
          if (H.sfx) H.sfx('whip');
        } else if (e.onGround && e.walk) {
          e.walk(e.speed || 1.3);
        } else {
          e.x += e.vx;
        }
        if (e._lungeCd > 0) e._lungeCd--;
        break;
      case 'cangaceiro_sombra':
        if (e.physics) e.physics();
        if (e.walk) e.walk(Math.abs(dx) < 240 ? (e.speed || 1.1) * 1.4 : (e.speed || 1.1));
        if (e.timer % 130 === 0 && Math.abs(dx) < 340 && H.Projectile && H.projectiles) {
          e.facing = Math.sign(dx) || -1;
          H.projectiles.push(new H.Projectile(e.x + e.w / 2, e.y + 16, e.facing * 3.6, -1.2, 'spine', { gravity: 0.05 }));
          if (H.sfx) H.sfx('whip');
        }
        break;
      case 'mula_sem_cabeca':
        if (e.physics) e.physics();
        if (e.walk) e.walk(Math.abs(dx) < 320 ? 2.6 : (e.speed || 2.0));
        if (e.onGround && e.timer % 75 === 0 && Math.abs(dx) < 300) {
          e.vy = -8.0;
          if (H.spawnSparks) H.spawnSparks(e.x + e.w / 2, e.y + 6, 6, '#FF922B');
        }
        break;
      case 'boitata_fogo':
        e.x = (e.baseX || e.x) + Math.sin(e.t * 0.03) * (e.range || 100);
        e.y = (e.baseY || e.y) + Math.cos(e.t * 0.06) * 28;
        e.facing = Math.sign(dx) || 1;
        if (e.timer % 120 === 0 && Math.abs(dx) < 380 && H.Projectile && H.projectiles) {
          H.projectiles.push(new H.Projectile(e.x + e.w / 2, e.y + e.h / 2, (Math.sign(dx) || -1) * 3.2, -1.5, 'ember', { gravity: 0.1 }));
          if (H.sfx) H.sfx('spine');
        }
        break;
      case 'lobisomem':
        if (e.physics) e.physics();
        if (e.onGround && Math.abs(dx) < 250 && (e._leapCd || 0) <= 0) {
          e.vy = -9.5;
          e.vx = (Math.sign(dx) || -1) * 3.4;
          e.facing = Math.sign(dx) || -1;
          e._leapCd = 80;
          if (H.sfx) H.sfx('bossRoar');
        } else if (e.onGround && e.walk) {
          e.walk(e.speed || 1.8);
        } else {
          e.x += e.vx;
        }
        if (e._leapCd > 0) e._leapCd--;
        break;
      default:
        if (e.physics) e.physics();
        if (e.walk) e.walk(e.speed || 1.2);
        break;
    }
  }

  function updateObstacles(L, player, keys, H) {
    if (!L || !player) return;
    H = H || {};
    var aabb = H.checkAABB || function (a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; };
    // 1. Tambores Zabumba Trampolim
    var tramps = L.trampolines || [];
    for (var i = 0; i < tramps.length; i++) {
      var tr = tramps[i];
      if (!tr) continue;
      if (tr.bounceAnim > 0) tr.bounceAnim--;
      if (player.vy >= 0 && aabb(player, tr) && player.y + player.h <= tr.y + 20) {
        player.vy = -(tr.power || 15.5);
        player.onGround = false;
        player.trampolineTimer = 26;
        tr.bounceAnim = 16;
        if (H.sfx) H.sfx('bonk');
        if (H.spawnDust) H.spawnDust(tr.x + tr.w / 2, tr.y, 8);
        if (H.floatText) H.floatText(tr.x + tr.w / 2, tr.y - 10, 'ZABUMBA! 🥁', '#FFD43B');
      }
    }
    // 2. Plataformas Móveis
    var mps = L.movingPlatforms || [];
    for (var j = 0; j < mps.length; j++) {
      var mp = mps[j];
      if (!mp || mp.managedByGame) continue; // v2.2: o game.js move as plataformas antes do Tonho
      mp.t = (mp.t || 0) + (mp.speed || 0.025);
      var prevX = mp.x, prevY = mp.y;
      var off = Math.sin(mp.t + (mp.phase || 0)) * (mp.range || 90);
      if (mp.axis === 'y') mp.y = (mp.origY != null ? mp.origY : mp.y) + off;
      else mp.x = (mp.origX != null ? mp.origX : mp.x) + off;
      mp.vx = mp.x - prevX;
      mp.vy = mp.y - prevY;
      if (player.onGround && Math.abs((player.y + player.h) - prevY) <= 6 && player.x + player.w > prevX && player.x < prevX + mp.w) {
        player.x += mp.vx;
        player.y = mp.y - player.h;
      }
    }
    // 3. Rodas de Mandacaru Espinhoso
    var wheels = L.hazardWheels || [];
    for (var k = 0; k < wheels.length; k++) {
      var w = wheels[k];
      if (!w) continue;
      w.t = (w.t || 0) + (w.speed || 0.035);
      w.angle = (w.angle || 0) + 0.12;
      w.x = (w.baseX != null ? w.baseX : w.x) + Math.sin(w.t) * (w.range || 70);
      var r = w.r || 22;
      var box = { x: w.x - r * 0.8, y: w.y - r * 0.8, w: r * 1.6, h: r * 1.6 };
      if (aabb(player, box) && player.takeDamage) player.takeDamage(1);
    }
  }

  function drawObstacles(ctx, camX, camY, L, frameCount) {
    if (!L) return;
    var t = frameCount || 0;
    // 1. Zabumba Trampolins
    var tramps = L.trampolines || [];
    for (var i = 0; i < tramps.length; i++) {
      var tr = tramps[i];
      if (!tr) continue;
      var x = tr.x - camX, y = tr.y - camY, w = tr.w || 48, h = tr.h || 28;
      var sq = tr.bounceAnim > 0 ? Math.sin(tr.bounceAnim * 0.6) * 0.22 : 0;
      ctx.save();
      ctx.translate(x + w / 2, y + h);
      ctx.scale(1 + sq, 1 - sq);
      roundBox(ctx, -w / 2, -h, w, h, 8, '#c92a2a');
      // Ziguezague branco/dourado de zabumba de forró
      ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (var z = -w / 2 + 4; z <= w / 2 - 4; z += 8) {
        ctx.lineTo(z, (Math.round((z + w / 2) / 8) % 2 === 0) ? -4 : -h + 6);
      }
      ctx.stroke();
      // Pele superior do tambor
      ball(ctx, 0, -h + 2, w * 0.48, 6, '#fff3bf', { lw: 1.8 });
      ctx.restore();
    }
    // 2. Rodas de Mandacaru Espinhoso
    var wheels = L.hazardWheels || [];
    for (var k = 0; k < wheels.length; k++) {
      var wh = wheels[k];
      if (!wh) continue;
      var wx = wh.x - camX, wy = wh.y - camY, wr = wh.r || 22;
      // Trilho pontilhado
      if (wh.range) {
        ctx.save();
        ctx.strokeStyle = 'rgba(40,20,10,0.35)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo((wh.baseX || wh.x) - wh.range - camX, wy); ctx.lineTo((wh.baseX || wh.x) + wh.range - camX, wy); ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      ctx.translate(wx, wy);
      ctx.rotate(wh.angle || t * 0.1);
      for (var s = 0; s < 8; s++) {
        ctx.rotate(Math.PI / 4);
        ctx.beginPath(); ctx.moveTo(-4, -wr * 0.65); ctx.lineTo(0, -wr * 1.25); ctx.lineTo(4, -wr * 0.65); ctx.closePath();
        ctx.fillStyle = '#fff3bf'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.4; ctx.stroke();
      }
      ball(ctx, 0, 0, wr * 0.78, wr * 0.78, '#2b8a3e');
      ball(ctx, 0, 0, wr * 0.32, wr * 0.32, '#ffd43b', { lw: 1.2 });
      ctx.restore();
    }
  }

  G.OxeHD = {
    ENEMY_DEF_HD: ENEMY_DEF_HD,
    updateNewEnemy: updateNewEnemy,
    updateObstacles: updateObstacles,
    drawObstacles: drawObstacles,
    drawParallaxHD: drawParallaxHD,
    drawPlatformsHD: drawPlatformsHD,
    drawTonhoHD: drawTonhoHD,
    drawEnemyHD: drawEnemyHD,
    drawBossHD: drawBossHD,
    drawCollectibleHD: drawCollectibleHD
  };
})(typeof window !== 'undefined' ? window : this);
