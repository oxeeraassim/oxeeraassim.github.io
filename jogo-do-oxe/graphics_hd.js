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

  /* Corpo volumétrico: gradiente radial (luz topo-esq), contorno escuro, rim light */
  function ball(ctx, x, y, rx, ry, base, opts) {
    opts = opts || {};
    var g = ctx.createRadialGradient(x - rx * 0.35, y - ry * 0.45, Math.max(1, Math.min(rx, ry) * 0.1), x, y, Math.max(rx, ry) * 1.15);
    g.addColorStop(0, shade(base, 0.45));
    g.addColorStop(0.45, base);
    g.addColorStop(1, shade(base, -0.45));
    ellPath(ctx, x, y, rx, ry, opts.rot);
    ctx.fillStyle = g;
    ctx.fill();
    if (opts.outline !== false) {
      ctx.lineWidth = opts.lw || 2.2;
      ctx.strokeStyle = OUT;
      ctx.stroke();
    }
    if (opts.rim !== false) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#fff6d8';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      if (ctx.ellipse) ctx.ellipse(x, y, rx * 0.82, ry * 0.82, opts.rot || 0, Math.PI * 1.1, Math.PI * 1.45);
      ctx.stroke();
      ctx.restore();
    }
  }

  function roundBox(ctx, x, y, w, h, r, base) {
    var g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, shade(base, 0.35));
    g.addColorStop(0.5, base);
    g.addColorStop(1, shade(base, -0.4));
    rrPath(ctx, x, y, w, h, r);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2;
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
    ctx.save();
    ctx.globalAlpha = a == null ? 0.28 : a;
    ellPath(ctx, x, y, w * 0.55, w * 0.14);
    ctx.fillStyle = '#000';
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
    { name: 'sombra',  sky: ['#0b0b18', '#1e1a33', '#3a2a4a', '#6a3a4a'], hills: ['#2d2a40', '#24213a', '#1a182c', '#100f1e'], fog: '#5a4a6a', ground: '#2a2638', top: '#9775fa', topD: '#6741d9', particle: 'embers' }
  ];
  var THEME_ALIAS = { desert: 0, sertao: 0, caatinga: 0, forest: 1, mata: 1, jungle: 1, pantano: 1, swamp: 2, mangue: 2, cave: 3, caverna: 3, canyon: 4, canion: 4, lava: 4, volcano: 4, shadow: 5, sombra: 5, castle: 5, trono: 5 };
  var WORLD_IDX_TO_PAL = [0, 3, 1, 2, 4, 5]; // ordem dos mundos do jogo -> paletas

  // v2.2: antes todos os mundos caíam na paleta do sertão (o bioma fica em L.spec.biome)
  function worldOf(L) {
    if (!L) return WORLDS[0];
    var t = (L.spec && L.spec.biome) || L.theme || L.biome;
    if (typeof t !== 'string' && typeof L.worldIdx === 'number') return WORLDS[WORLD_IDX_TO_PAL[clamp(L.worldIdx, 0, 5)]];
    if (typeof t === 'string' && THEME_ALIAS.hasOwnProperty(t.toLowerCase())) return WORLDS[THEME_ALIAS[t.toLowerCase()]];
    var w = num(L.world, num(L.worldIndex, 0));
    if (w >= 1 && w <= 6 && L.world !== 0) w = w - 1;
    return WORLDS[clamp(Math.floor(w), 0, WORLDS.length - 1)];
  }

  function hash(n) { var s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

  /* ======================================================= PARALLAX HD */
  function drawParallaxHD(ctx, camX, camY, L, frameCount, W, H) {
    W = num(W, 960); H = num(H, 540); camX = num(camX, 0); camY = num(camY, 0);
    var t = num(frameCount, 0);
    var P = worldOf(L);
    ctx.save();

    // Céu multi-stop
    var sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, P.sky[0]); sky.addColorStop(0.4, P.sky[1]);
    sky.addColorStop(0.75, P.sky[2]); sky.addColorStop(1, P.sky[3]);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

    // Sol / lua com halo
    var sunX = W * 0.78 - (camX * 0.02) % 40, sunY = H * 0.2;
    var dark = P.name === 'caverna' || P.name === 'sombra';
    var halo = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 180);
    halo.addColorStop(0, dark ? 'rgba(220,210,255,0.55)' : 'rgba(255,250,210,0.9)');
    halo.addColorStop(0.25, dark ? 'rgba(180,160,255,0.2)' : 'rgba(255,220,140,0.35)');
    halo.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = halo; ctx.fillRect(sunX - 180, sunY - 180, 360, 360);
    ellPath(ctx, sunX, sunY, 34, 34);
    ctx.fillStyle = dark ? '#e8e0ff' : '#fff6c8'; ctx.fill();

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

    // Nuvens fofas
    if (P.name !== 'caverna') {
      for (var c = 0; c < 7; c++) {
        var span = W + 400;
        var cx = ((hash(c) * span - camX * (0.05 + c * 0.012) - t * (0.08 + hash(c + 9) * 0.1)) % span + span) % span - 200;
        var cy = 40 + hash(c + 3) * H * 0.3 - camY * 0.03;
        var s = 0.7 + hash(c + 5) * 0.8;
        drawCloud(ctx, cx, cy, s, dark);
      }
    }

    // 4 camadas de serras com neblina
    var factors = [0.12, 0.22, 0.36, 0.52];
    for (var l = 0; l < 4; l++) {
      var f = factors[l];
      var baseY = H * (0.5 + l * 0.09) - camY * f * 0.3;
      var amp = 70 - l * 10;
      var off = camX * f;
      var hg = ctx.createLinearGradient(0, baseY - amp, 0, H);
      hg.addColorStop(0, shade(P.hills[l], 0.18));
      hg.addColorStop(0.35, P.hills[l]);
      hg.addColorStop(1, shade(P.hills[l], -0.35));
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (var x = -20; x <= W + 20; x += 16) {
        var wx = x + off;
        var y = baseY - (Math.sin(wx * 0.004 + l * 1.3) * 0.5 + 0.5) * amp
                       - (Math.sin(wx * 0.011 + l * 2.1) * 0.5 + 0.5) * amp * 0.45;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
      // rim light topo
      ctx.save(); ctx.globalAlpha = 0.18; ctx.strokeStyle = '#fff3d0'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();

      if (l === 1) drawFarProps(ctx, P, off, baseY, W, t);
      if (l === 3) drawNearProps(ctx, P, off, baseY, W, H, t);

      if (LQ) continue;
      // neblina atmosférica entre camadas
      var fogG = ctx.createLinearGradient(0, baseY - 20, 0, baseY + 90);
      fogG.addColorStop(0, rgba(P.fog, 0));
      fogG.addColorStop(0.5, rgba(P.fog, 0.22 - l * 0.03));
      fogG.addColorStop(1, rgba(P.fog, 0));
      ctx.fillStyle = fogG; ctx.fillRect(0, baseY - 20, W, 110);
    }

    // Bandeirolas de São João (sertão/mata)
    if (P.name === 'sertao' || P.name === 'mata') {
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
    // Casario nordestino / rochas distantes
    for (var i = -1; i < 8; i++) {
      var span = 260;
      var x = ((i * span - off * 0.9) % (span * 8) + span * 8) % (span * 8) - span;
      var h = hash(i + 40);
      if (P.name === 'sertao' || P.name === 'mata') {
        if (h > 0.5) drawHouse(ctx, x, baseY - 8, 0.6 + h * 0.3, P);
      } else if (P.name !== 'caverna') {
        drawRock(ctx, x, baseY - 4, 30 + h * 30, shade(P.hills[1], -0.1));
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
      var h = hash(i + 77);
      var gy = baseY + 30;
      if (P.name === 'sertao') {
        if (h > 0.35) drawMandacaru(ctx, x + h * 80, gy, 0.8 + h * 0.5, t, true);
        else drawRock(ctx, x, gy, 40 + h * 40, '#a8743e');
      } else if (P.name === 'mata' || P.name === 'mangue') {
        // árvores arredondadas
        var tx = x + h * 60;
        ctx.fillStyle = '#5a3a1e';
        rrPath(ctx, tx - 6, gy - 70, 12, 80, 5); ctx.fill();
        ball(ctx, tx, gy - 80, 40 + h * 14, 32 + h * 10, P.name === 'mata' ? '#3e8a3a' : '#2f6a4e', { lw: 1.6 });
        ball(ctx, tx - 22, gy - 66, 24, 20, P.name === 'mata' ? '#4aa04a' : '#3a7a5a', { lw: 1.4 });
      } else if (P.name === 'caverna') {
        // estalactites e cristais
        ctx.fillStyle = '#2a2050';
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 18, 0); ctx.lineTo(x + 9, 60 + h * 60); ctx.closePath(); ctx.fill();
        var cg = ctx.createLinearGradient(x, gy - 40, x + 20, gy);
        cg.addColorStop(0, '#c5f6fa'); cg.addColorStop(1, '#3bc9db');
        ctx.fillStyle = cg; ctx.globalAlpha = 0.6 + 0.3 * Math.sin(t * 0.05 + i);
        ctx.beginPath(); ctx.moveTo(x + 40, gy); ctx.lineTo(x + 50, gy - 40 - h * 20); ctx.lineTo(x + 60, gy); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        drawRock(ctx, x, gy, 50 + h * 50, shade(P.hills[2], 0.1));
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
    var P = worldOf(L);
    var plats = L.platforms;
    for (var i = 0; i < plats.length; i++) {
      var p = plats[i];
      if (!p) continue;
      if (p.state === 'fallen') continue;
      var a = num(L._alpha, 1);
      var px = (p.isMoving && typeof p.prevX === 'number') ? p.prevX + (p.x - p.prevX) * a : p.x;
      var py = (p.isMoving && typeof p.prevY === 'number') ? p.prevY + (p.y - p.prevY) * a : p.y;
      var x = px - camX, y = py - camY, w = num(p.w, 32), h = num(p.h, 32);
      if (x + w < -40 || x > W + 40 || y + h < -40 || y > H + 60) continue;
      if (p.isMoving || p.type === 'wood' || p.oneWay || p.type === 'oneway') drawWoodPlat(ctx, x, y, w, h, t, p.isMoving);
      else drawGroundBlock(ctx, x, y, w, h, P, t, i);
    }
  }

  function drawGroundBlock(ctx, x, y, w, h, P, t, seed) {
    var r = Math.min(14, w / 2, h / 2);
    var LQp = !!(G.OxeHD && G.OxeHD.lowQuality);
    // sombra projetada
    ctx.save(); ctx.globalAlpha = 0.25; ctx.fillStyle = '#000';
    rrPath(ctx, x + 5, y + 8, w, h, r); ctx.fill(); ctx.restore();
    // corpo
    var g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, shade(P.ground, 0.2)); g.addColorStop(0.5, P.ground); g.addColorStop(1, shade(P.ground, -0.45));
    rrPath(ctx, x, y, w, h, r); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 2.4; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.save();
    rrPath(ctx, x, y, w, h, r); ctx.clip();
    // chanfro interno
    ctx.strokeStyle = 'rgba(255,240,210,0.25)'; ctx.lineWidth = 3;
    rrPath(ctx, x + 3, y + 3, w - 6, h - 6, Math.max(2, r - 3)); ctx.stroke();
    // pedras redondas incrustadas
    var cnt = LQp ? 0 : Math.floor(w * h / 1800);
    for (var k = 0; k < Math.min(cnt, 40); k++) {
      var sx = x + 8 + hash(seed * 13 + k) * (w - 16), sy = y + 22 + hash(seed * 7 + k * 3) * Math.max(1, h - 28);
      var sr = 3 + hash(seed + k * 11) * 5;
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
    ctx.restore();
    // cobertura estufada
    var topH = Math.min(16, h * 0.5);
    var tg = ctx.createLinearGradient(x, y - 6, x, y + topH);
    tg.addColorStop(0, shade(P.top, 0.35)); tg.addColorStop(0.6, P.top); tg.addColorStop(1, P.topD);
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
    ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
    // brilho do topo
    ctx.save(); ctx.globalAlpha = 0.45; ctx.strokeStyle = '#fffbe0'; ctx.lineWidth = 2;
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
    var hh = Math.max(12, Math.min(h, 22));
    ctx.save(); ctx.globalAlpha = 0.22; ctx.fillStyle = '#000';
    rrPath(ctx, x + 4, y + 7, w, hh, hh / 2); ctx.fill(); ctx.restore();
    var g = ctx.createLinearGradient(x, y, x, y + hh);
    g.addColorStop(0, '#e0a96d'); g.addColorStop(0.45, '#b9773f'); g.addColorStop(1, '#6e3f1c');
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
    var S = 1.55;
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
    var S = 1.55;
    var col = enemy.color || def.color || '#888';
    var stunned = num(enemy.stunTimer, num(enemy.stunned === true ? 1 : enemy.stunned, num(enemy.dizzy === true ? 1 : enemy.dizzy, 0))) > 0;
    var hurt = num(enemy.hurtTimer, num(enemy.flash, 0)) > 0;

    if (!def.fly) groundShadow(ctx, cx, by + 1, w * S * 0.8, 0.28);
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
    var S = 1.45, hurt = boss.hurtTimer > 0 || boss.invuln > 0;
    var aura = { BossBull: '#ff6b6b', BossFulozinha: '#69db7c', BossPapaFigo: '#b197fc', BossSerpente: '#38d9a9', BossGuardiaoBrasa: '#ff922b', BossSombraSeca: '#fcc419' }[kind] || '#fff';
    var gx = bx + w / 2, gy = by + h;
    if (typeof groundShadow === 'function') groundShadow(ctx, gx, gy, w * 0.7 * S);
    ctx.save();
    var gr = ctx.createRadialGradient(gx, gy - h * 0.5, 4, gx, gy - h * 0.5, w * 1.1 * S);
    gr.addColorStop(0, aura + '55'); gr.addColorStop(1, aura + '00');
    ctx.fillStyle = gr; ctx.fillRect(gx - w * 1.2 * S, gy - h * 1.6 * S, w * 2.4 * S, h * 2 * S);
    ctx.translate(gx, gy); ctx.scale((boss.facing || boss.dir || 1) < 0 ? -S : S, S);
    if (hurt && (t >> 2) % 2) ctx.globalAlpha = 0.5;
    var sq = 1 + Math.sin(t * 0.1) * 0.03, ang = { angry: 1 };
    switch (kind) {
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
        for (var fl = 0; fl < 7; fl++) { var fx = -w * 0.4 + fl * w * 0.13, fh = h * (0.3 + Math.abs(Math.sin(t * 0.2 + fl)) * 0.2); ball(ctx, fx, -h * 0.85 - fh * 0.3, 7, fh * 0.5, fl % 2 ? '#ffd43b' : '#ff6b00', { lw: 0.8, rim: false }); }
        legsPair(ctx, -h * 0.3, w * 0.25, h * 0.3, '#5c2d0e', t);
        roundBox(ctx, -w * 0.4, -h * 0.85, w * 0.8, h * 0.58, 14, '#c2410c');
        for (var c = 0; c < 4; c++) { ctx.beginPath(); ctx.moveTo(-w * 0.3 + c * w * 0.2, -h * 0.75); ctx.lineTo(-w * 0.25 + c * w * 0.2, -h * 0.4); ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 2; ctx.stroke(); }
        eye(ctx, -w * 0.12, -h * 0.68, w * 0.08, 0.5, 0, { angry: 1, iris: '#fff3bf' }); eye(ctx, w * 0.15, -h * 0.68, w * 0.08, 0.5, 0, { angry: 1, iris: '#fff3bf' });
        break;
      default:
        ctx.save(); ctx.translate(0, -h * 0.95); ctx.rotate(t * 0.01);
        for (var r = 0; r < 12; r++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(w * 0.22, -4); ctx.lineTo(w * 0.42, 0); ctx.lineTo(w * 0.22, 4); ctx.fillStyle = '#fcc419'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.stroke(); }
        ctx.restore();
        ctx.globalAlpha *= 0.9;
        DRAWERS.cangaceiro_sombra(ctx, w, h, '#343a40', t);
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
