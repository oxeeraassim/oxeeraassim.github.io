/* ==========================================================================
 * jogo-do-oxe / art_v3.js — window.OxeArt3  (v3.0 "Mais Sertão")
 * Desenhos novos: Zefinha, jegue, 12 bichos, Quibungo, chefes redesenhados
 * (Touro de Fogo, Comadre Fulozinha) e novos (Corpo-Seco, Boi Encantado),
 * espinhos, troncos ocos, fogueiras, carroças, balões, cenários e primeiro plano.
 * Só desenho: nenhuma regra do jogo mora aqui.
 * ========================================================================== */
(function (G) {
  'use strict';
  var OUT = '#1e120a', TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rgb(hex) { var h = String(hex).replace('#', ''); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; var n = parseInt(h, 16); return isNaN(n) ? { r: 128, g: 128, b: 128 } : { r: n >> 16 & 255, g: n >> 8 & 255, b: n & 255 }; }
  function shade(hex, a) { if (hex.charAt(0) !== '#') return hex; var c = rgb(hex), f = function (v) { return clamp(Math.round(a >= 0 ? v + (255 - v) * a : v * (1 + a)), 0, 255); }; return 'rgb(' + f(c.r) + ',' + f(c.g) + ',' + f(c.b) + ')'; }
  function rgba(hex, a) { var c = rgb(hex); return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')'; }
  function ell(ctx, x, y, rx, ry, rot) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU); }
  function rr(ctx, x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  // corpo com volume 2.5D: luz especular topo-esquerdo, núcleo, sombra profunda e rim light duplo
  function ball(ctx, x, y, rx, ry, base, o) {
    o = o || {};
    var g = ctx.createRadialGradient(x - rx * 0.38, y - ry * 0.45, Math.max(1, Math.min(rx, ry) * 0.08), x + rx * 0.08, y + ry * 0.1, Math.max(rx, ry) * 1.18);
    g.addColorStop(0, shade(base, 0.55)); g.addColorStop(0.38, base); g.addColorStop(0.8, shade(base, -0.34)); g.addColorStop(1, shade(base, -0.54));
    ell(ctx, x, y, rx, ry, o.rot); ctx.fillStyle = g; ctx.fill();
    if (o.lw !== 0) { ctx.lineWidth = o.lw || 2.1; ctx.strokeStyle = OUT; ctx.stroke(); }
    if (o.rim !== false) {
      ctx.save(); ctx.globalAlpha = 0.45; ctx.strokeStyle = '#fff9e6'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(x, y, rx * 0.8, ry * 0.8, o.rot || 0, Math.PI * 1.08, Math.PI * 1.48); ctx.stroke();
      ctx.globalAlpha = 0.22; ctx.strokeStyle = shade(base, -0.58); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.ellipse(x, y, rx * 0.84, ry * 0.84, o.rot || 0, Math.PI * 0.1, Math.PI * 0.48); ctx.stroke();
      ctx.restore();
    }
  }
  function box(ctx, x, y, w, h, r, base, lw) {
    var g = ctx.createLinearGradient(x, y, x + w * 0.12, y + h); g.addColorStop(0, shade(base, 0.44)); g.addColorStop(0.42, base); g.addColorStop(0.82, shade(base, -0.32)); g.addColorStop(1, shade(base, -0.48));
    rr(ctx, x, y, w, h, r); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = lw || 1.9; ctx.strokeStyle = OUT; ctx.stroke();
  }
  function eye(ctx, x, y, r, o) {
    o = o || {}; ctx.save();
    if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = 8; }
    ell(ctx, x, y, r, r * (o.blink ? 0.15 : 1.1)); ctx.fillStyle = o.sclera || '#fff'; ctx.fill(); ctx.shadowBlur = 0; ctx.lineWidth = 1.3; ctx.strokeStyle = OUT; ctx.stroke();
    if (!o.blink) { ell(ctx, x + r * 0.25, y, r * 0.6, r * 0.68); ctx.fillStyle = o.iris || '#2a1a0c'; ctx.fill(); ell(ctx, x + r * 0.25, y, r * 0.3, r * 0.36); ctx.fillStyle = '#050302'; ctx.fill(); ell(ctx, x, y - r * 0.32, r * 0.2, r * 0.2); ctx.fillStyle = '#fff'; ctx.fill(); }
    ctx.restore();
    if (o.angry) { ctx.save(); ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - r, y - r * 1.5); ctx.lineTo(x + r, y - r * 0.9); ctx.stroke(); ctx.restore(); }
  }
  function legs(ctx, y, spread, len, col, t, sp, n) {
    n = n || 2;
    for (var i = 0; i < n; i++) {
      var lx = n === 2 ? (i ? spread : -spread) : -spread + (2 * spread) * i / (n - 1);
      var a = Math.sin(t * (sp || 0.25) + i * Math.PI) * 0.45;
      ctx.save(); ctx.translate(lx, y); ctx.rotate(a); rr(ctx, -2.2, 0, 4.4, len, 2.2); ctx.fillStyle = shade(col, -0.25); ctx.fill(); ctx.lineWidth = 1.1; ctx.strokeStyle = OUT; ctx.stroke(); ctx.restore();
    }
  }
  function interp(o, a) { return { x: o.prevX != null ? lerp(o.prevX, o.x, a) : o.x, y: o.prevY != null ? lerp(o.prevY, o.y, a) : o.y }; }
  function shadow(ctx, x, y, w, a) { var ba = a == null ? 0.3 : a; ctx.save(); ctx.globalAlpha = ba * 0.55; ell(ctx, x, y + 1, w * 0.64, w * 0.16); ctx.fillStyle = '#000'; ctx.fill(); ctx.globalAlpha = ba; ell(ctx, x, y, w * 0.44, w * 0.1); ctx.fillStyle = '#0a0400'; ctx.fill(); ctx.restore(); }
  function stars3(ctx, x, y, t) { for (var i = 0; i < 3; i++) { var a = t * 0.13 + i * TAU / 3; ctx.save(); ctx.translate(x + Math.cos(a) * 14, y + Math.sin(a) * 4); ctx.fillStyle = i === 1 ? '#74C0FC' : '#FFD43B'; ctx.beginPath(); for (var k = 0; k < 10; k++) { var r = k % 2 ? 2 : 5, an = -Math.PI / 2 + k * Math.PI / 5; ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); } ctx.closePath(); ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = OUT; ctx.stroke(); ctx.restore(); } }

  /* ============================================================ BICHOS */
  var D = {};
  D.prea = function (ctx, w, h, t, e) {
    var run = Math.abs(e.vx || 0) > 0.3, hop = run ? Math.abs(Math.sin(t * 0.5)) * 2 : 0;
    ctx.translate(0, -hop);
    legs(ctx, -h * 0.25, w * 0.22, h * 0.25, '#8a6a48', t, 0.6);
    ball(ctx, -w * 0.05, -h * 0.5, w * 0.42, h * 0.38, '#A68A64');
    ball(ctx, w * 0.3, -h * 0.62, w * 0.2, h * 0.26, '#B89A70');
    ball(ctx, w * 0.18, -h * 0.92, 3.5, 3, '#C9A27A', { lw: 1 });
    ell(ctx, w * 0.5, -h * 0.58, 2, 1.6); ctx.fillStyle = '#5c3a22'; ctx.fill();
    eye(ctx, w * 0.34, -h * 0.7, 2.6, { iris: '#1a0f08' });
    ctx.strokeStyle = 'rgba(40,20,10,0.6)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(w * 0.5, -h * 0.58); ctx.lineTo(w * 0.7, -h * 0.66); ctx.moveTo(w * 0.5, -h * 0.56); ctx.lineTo(w * 0.7, -h * 0.5); ctx.stroke();
  };
  D.cascavel = function (ctx, w, h, t, e) {
    var rat = e.st === 'rattle', str = e.st === 'strike';
    ctx.lineCap = 'round';
    ctx.beginPath(); for (var i = 0; i <= 12; i++) { var x = -w * 0.55 + i * w * 0.07, y = -h * 0.22 + Math.sin(t * 0.18 + i * 0.7) * 2.5 - (i > 9 && !str ? (i - 9) * 3 : 0); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.lineWidth = h * 0.5; ctx.strokeStyle = OUT; ctx.stroke(); ctx.lineWidth = h * 0.42; ctx.strokeStyle = '#C2A878'; ctx.stroke();
    ctx.lineWidth = h * 0.22; ctx.strokeStyle = '#7A5C3A'; ctx.setLineDash([4, 5]); ctx.stroke(); ctx.setLineDash([]);
    // chocalho
    ctx.save(); ctx.translate(-w * 0.58, -h * 0.22 + (rat ? Math.sin(t * 2.2) * 3 : 0));
    for (var k = 0; k < 4; k++) { ball(ctx, -k * 4, 0, 3.2 - k * 0.3, 2.8, '#E9D8A6', { lw: 0.8, rim: false }); }
    ctx.restore();
    if (rat) { ctx.save(); ctx.globalAlpha = 0.7; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; for (var q = 0; q < 2; q++) { ctx.beginPath(); ctx.arc(-w * 0.62, -h * 0.25, 6 + q * 5 + (t % 8), Math.PI * 0.7, Math.PI * 1.3); ctx.stroke(); } ctx.restore(); }
    var hx = w * 0.32 + (str ? 6 : 0), hy = -h * 0.45 - (rat ? 8 : 0);
    ball(ctx, hx, hy, w * 0.16, h * 0.32, '#B89868');
    ctx.fillStyle = '#5C4024'; ell(ctx, hx - 2, hy - 2, w * 0.08, h * 0.12); ctx.fill();
    eye(ctx, hx + 3, hy - 2, 2.4, { iris: '#E67700', angry: 1 });
    if (str || rat) { ctx.strokeStyle = '#E03131'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(hx + w * 0.15, hy + 2); ctx.lineTo(hx + w * 0.26, hy + Math.sin(t) * 2); ctx.stroke(); }
  };
  D.caititu = function (ctx, w, h, t, e) {
    var dash = e.st === 'dash';
    legs(ctx, -h * 0.3, w * 0.28, h * 0.3, '#3b2e24', t * (dash ? 2.2 : 1), 0.4, 4);
    ball(ctx, -w * 0.05, -h * 0.58, w * 0.46, h * 0.36, '#5C4A3A');
    // colar branco (marca do cateto)
    ctx.strokeStyle = '#E9E2D0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(w * 0.18, -h * 0.55, h * 0.3, -1.2, 1.1); ctx.stroke();
    ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.fillStyle = '#2b2018';
    for (var i = -3; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 6, -h * 0.9); ctx.lineTo(i * 6 + 3, -h * 1.05); ctx.lineTo(i * 6 + 6, -h * 0.9); ctx.fill(); }
    ball(ctx, w * 0.38, -h * 0.55, w * 0.18, h * 0.24, '#6a5646');
    box(ctx, w * 0.48, -h * 0.55, w * 0.12, h * 0.2, 3, '#8a6f60', 1);
    ctx.fillStyle = '#FFF3BF'; ctx.beginPath(); ctx.moveTo(w * 0.5, -h * 0.4); ctx.lineTo(w * 0.54, -h * 0.28); ctx.lineTo(w * 0.57, -h * 0.4); ctx.fill();
    eye(ctx, w * 0.38, -h * 0.68, 2.6, { iris: '#C92A2A', angry: dash ? 1 : 0 });
  };
  D.lacraia = function (ctx, w, h, t, e) {
    var n = Math.max(2, (e.hp || 3) * 2 + 1), seg = w / (n + 1);
    for (var i = n; i >= 0; i--) {
      var x = -w / 2 + seg * (i + 0.6), y = -h * 0.5 + Math.sin(t * 0.25 + i * 0.9) * 1.6;
      legs(ctx, y + h * 0.15, seg * 0.35, h * 0.38, '#7a2a18', t + i * 3, 0.7);
      ball(ctx, x, y, seg * 0.62, h * 0.42, i % 2 ? '#B5482E' : '#D9622B', { lw: 1.2, rim: false });
    }
    var hx = -w / 2 + seg * (n + 0.9);
    ball(ctx, hx, -h * 0.55, seg * 0.7, h * 0.48, '#8F2D1A', { lw: 1.4 });
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(hx + 3, -h * 0.9); ctx.quadraticCurveTo(hx + 10, -h * 1.4, hx + 16, -h * 1.1); ctx.moveTo(hx, -h * 0.9); ctx.quadraticCurveTo(hx + 4, -h * 1.5, hx + 10, -h * 1.35); ctx.stroke();
    eye(ctx, hx + 3, -h * 0.62, 2, { iris: '#FFD43B' });
  };
  D.onca_pintada = function (ctx, w, h, t, e) {
    var cr = (e.crouch || 0) > 0 && e.onGround, air = !e.onGround;
    ctx.translate(0, cr ? 3 : 0);
    var tail = Math.sin(t * 0.12) * 0.4;
    ctx.save(); ctx.translate(-w * 0.42, -h * 0.62); ctx.rotate(-0.6 + tail); ctx.lineCap = 'round'; ctx.strokeStyle = OUT; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-10, -10, -14, -22); ctx.stroke(); ctx.strokeStyle = '#E8A33D'; ctx.lineWidth = 4; ctx.stroke(); ctx.restore();
    if (air) { legs(ctx, -h * 0.4, w * 0.3, h * 0.38, '#c07a20', 0, 0, 4); } else legs(ctx, -h * 0.32, w * 0.3, h * 0.32, '#c07a20', t, cr ? 0.12 : 0.3, 4);
    ball(ctx, -w * 0.04, -h * 0.6, w * 0.45, h * (cr ? 0.3 : 0.36), '#E8A33D');
    ctx.fillStyle = 'rgba(0,0,0,0)';
    var spots = [[-0.3, -0.62], [-0.15, -0.75], [0, -0.55], [0.12, -0.72], [-0.22, -0.48], [0.2, -0.52], [-0.05, -0.85]];
    for (var i = 0; i < spots.length; i++) { ctx.strokeStyle = '#3b2410'; ctx.lineWidth = 1.6; ell(ctx, w * spots[i][0], h * spots[i][1], 3.2, 2.6, i); ctx.stroke(); ctx.fillStyle = '#C47A1E'; ctx.fill(); ctx.fillStyle = '#3b2410'; ell(ctx, w * spots[i][0], h * spots[i][1], 1, 1); ctx.fill(); }
    ball(ctx, w * 0.42, -h * 0.72, w * 0.2, h * 0.3, '#F0B04A');
    ball(ctx, w * 0.35, -h * 1.0, 3.5, 3.5, '#E8A33D', { lw: 1 }); ball(ctx, w * 0.5, -h * 0.98, 3.5, 3.5, '#E8A33D', { lw: 1 });
    ball(ctx, w * 0.52, -h * 0.62, w * 0.09, h * 0.12, '#FFF0D0', { lw: 1, rim: false });
    ell(ctx, w * 0.6, -h * 0.7, 2, 1.6); ctx.fillStyle = '#3b2410'; ctx.fill();
    eye(ctx, w * 0.47, -h * 0.8, 2.6, { iris: '#9BCB3C', angry: 1 });
  };
  D.rola_bosta = function (ctx, w, h, t, e) {
    legs(ctx, -h * 0.2, w * 0.3, h * 0.25, '#1b252f', t, 0.5, 3);
    ball(ctx, -w * 0.05, -h * 0.5, w * 0.42, h * 0.36, '#2B3A4A');
    ctx.save(); ctx.globalAlpha = 0.6; ctx.strokeStyle = '#8ce99a'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(-w * 0.05, -h * 0.55, w * 0.32, h * 0.22, 0, Math.PI * 1.1, Math.PI * 1.7); ctx.stroke(); ctx.restore();
    ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-w * 0.05, -h * 0.85); ctx.lineTo(-w * 0.05, -h * 0.2); ctx.stroke();
    ball(ctx, w * 0.36, -h * 0.5, w * 0.15, h * 0.2, '#1E2A36');
    ctx.strokeStyle = '#1E2A36'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(w * 0.45, -h * 0.6); ctx.quadraticCurveTo(w * 0.62, -h * 0.9, w * 0.55, -h * 1.0); ctx.stroke();
    eye(ctx, w * 0.42, -h * 0.55, 1.8, {});
  };
  D.teju = function (ctx, w, h, t, e) {
    var tl = e.st === 'tail' ? Math.sin((e.timer - e.stT) * 0.35) * 0.9 : Math.sin(t * 0.08) * 0.2;
    ctx.save(); ctx.translate(-w * 0.3, -h * 0.4); ctx.rotate(tl); ctx.lineCap = 'round'; ctx.strokeStyle = OUT; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-14, 2, -26, 8); ctx.stroke();
    ctx.strokeStyle = '#3D3D3D'; ctx.lineWidth = 6; ctx.stroke(); ctx.strokeStyle = '#E9ECEF'; ctx.lineWidth = 2; ctx.setLineDash([3, 4]); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
    legs(ctx, -h * 0.25, w * 0.22, h * 0.28, '#2a2a2a', t, 0.35, 4);
    ball(ctx, 0, -h * 0.48, w * 0.34, h * 0.34, '#3D3D3D');
    for (var r = -2; r <= 2; r++) { ctx.fillStyle = '#F1F3F5'; for (var c = -1; c <= 1; c++) { ell(ctx, r * w * 0.11, -h * 0.48 + c * h * 0.18, 1.6, 1.2); ctx.fill(); } }
    ball(ctx, w * 0.36, -h * 0.5, w * 0.17, h * 0.26, '#4a4a4a');
    ctx.strokeStyle = '#FA5252'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(w * 0.5, -h * 0.45); ctx.lineTo(w * 0.6, -h * 0.47 + Math.sin(t * 0.7) * 2); ctx.stroke();
    eye(ctx, w * 0.4, -h * 0.6, 2.4, { iris: '#E67700' });
  };
  D.ararinha_azul = function (ctx, w, h, t, e) {
    var f = Math.sin(t * 0.4);
    ctx.save(); ctx.translate(-w * 0.35, -h * 0.4); ctx.rotate(0.5 + f * 0.1); ctx.fillStyle = '#1C7ED6'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-14, 10); ctx.lineTo(-10, 2); ctx.lineTo(-16, 4); ctx.closePath(); ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = OUT; ctx.stroke(); ctx.restore();
    for (var s = -1; s <= 1; s += 2) { ctx.save(); ctx.translate(-2, -h * 0.55); ctx.rotate(s * 0.2 - f * 0.8); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-w * 0.3, -h * 0.65, -w * 0.55, -h * 0.25); ctx.quadraticCurveTo(-w * 0.3, -h * 0.05, 0, 4); ctx.closePath(); var g = ctx.createLinearGradient(0, -h * 0.6, 0, 4); g.addColorStop(0, '#74C0FC'); g.addColorStop(1, '#1864AB'); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.stroke(); ctx.restore(); }
    ball(ctx, 0, -h * 0.5, w * 0.28, h * 0.27, '#4DABF7');
    ball(ctx, w * 0.26, -h * 0.68, w * 0.16, h * 0.18, '#5FB8FF');
    ell(ctx, w * 0.3, -h * 0.66, w * 0.07, h * 0.08); ctx.fillStyle = '#FFE066'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(w * 0.38, -h * 0.72); ctx.quadraticCurveTo(w * 0.55, -h * 0.66, w * 0.44, -h * 0.52); ctx.lineTo(w * 0.38, -h * 0.6); ctx.closePath(); ctx.fillStyle = '#343A40'; ctx.fill(); ctx.stroke();
    eye(ctx, w * 0.3, -h * 0.7, 2, {});
  };
  D.rasga_mortalha = function (ctx, w, h, t, e) {
    var dive = e.state === 'dive', f = dive ? 0.9 : Math.sin(t * 0.3) * 0.6;
    for (var s = -1; s <= 1; s += 2) { ctx.save(); ctx.translate(s * w * 0.15, -h * 0.55); ctx.scale(s, 1); ctx.rotate(-0.3 - f * 0.5); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(w * 0.35, -h * 0.4, w * 0.55, h * 0.05); ctx.quadraticCurveTo(w * 0.3, h * 0.1, 0, h * 0.2); ctx.closePath(); ctx.fillStyle = '#C9B48E'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.stroke(); ctx.restore(); }
    ball(ctx, 0, -h * 0.45, w * 0.3, h * 0.34, '#D8C29A');
    // rosto em coração (coruja-das-torres)
    ctx.beginPath(); ctx.moveTo(0, -h * 0.5); ctx.bezierCurveTo(-w * 0.32, -h * 0.95, -w * 0.3, -h * 0.35, 0, -h * 0.3); ctx.bezierCurveTo(w * 0.3, -h * 0.35, w * 0.32, -h * 0.95, 0, -h * 0.5); ctx.fillStyle = '#FFF8EC'; ctx.fill(); ctx.strokeStyle = '#B08A5A'; ctx.lineWidth = 1.4; ctx.stroke();
    eye(ctx, -w * 0.1, -h * 0.58, 3, { iris: '#111', glow: dive ? '#FFE066' : null }); eye(ctx, w * 0.1, -h * 0.58, 3, { iris: '#111', glow: dive ? '#FFE066' : null });
    ctx.fillStyle = '#E8B04A'; ctx.beginPath(); ctx.moveTo(-2, -h * 0.48); ctx.lineTo(2, -h * 0.48); ctx.lineTo(0, -h * 0.4); ctx.fill();
    if (dive) { ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = '#fff'; for (var q = 0; q < 3; q++) { ctx.beginPath(); ctx.moveTo(-w * 0.3 + q * w * 0.3, -h * 1.1); ctx.lineTo(-w * 0.3 + q * w * 0.3, -h * 1.5); ctx.stroke(); } ctx.restore(); }
  };
  D.alamoa = function (ctx, w, h, t, e) {
    var gh = e.ghost; ctx.globalAlpha *= gh ? 0.28 + Math.sin(t * 0.2) * 0.08 : 0.92;
    var fl = Math.sin(t * 0.06) * 3; ctx.translate(0, fl);
    var g = ctx.createLinearGradient(0, -h, 0, 0); g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.6, '#D0EBFF'); g.addColorStop(1, 'rgba(165,216,255,0)');
    ctx.beginPath(); ctx.moveTo(-w * 0.3, -h * 0.65); ctx.quadraticCurveTo(-w * 0.45, -h * 0.2, -w * 0.4, 0);
    for (var i = 0; i <= 4; i++) ctx.quadraticCurveTo(-w * 0.4 + i * w * 0.2 - w * 0.1, -h * 0.1 + Math.sin(t * 0.2 + i) * 4, -w * 0.4 + i * w * 0.2, 0);
    ctx.quadraticCurveTo(w * 0.45, -h * 0.2, w * 0.3, -h * 0.65); ctx.closePath(); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(30,60,90,0.5)'; ctx.lineWidth = 1.2; ctx.stroke();
    ball(ctx, 0, -h * 0.75, w * 0.24, h * 0.17, '#F1F3F5', { lw: 1.2 });
    // cabelo longo
    ctx.fillStyle = '#ADB5BD'; ctx.beginPath(); ctx.moveTo(-w * 0.25, -h * 0.82); ctx.quadraticCurveTo(-w * 0.42, -h * 0.4, -w * 0.3, -h * 0.2); ctx.lineTo(-w * 0.18, -h * 0.6); ctx.quadraticCurveTo(0, -h * 0.98, w * 0.22, -h * 0.8); ctx.quadraticCurveTo(w * 0.1, -h * 0.97, -w * 0.25, -h * 0.82); ctx.fill();
    ctx.fillStyle = '#1C3D5A'; ell(ctx, -3.5, -h * 0.75, 2.2, 3); ctx.fill(); ell(ctx, 3.5, -h * 0.75, 2.2, 3); ctx.fill();
    if (!gh) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(160,220,255,0.25)'; ell(ctx, 0, -h * 0.5, w * 0.7, h * 0.6); ctx.fill(); ctx.restore(); }
  };
  D.cumacanga = function (ctx, w, h, t, e) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 7; i++) { var a = -Math.PI / 2 + (i - 3) * 0.35, l = 14 + Math.sin(t * 0.4 + i) * 5; ctx.fillStyle = i % 2 ? 'rgba(255,140,40,0.75)' : 'rgba(255,220,80,0.75)'; ctx.beginPath(); ctx.moveTo(Math.cos(a - 0.2) * 9, -h * 0.5 + Math.sin(a - 0.2) * 9); ctx.lineTo(Math.cos(a) * (9 + l) - 4, -h * 0.5 + Math.sin(a) * (9 + l)); ctx.lineTo(Math.cos(a + 0.2) * 9, -h * 0.5 + Math.sin(a + 0.2) * 9); ctx.fill(); }
    var g = ctx.createRadialGradient(0, -h * 0.5, 2, 0, -h * 0.5, w * 0.9); g.addColorStop(0, 'rgba(255,200,80,0.6)'); g.addColorStop(1, 'rgba(255,100,20,0)'); ctx.fillStyle = g; ctx.fillRect(-w, -h * 1.4, w * 2, h * 1.8);
    ctx.restore();
    ball(ctx, 0, -h * 0.48, w * 0.32, h * 0.32, '#E0A872');
    ctx.fillStyle = '#2b1a10'; ctx.beginPath(); ctx.ellipse(-2, -h * 0.64, w * 0.33, h * 0.14, -0.1, Math.PI, TAU); ctx.fill();
    eye(ctx, -4, -h * 0.5, 3, { iris: '#C92A2A', glow: '#FF922B' }); eye(ctx, 5, -h * 0.5, 3, { iris: '#C92A2A', glow: '#FF922B' });
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(1, -h * 0.36, 4, 0.2, Math.PI - 0.2); ctx.stroke();
  };
  D.muricoca = function (ctx, w, h, t, e) {
    var f = Math.sin(t * 1.6);
    for (var s = -1; s <= 1; s += 2) { ctx.save(); ctx.translate(0, -h * 0.65); ctx.rotate(s * (0.6 + f * 0.5)); ell(ctx, 0, -6, 3, 7); ctx.fillStyle = 'rgba(230,245,255,0.7)'; ctx.fill(); ctx.strokeStyle = 'rgba(30,30,30,0.6)'; ctx.lineWidth = 0.7; ctx.stroke(); ctx.restore(); }
    ctx.strokeStyle = '#212529'; ctx.lineWidth = 0.8; for (var i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 3, -h * 0.4); ctx.lineTo(i * 5, -h * 0.05); ctx.stroke(); }
    ball(ctx, -w * 0.12, -h * 0.5, w * 0.24, h * 0.18, '#495057', { lw: 1 });
    ball(ctx, w * 0.16, -h * 0.55, w * 0.13, h * 0.15, '#343A40', { lw: 1 });
    ctx.strokeStyle = '#212529'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(w * 0.26, -h * 0.55); ctx.lineTo(w * 0.55, -h * 0.45); ctx.stroke();
    ctx.fillStyle = '#FA5252'; ell(ctx, w * 0.19, -h * 0.6, 1.5, 1.5); ctx.fill();
  };
  // Comadre Fulozinha (bicho) redesenhada: menina da mata, cabelo preto até os pés
  D.fulozinha = function (ctx, w, h, t, e) { drawFulo(ctx, w, h, t, false, e); };
  function drawFulo(ctx, w, h, t, boss, e) {
    var bob = Math.sin(t * 0.1) * 3; ctx.translate(0, bob);
    var sway = Math.sin(t * 0.07) * 0.08;
    // cabelo que cobre o corpo
    ctx.save(); ctx.rotate(sway);
    var hg = ctx.createLinearGradient(0, -h, 0, 0); hg.addColorStop(0, '#2b2b33'); hg.addColorStop(1, '#0b0b10');
    ctx.beginPath(); ctx.moveTo(-w * 0.26, -h * 0.86);
    ctx.bezierCurveTo(-w * 0.6, -h * 0.5, -w * 0.55, -h * 0.15, -w * 0.48, 0);
    for (var i = 0; i <= 6; i++) ctx.lineTo(-w * 0.48 + i * w * 0.16, -Math.abs(Math.sin(t * 0.2 + i)) * 4 - (i % 2) * 3);
    ctx.bezierCurveTo(w * 0.55, -h * 0.15, w * 0.6, -h * 0.5, w * 0.26, -h * 0.86); ctx.closePath();
    ctx.fillStyle = hg; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.strokeStyle = 'rgba(140,150,180,0.35)'; ctx.lineWidth = 1; for (var k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(k * w * 0.06, -h * 0.82); ctx.quadraticCurveTo(k * w * 0.11, -h * 0.4, k * w * 0.1, -h * 0.05); ctx.stroke(); }
    ctx.restore();
    // folhas presas no cabelo e cipó
    for (var l = 0; l < 4; l++) { ctx.save(); ctx.translate(-w * 0.3 + l * w * 0.2, -h * (0.35 + (l % 2) * 0.2)); ctx.rotate(l + t * 0.01); ell(ctx, 0, 0, 3.4, 1.6); ctx.fillStyle = l % 2 ? '#51CF66' : '#2F9E44'; ctx.fill(); ctx.restore(); }
    // rosto
    ball(ctx, 0, -h * 0.78, w * 0.22, h * 0.15, '#C68B59', { lw: 1.4 });
    ctx.fillStyle = '#121218'; ctx.beginPath(); ctx.ellipse(0, -h * 0.86, w * 0.26, h * 0.08, 0, Math.PI, TAU); ctx.fill();
    var gl = boss ? '#63E6BE' : '#38D9A9';
    eye(ctx, -w * 0.08, -h * 0.78, Math.max(2, w * 0.07), { iris: '#0CA678', glow: gl }); eye(ctx, w * 0.09, -h * 0.78, Math.max(2, w * 0.07), { iris: '#0CA678', glow: gl });
    // assobio (boca em "o") e notinhas
    ctx.fillStyle = '#5c2a1a'; ell(ctx, w * 0.02, -h * 0.7, 1.6, 1.8); ctx.fill();
    if (Math.floor(t / 40) % 2 === 0) { ctx.save(); ctx.globalAlpha = 0.8; ctx.fillStyle = '#E6FCF5'; ctx.font = 'bold ' + Math.round(w * 0.3) + 'px sans-serif'; ctx.fillText('♪', w * 0.2, -h * 0.82 - (t % 40) * 0.3); ctx.restore(); }
    // pés pequenos aparecendo
    ctx.fillStyle = '#A0703A'; ell(ctx, -w * 0.08, -1, 2.5, 1.5); ctx.fill(); ell(ctx, w * 0.08, -1, 2.5, 1.5); ctx.fill();
  }
  var ENEMY_TYPES = Object.keys(D);
  function hasEnemy(type) { return Object.prototype.hasOwnProperty.call(D, type); }
  function drawEnemy(ctx, camX, camY, e, alpha, frame) {
    if (e.dead && !(e.deathTimer > 0)) return;
    var t = frame || 0, p = interp(e, alpha), w = e.w, h = e.h, cx = p.x - camX + w / 2, by = p.y - camY + h;
    var dir = (e.facing || 1) >= 0 ? 1 : -1, S = 1.78;
    if (!e.fly) shadow(ctx, cx, by + 1, w * S * 0.8);
    ctx.save(); ctx.translate(cx, by);
    if (e.dead) { ctx.globalAlpha = clamp((e.deathTimer || 10) / 20, 0, 1); ctx.scale(1, -1); ctx.translate(0, h); }
    var st = (!e.fly && !e.dead) ? clamp(-(e.vy || 0) * 0.025, -0.14, 0.16) : 0;
    ctx.scale(S * dir * (1 - st * 0.6), S * (1 + st));
    ctx.lineJoin = 'round';
    D[e.type](ctx, w, h, t, e);
    if (e.hitFlashTimer > 0 && Math.floor(t / 3) % 2 === 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5; ell(ctx, 0, -h / 2, w * 0.5, h * 0.55); ctx.fillStyle = '#fff'; ctx.fill(); }
    ctx.restore();
    if (e.stagger > 30 && !e.dead) { stars3(ctx, cx, by - h * S - 6, t); if (e.tied > 0 || e.stagger > 100) { ctx.save(); ctx.strokeStyle = '#C9A26B'; ctx.lineWidth = 2; ell(ctx, cx, by - h * S * 0.5, w * 0.7, 5); ctx.stroke(); ctx.restore(); } }
  }

  /* ============================================================ QUIBUNGO (lenda) */
  function drawQuibungo(ctx, e, t, F, blob, eye0) {
    var back = e.st === 'back', run = Math.abs(e.vx) > 0.3 && e.onGround ? Math.sin(t * 0.3) : 0;
    [[-14, run], [14, -run]].forEach(function (a) { ctx.fillStyle = F('#3F2F24'); ctx.fillRect(a[0] - 7, -22, 14, 22 - Math.abs(a[1]) * 2); ctx.strokeRect(a[0] - 7, -22, 14, 22); blob(a[0] + 4, -2, 10, 4, '#2B1E16'); });
    // corpo peludo e enorme
    var g = ctx.createRadialGradient(-6, -52, 4, 0, -42, 40); g.addColorStop(0, F('#7A604C')); g.addColorStop(1, F('#3F2F24'));
    ctx.beginPath(); for (var i = 0; i <= 24; i++) { var a = Math.PI + i / 24 * Math.PI, r = 30 + (i % 2) * 4; ctx.lineTo(Math.cos(a) * r, -24 + Math.sin(a) * (r + 6)); } ctx.lineTo(30, -18); ctx.lineTo(-30, -18); ctx.closePath(); ctx.fillStyle = g; ctx.fill(); ctx.stroke();
    // boca nas costas (abre no ataque)
    ctx.save(); ctx.translate(-22, -44); var open = back ? 8 + Math.sin(t * 0.4) * 3 : 2;
    ctx.fillStyle = '#5A0F0F'; ctx.beginPath(); ctx.ellipse(0, 0, 9, open, 0.4, 0, TAU); ctx.fill(); ctx.stroke();
    if (back) { ctx.fillStyle = '#FFF'; for (var k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(k * 3.4 - 1.5, -open + 1); ctx.lineTo(k * 3.4, -open + 5); ctx.lineTo(k * 3.4 + 1.5, -open + 1); ctx.fill(); } }
    ctx.restore();
    // cabeça
    blob(18, -58, 15, 13, '#6A5240');
    ctx.fillStyle = F('#2B1E16'); for (var q = 0; q < 6; q++) { ctx.beginPath(); ctx.moveTo(6 + q * 5, -68); ctx.lineTo(8 + q * 5, -78 - (q % 2) * 3); ctx.lineTo(11 + q * 5, -68); ctx.fill(); }
    eye0(22, -60, 4.5, '#C92A2A', e.hp <= e.maxHp / 2 ? '#FF3B30' : null);
    ctx.fillStyle = '#FFF'; ctx.beginPath(); ctx.moveTo(22, -50); ctx.lineTo(24, -45); ctx.lineTo(27, -50); ctx.fill();
  }

  /* ============================================================ HERÓIS */
  function drawJegue(ctx, cx, feet, dir, t, moving, alpha, sc, kick) {
    sc = sc || 1.85; // v3.6: jegue aumentado e proporcional ao Tonho/Zefinha
    ctx.save(); ctx.translate(cx, feet); ctx.scale(dir * sc, sc); if (alpha != null) ctx.globalAlpha *= alpha;
    var ph = moving ? t * 0.35 : 0, bob = moving ? Math.abs(Math.sin(ph)) * 1.5 : 0;
    // pernas
    [[-16, 0], [-8, Math.PI], [10, Math.PI], [18, 0]].forEach(function (l, li) { var a = moving ? Math.sin(ph + l[1]) * 0.45 : 0; if (kick && li < 2) a = 1.1 + li * 0.2; if (kick && li >= 2) a = -0.6; ctx.save(); ctx.translate(l[0], -16); ctx.rotate(a); rr(ctx, -2.6, 0, 5.2, 16, 2.4); ctx.fillStyle = '#7d7a76'; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = OUT; ctx.stroke(); ctx.fillStyle = '#2b2b2b'; ctx.fillRect(-2.6, 13, 5.2, 3); ctx.restore(); });
    ctx.translate(0, -bob);
    // rabo
    ctx.strokeStyle = '#6b6864'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(-22, -26); ctx.quadraticCurveTo(-30, -20 + Math.sin(t * 0.2) * 3, -28, -10); ctx.stroke(); ctx.fillStyle = '#3a3836'; ell(ctx, -28, -9, 2.5, 3.5); ctx.fill();
    ball(ctx, 0, -26, 25, 11, '#9A958F');
    ell(ctx, 0, -20, 18, 5); ctx.fillStyle = 'rgba(240,235,225,0.55)'; ctx.fill();
    // manta colorida (chita) e sela
    ctx.save(); rr(ctx, -12, -38, 22, 12, 4); var mg = ctx.createLinearGradient(-12, 0, 10, 0); mg.addColorStop(0, '#E03131'); mg.addColorStop(0.5, '#FCC419'); mg.addColorStop(1, '#1C7ED6'); ctx.fillStyle = mg; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = OUT; ctx.stroke(); ctx.restore();
    // pescoço e cabeça
    ctx.save(); ctx.translate(20, -32); ctx.rotate(-0.5 + (moving ? Math.sin(ph) * 0.06 : 0)); rr(ctx, -5, -16, 12, 22, 5); ctx.fillStyle = '#958f88'; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = OUT; ctx.stroke(); ctx.restore();
    ball(ctx, 31, -46, 9, 7, '#A39d96', { rot: 0.4 });
    ball(ctx, 38, -42, 5, 4, '#d8d0c4', { lw: 1.2, rim: false });
    ctx.fillStyle = OUT; ell(ctx, 40, -42, 0.9, 0.9); ctx.fill();
    // orelhonas
    [[24, -54, -0.5], [28, -55, -0.2]].forEach(function (o) { ctx.save(); ctx.translate(o[0], o[1]); ctx.rotate(o[2] + Math.sin(t * 0.1 + o[0]) * 0.08); ell(ctx, 0, -9, 3.2, 10); ctx.fillStyle = '#8f8a84'; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = OUT; ctx.stroke(); ell(ctx, 0, -9, 1.4, 7); ctx.fillStyle = '#d9b8a8'; ctx.fill(); ctx.restore(); });
    eye(ctx, 31, -48, 2.3, {});
    // crina
    ctx.strokeStyle = '#4a4744'; ctx.lineWidth = 2; for (var m = 0; m < 4; m++) { ctx.beginPath(); ctx.moveTo(16 + m * 3, -38 - m * 3); ctx.lineTo(13 + m * 3, -42 - m * 3); ctx.stroke(); }
    ctx.restore();
  }
  function drawZefinha(ctx, x, y, z, t) {
    // x = centro, y = pés
    var moving = z.onGround && Math.abs(z.vx) > 0.4, ph = (z.runFrame || 0) / 6 * TAU;
    var sq = z.landSquash > 0 ? 1 + z.landSquash * 0.03 : 1;
    shadow(ctx, x, y + (z.onGround ? 0 : 6), 52, 0.28);
    ctx.save(); ctx.translate(x, y); ctx.scale((z.facing || 1) * sq * 2.35, 2.35 / sq); ctx.lineJoin = 'round';
    var la = moving ? Math.sin(ph) * 8 : (z.onGround ? 0 : 5), lb = moving ? -Math.sin(ph) * 8 : (z.onGround ? 0 : -4);
    // pernas e sandálias
    [[lb, -3], [la, 3]].forEach(function (l) { ctx.save(); ctx.translate(l[1], -14); ctx.rotate(l[0] * 0.03); rr(ctx, -2.5, 0, 5, 13, 2.5); ctx.fillStyle = '#B07848'; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = OUT; ctx.stroke(); ctx.fillStyle = '#7A3E12'; rr(ctx, -3, 11, 8, 3, 1.5); ctx.fill(); ctx.restore(); });
    var bob = moving ? -Math.abs(Math.sin(ph)) * 1.5 : 0; ctx.translate(0, bob);
    // vestido de chita
    ctx.beginPath(); ctx.moveTo(-6, -27); ctx.lineTo(6, -27); ctx.quadraticCurveTo(13, -14, 12 + Math.sin(t * 0.2) * (moving ? 1.5 : 0), -11); ctx.lineTo(-12, -11); ctx.quadraticCurveTo(-13, -14, -6, -27); ctx.closePath();
    var dg = ctx.createLinearGradient(0, -27, 0, -11); dg.addColorStop(0, '#F06595'); dg.addColorStop(1, '#C2255C'); ctx.fillStyle = dg; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = OUT; ctx.stroke();
    var fl = [[-7, -15], [-1, -19], [6, -14], [3, -23], [-4, -24], [9, -18]]; for (var i = 0; i < fl.length; i++) { ctx.fillStyle = i % 2 ? '#FFE066' : '#FFFFFF'; ell(ctx, fl[i][0], fl[i][1], 1.6, 1.6); ctx.fill(); ctx.fillStyle = '#2F9E44'; ell(ctx, fl[i][0] + 1.8, fl[i][1] + 0.6, 1, 0.6); ctx.fill(); }
    ctx.fillStyle = '#FFF3BF'; ctx.fillRect(-12, -12.5, 24, 1.6);
    // braço de trás
    ctx.save(); ctx.translate(-5, -25); ctx.rotate(moving ? Math.sin(ph) * 0.5 : 0.2); rr(ctx, -2, 0, 4, 10, 2); ctx.fillStyle = '#B07848'; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = OUT; ctx.stroke(); ctx.restore();
    // cabeça
    ball(ctx, 1, -33, 7, 7, '#C68B59', { lw: 1.6 });
    // trança
    ctx.save(); ctx.translate(-5, -33); ctx.rotate(0.25 + (z.vx || 0) * -0.04 + Math.sin(t * 0.15) * 0.05); for (var b = 0; b < 4; b++) { ball(ctx, -1 - b * 1.2, 2 + b * 4, 2.6, 2.4, '#1A1110', { lw: 1, rim: false }); } ctx.fillStyle = '#E03131'; ell(ctx, -6, 18, 2.2, 1.6); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#1A1110'; ctx.beginPath(); ctx.ellipse(0, -36, 7.5, 4, 0, Math.PI, TAU); ctx.fill();
    // olho, bochecha e sorriso
    if ((z.blinkTimer || 1) < 0) { ctx.fillStyle = OUT; ctx.fillRect(3, -34, 4, 1.2); } else eye(ctx, 4.5, -33.5, 1.9, { iris: '#3a2410' });
    ctx.fillStyle = 'rgba(240,101,149,0.45)'; ell(ctx, 4, -30, 2, 1.2); ctx.fill();
    ctx.strokeStyle = '#5c2a1a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(5, -30.5, 2, 0.2, Math.PI - 0.6); ctx.stroke();
    // chapéu de palha com flor
    ctx.save(); ctx.translate(1, -39); ctx.rotate((z.hatTilt || 0) * 0.8);
    var hg = ctx.createLinearGradient(0, -8, 0, 2); hg.addColorStop(0, '#FFE8A3'); hg.addColorStop(1, '#D9A441');
    ell(ctx, 0, 0, 12.5, 3); ctx.fillStyle = hg; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-6.5, 0); ctx.quadraticCurveTo(-6, -8, 0, -8); ctx.quadraticCurveTo(6, -8, 6.5, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#C2255C'; ctx.fillRect(-6.2, -2.5, 12.4, 2);
    for (var pt = 0; pt < 5; pt++) { var a = pt * TAU / 5; ctx.fillStyle = '#FF8787'; ell(ctx, 5 + Math.cos(a) * 2, -3 + Math.sin(a) * 2, 1.6, 1.6); ctx.fill(); } ctx.fillStyle = '#FFE066'; ell(ctx, 5, -3, 1.1, 1.1); ctx.fill();
    ctx.restore();
    // braço da frente com baladeira
    var atk = (z.whipCooldown || 0) > 8;
    ctx.save(); ctx.translate(4, -25); ctx.rotate(atk ? -1.4 : (moving ? -Math.sin(ph) * 0.5 : 0.1)); rr(ctx, -2, 0, 4, 10, 2); ctx.fillStyle = '#C68B59'; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.strokeStyle = '#6B3E1E'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(0, 14); ctx.moveTo(0, 14); ctx.lineTo(-3, 18); ctx.moveTo(0, 14); ctx.lineTo(3, 18); ctx.stroke(); ctx.restore();
    if (!z.onGround && z.usedDouble && z.vy < 0) { ctx.save(); ctx.globalAlpha = 0.6; ctx.strokeStyle = '#FFC9DE'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 2, 10, 0, Math.PI); ctx.stroke(); ctx.restore(); }
    ctx.restore();
  }

  /* Menino Cabeça de Vento (travesso, boné com catavento girando, camiseta listrada e estilingue) */
  function drawCabecaVento(ctx, x, y, h, t) {
    var moving = h.onGround && Math.abs(h.vx) > 0.4, ph = (h.runFrame || 0) / 6 * TAU;
    var sq = h.landSquash > 0 ? 1 + h.landSquash * 0.03 : 1;
    shadow(ctx, x, y + (h.onGround ? 0 : 6), 50, 0.28);
    ctx.save(); ctx.translate(x, y); ctx.scale((h.facing || 1) * sq * 2.30, 2.30 / sq); ctx.lineJoin = 'round';
    var la = moving ? Math.sin(ph) * 9 : (h.onGround ? 0 : 6), lb = moving ? -Math.sin(ph) * 9 : (h.onGround ? 0 : -5);
    [[lb, -3.5], [la, 3.5]].forEach(function (l) {
      ctx.save(); ctx.translate(l[1], -13); ctx.rotate(l[0] * 0.035);
      rr(ctx, -2.5, 0, 5, 8, 2); ctx.fillStyle = '#1C7ED6'; ctx.fill(); ctx.lineWidth = 1.3; ctx.strokeStyle = OUT; ctx.stroke();
      rr(ctx, -2.2, 6, 4.4, 6, 2); ctx.fillStyle = '#D99B66'; ctx.fill(); ctx.stroke();
      rr(ctx, -3, 10.5, 8.5, 3.5, 1.8); ctx.fillStyle = '#E03131'; ctx.fill(); ctx.stroke();
      ctx.restore();
    });
    var bob = moving ? -Math.abs(Math.sin(ph)) * 1.6 : Math.sin(t * 0.08) * 0.5;
    ctx.translate(0, bob);
    // Camiseta listrada amarela e azul de menino travesso
    box(ctx, -7.5, -26, 15, 14, 4, '#FFD43B', 1.5);
    ctx.fillStyle = '#1C7ED6';
    ctx.fillRect(-7, -23, 14, 2.5); ctx.fillRect(-7, -18, 14, 2.5);
    // Cabeça expressiva com sorriso travesso e band-aid na bochecha
    ball(ctx, 1, -33.5, 7.6, 7.2, '#D99B66', { lw: 1.6 });
    eye(ctx, 4.8, -34, 2.2, { iris: '#1864AB' });
    eye(ctx, -0.5, -34, 2.0, { iris: '#1864AB' });
    // Sorriso largo de moleque
    ctx.fillStyle = '#FFF'; ctx.beginPath(); ctx.arc(4.2, -30, 2.6, 0.1, Math.PI - 0.1); ctx.fill();
    ctx.lineWidth = 1.1; ctx.strokeStyle = OUT; ctx.stroke();
    // Boné colorido virado pra trás + hélice de catavento girando no topo!
    ctx.save(); ctx.translate(0.5, -39);
    ctx.beginPath(); ctx.arc(0, 1, 7.8, Math.PI, TAU); ctx.closePath();
    ctx.fillStyle = '#E03131'; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = OUT; ctx.stroke();
    rr(ctx, -13, -1, 7, 3, 1.5); ctx.fillStyle = '#1C7ED6'; ctx.fill(); ctx.stroke();
    // Catavento / hélice girando no topo do boné
    ctx.strokeStyle = '#FFD43B'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(0, -11); ctx.stroke();
    var propW = Math.cos(t * 0.45) * 8;
    ctx.fillStyle = '#51CF66'; ell(ctx, -propW * 0.5, -11, Math.abs(propW * 0.5) + 1.5, 1.8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#FCC419'; ell(ctx, propW * 0.5, -11, Math.abs(propW * 0.5) + 1.5, 1.8); ctx.fill(); ctx.stroke();
    ctx.restore();
    // Braço com estilingue / brinquedo
    var atk = (h.whipCooldown || 0) > 6;
    ctx.save(); ctx.translate(4.5, -24); ctx.rotate(atk ? -1.3 : (moving ? -Math.sin(ph) * 0.5 : 0.15));
    rr(ctx, -2, 0, 4, 9.5, 2); ctx.fillStyle = '#D99B66'; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.strokeStyle = '#8B5A2B'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(0, 9); ctx.lineTo(0, 13); ctx.lineTo(-3, 17); ctx.moveTo(0, 13); ctx.lineTo(3, 17); ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  /* Galinha Melindrosa (galinha caipira invocada com lenço florido, crista vermelha e asas ágeis) */
  function drawGalinha(ctx, x, y, h, t) {
    var moving = h.onGround && Math.abs(h.vx) > 0.4, ph = (h.runFrame || 0) / 6 * TAU;
    var air = !h.onGround;
    shadow(ctx, x, y + (h.onGround ? 0 : 6), 48, 0.28);
    ctx.save(); ctx.translate(x, y); ctx.scale((h.facing || 1) * 2.30, 2.30); ctx.lineJoin = 'round';
    // Pés amarelos de galinha
    var la = moving ? Math.sin(ph) * 10 : (air ? 7 : 0), lb = moving ? -Math.sin(ph) * 10 : (air ? -6 : 0);
    [[lb, -3], [la, 3]].forEach(function (l) {
      ctx.save(); ctx.translate(l[1], -11); ctx.rotate(l[0] * 0.04);
      ctx.strokeStyle = '#F59F00'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 10); ctx.moveTo(-3, 10); ctx.lineTo(4, 10); ctx.stroke();
      ctx.restore();
    });
    var bob = moving ? -Math.abs(Math.sin(ph)) * 1.8 : Math.sin(t * 0.1) * 0.6;
    ctx.translate(0, bob);
    // Rabo de penas em leque
    for (var rf = 0; rf < 4; rf++) {
      ctx.save(); ctx.translate(-9, -20); ctx.rotate(-0.7 - rf * 0.22 + Math.sin(t * 0.15 + rf) * 0.08);
      ell(ctx, -6, 0, 7, 2.8); ctx.fillStyle = rf % 2 ? '#D9480F' : '#FCC419'; ctx.fill();
      ctx.lineWidth = 1.2; ctx.strokeStyle = OUT; ctx.stroke();
      ctx.restore();
    }
    // Corpo roliço 2.5D de galinha caipira
    ball(ctx, -1, -19, 11.5, 9.5, '#F08C00', { lw: 1.6 });
    ball(ctx, 1, -17, 8, 6, '#FFD8A8', { lw: 0, rim: false });
    // Lenço rosa florido de chita no pescoço ("Melindrosa")
    ctx.fillStyle = '#F06595';
    ctx.beginPath(); ctx.moveTo(2, -25); ctx.lineTo(10, -23); ctx.lineTo(6, -17); ctx.closePath();
    ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = OUT; ctx.stroke();
    // Asa batendo
    var flap = air ? Math.sin(t * 0.85) * 0.9 : (moving ? Math.sin(ph) * 0.35 : 0.1);
    ctx.save(); ctx.translate(-1, -20); ctx.rotate(flap);
    ell(ctx, -2, 2, 7.5, 4.8, -0.2); ctx.fillStyle = '#E8590C'; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.restore();
    // Cabeça, crista vermelha tripla, bico afiado e óculos/olhar invocado
    ball(ctx, 6.5, -29.5, 6.2, 5.8, '#F76707', { lw: 1.5 });
    // Crista vermelha
    for (var cr = 0; cr < 3; cr++) {
      ball(ctx, 4 + cr * 2.6, -36 - (cr === 1 ? 1.5 : 0), 2.4, 3.2, '#E03131', { lw: 1.1, rim: false });
    }
    // Papo vermelho e bico dourado
    ball(ctx, 9.5, -25.5, 1.8, 2.6, '#E03131', { lw: 1, rim: false });
    ctx.fillStyle = '#FFD43B';
    ctx.beginPath(); ctx.moveTo(11, -31); ctx.lineTo(17, -29); ctx.lineTo(11, -27); ctx.closePath();
    ctx.fill(); ctx.lineWidth = 1.3; ctx.strokeStyle = OUT; ctx.stroke();
    eye(ctx, 8.2, -30.5, 2.1, { iris: '#2B1A0C', angry: 1 });
    ctx.restore();
  }

  /* Bode Toddy (amigo e montaria especial: bode chocolate forte com chifres dourados e bandana vermelha) */
  function drawBodeToddy(ctx, cx, feet, dir, t, moving, alpha, sc, charge) {
    sc = sc || 1.85;
    ctx.save(); ctx.translate(cx, feet); ctx.scale(dir * sc, sc); if (alpha != null) ctx.globalAlpha *= alpha;
    var ph = moving ? t * 0.42 : 0, bob = moving ? Math.abs(Math.sin(ph)) * 1.8 : 0;
    // 4 patas fortes com cascos dourados
    [[-15, 0], [-7, Math.PI], [9, Math.PI], [17, 0]].forEach(function (l) {
      var a = moving ? Math.sin(ph + l[1]) * 0.5 : 0;
      ctx.save(); ctx.translate(l[0], -15); ctx.rotate(a);
      rr(ctx, -2.6, 0, 5.2, 15, 2.2); ctx.fillStyle = '#5C3A21'; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = OUT; ctx.stroke();
      ctx.fillStyle = '#FCC419'; ctx.fillRect(-2.6, 12, 5.2, 3);
      ctx.restore();
    });
    ctx.translate(0, -bob);
    // Rabinho empinado
    ctx.strokeStyle = '#4A2C16'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-20, -26); ctx.lineTo(-26, -33 + Math.sin(t * 0.25) * 2); ctx.stroke();
    // Corpo chocolate "Toddy" musculoso
    ball(ctx, 0, -25, 23, 11.5, '#6F4518', { lw: 1.6 });
    // Manta/Bandana vermelha estilosa com estrela dourada "T"
    rr(ctx, -10, -36, 20, 11, 4); ctx.fillStyle = '#E03131'; ctx.fill(); ctx.lineWidth = 1.3; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.fillStyle = '#FFD43B'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('★TODDY', 0, -28);
    // Pescoço e Cabeça
    ctx.save();
    ctx.translate(19, -31);
    ctx.rotate(charge ? 0.38 : (-0.25 + (moving ? Math.sin(ph) * 0.08 : 0)));
    ball(ctx, 4, -8, 9.5, 7.5, '#7A4E24', { lw: 1.5 });
    // Cavanhaque branco estiloso de bode
    ctx.fillStyle = '#FFF3BF';
    ctx.beginPath(); ctx.moveTo(10, -3); ctx.lineTo(14, 5); ctx.lineTo(7, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
    // Chifres Dourados Retorcidos de Cabrito Montês!
    ctx.strokeStyle = '#FFD43B'; ctx.lineWidth = 4.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(1, -14); ctx.quadraticCurveTo(-8, -28, -16, -18); ctx.stroke();
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.stroke();
    eye(ctx, 7, -10, 2.4, { iris: '#FAB005', angry: charge ? 1 : 0 });
    ctx.restore();
    if (charge) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = '#FFD43B'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(32, -32, 16 + Math.sin(t * 0.8) * 3, -0.9, 0.9); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  /* Mestre Sanfoneiro Seu Lunga (chapéu de couro, bigode branco farto, óculos redondos e sanfona de 8 baixos) */
  function drawSeuLunga(ctx, x, y, h, t) {
    var moving = h.onGround && Math.abs(h.vx) > 0.4, ph = (h.runFrame || 0) / 6 * TAU;
    shadow(ctx, x, y + (h.onGround ? 0 : 6), 52, 0.28);
    ctx.save(); ctx.translate(x, y); ctx.scale((h.facing || 1) * 2.32, 2.32); ctx.lineJoin = 'round';
    var la = moving ? Math.sin(ph) * 7 : 0, lb = moving ? -Math.sin(ph) * 7 : 0;
    [[lb, -3.5], [la, 3.5]].forEach(function (l) {
      ctx.save(); ctx.translate(l[1], -13); ctx.rotate(l[0] * 0.03);
      rr(ctx, -2.6, 0, 5.2, 12, 2); ctx.fillStyle = '#495057'; ctx.fill(); ctx.lineWidth = 1.3; ctx.strokeStyle = OUT; ctx.stroke();
      rr(ctx, -3, 10, 8, 3.5, 1.5); ctx.fillStyle = '#3B2414'; ctx.fill(); ctx.stroke();
      ctx.restore();
    });
    var bob = moving ? -Math.abs(Math.sin(ph)) * 1.4 : 0; ctx.translate(0, bob);
    // Camisa branca e colete de couro bordado
    box(ctx, -8, -26, 16, 14, 4, '#F8F9FA', 1.4);
    box(ctx, -7.5, -26, 6, 13, 2, '#8B5A2B', 1.2);
    box(ctx, 1.5, -26, 6, 13, 2, '#8B5A2B', 1.2);
    // Sanfona de 8 baixos no peito!
    var fole = 1 + Math.sin(t * 0.25) * 0.18;
    box(ctx, -6 * fole, -23, 12 * fole, 8, 2, '#E03131', 1.3);
    ctx.strokeStyle = '#FFD43B'; ctx.lineWidth = 1;
    for (var sf = -3; sf <= 3; sf += 3) { ctx.beginPath(); ctx.moveTo(sf, -23); ctx.lineTo(sf, -15); ctx.stroke(); }
    // Cabeça de Seu Lunga com óculos e bigodão branco arretado
    ball(ctx, 0.8, -33.5, 7.6, 7.2, '#D9A070', { lw: 1.5 });
    eye(ctx, 4.5, -34.5, 2.1, { iris: '#212529', angry: 1 });
    ctx.strokeStyle = '#FFD43B'; ctx.lineWidth = 1.2; ell(ctx, 4.5, -34.5, 3.1, 3.1); ctx.stroke();
    // Bigode branco gigante
    ctx.fillStyle = '#F8F9FA';
    ctx.beginPath(); ctx.moveTo(0, -30.5); ctx.quadraticCurveTo(5, -32.5, 9.5, -28.5); ctx.quadraticCurveTo(4, -28, 0, -30.5);
    ctx.moveTo(2, -30.5); ctx.quadraticCurveTo(-3, -32.5, -6.5, -28.5); ctx.quadraticCurveTo(-1, -28, 2, -30.5);
    ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = OUT; ctx.stroke();
    // Chapéu de couro sertanejo
    ctx.fillStyle = '#9C5A2E';
    ell(ctx, 0.5, -39.5, 13, 3.2); ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.beginPath(); ctx.arc(0.5, -39.5, 7, Math.PI, TAU); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  /* Tatu-Bola Cascudo (parceiro tatu blindado que rola como bola de canhão!) */
  function drawTatuBola(ctx, x, y, h, t) {
    var moving = h.onGround && Math.abs(h.vx) > 0.4, ph = (h.runFrame || 0) / 6 * TAU;
    var rolling = (!h.onGround && Math.abs(h.vy) > 1.5) || (h.whipTimer > 0 && h.meleeWeapon === 'giro_tatu');
    shadow(ctx, x, y + (h.onGround ? 0 : 6), 50, 0.28);
    ctx.save(); ctx.translate(x, y); ctx.scale((h.facing || 1) * 2.30, 2.30); ctx.lineJoin = 'round';
    if (rolling) {
      ctx.translate(0, -18);
      ctx.rotate(t * 0.55);
      ball(ctx, 0, 0, 14, 14, '#B07A45', { lw: 1.8 });
      ctx.strokeStyle = '#FFD43B'; ctx.lineWidth = 2;
      for (var ri = 0; ri < 4; ri++) { ctx.rotate(Math.PI / 4); ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(12, 0); ctx.stroke(); }
      ctx.restore();
      return;
    }
    var la = moving ? Math.sin(ph) * 7 : 0, lb = moving ? -Math.sin(ph) * 7 : 0;
    [[lb, -3.5], [la, 3.5]].forEach(function (l) {
      ctx.save(); ctx.translate(l[1], -11); ctx.rotate(l[0] * 0.035);
      rr(ctx, -2.6, 0, 5.2, 10, 2.2); ctx.fillStyle = '#8B5A2B'; ctx.fill(); ctx.lineWidth = 1.3; ctx.strokeStyle = OUT; ctx.stroke();
      ctx.restore();
    });
    // Casco dourado 2.5D nas costas
    ball(ctx, -3, -21, 11, 12, '#9C6B30', { lw: 1.6 });
    ball(ctx, 1, -20, 8.5, 9.5, '#E3B05A', { lw: 1.3 });
    // Cabeça com faixa vermelha de guerreiro e orelhinhas
    ball(ctx, 5, -31, 6.8, 6.2, '#C68B59', { lw: 1.5 });
    ctx.fillStyle = '#E03131'; ctx.fillRect(-1.5, -34.5, 13, 2.6);
    eye(ctx, 7.5, -31.5, 2.1, { iris: '#2B1A0C', angry: 1 });
    ctx.restore();
  }

  function drawSingleHeroByKind(ctx, camX, camY, hero, x, feet, alpha, t) {
    var k = hero.hero || 'tonho';
    if (k === 'zefinha') drawZefinha(ctx, x, feet, hero, t);
    else if (k === 'cabeca_vento') drawCabecaVento(ctx, x, feet, hero, t);
    else if (k === 'galinha') drawGalinha(ctx, x, feet, hero, t);
    else if (k === 'bode_toddy') {
      var mvB = hero.onGround && Math.abs(hero.vx) > 0.4;
      var chgB = hero.whipTimer > 0 || hero.dash > 0;
      shadow(ctx, x, feet + 1, 76, 0.3);
      drawBodeToddy(ctx, x, feet, hero.facing || 1, t, mvB, 1, 1.85, chgB);
    }
    else if (k === 'seu_lunga') drawSeuLunga(ctx, x, feet, hero, t);
    else if (k === 'tatu_bola') drawTatuBola(ctx, x, feet, hero, t);
    else if (G.OxeHD && G.OxeHD.drawTonhoHD) {
      G.OxeHD.drawTonhoHD(ctx, camX, camY, hero, alpha, t);
    }
  }

  function drawKartVehicle(ctx, x, feet, dir, t, color, label) {
    ctx.save();
    ctx.translate(x, feet);
    ctx.scale(dir, 1);
    // Chamas do escapamento turbo
    if (Math.floor(t / 2) % 2 === 0) {
      ctx.fillStyle = '#FF922B';
      ell(ctx, -44, -14, 12 + (t % 5), 6); ctx.fill();
      ctx.fillStyle = '#FFE066';
      ell(ctx, -40, -14, 7, 3.5); ctx.fill();
    }
    // Chassi de Carrinho de Rolimã / Kart Sertanejo Turbinado
    box(ctx, -36, -22, 72, 14, 6, color || '#E03131', 2.2);
    box(ctx, -18, -30, 34, 10, 4, '#FCC419', 1.8);
    // Volante
    ctx.strokeStyle = OUT; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(14, -22); ctx.lineTo(22, -34); ctx.stroke();
    // Rodas de rolimã cromadas girando
    [-24, 24].forEach(function (wx) {
      ctx.save(); ctx.translate(wx, -7);
      ball(ctx, 0, 0, 11, 11, '#343A40', { lw: 2 });
      ctx.rotate(t * 0.45);
      ctx.strokeStyle = '#FFD43B'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.stroke();
      ball(ctx, 0, 0, 4, 4, '#ADB5BD', { lw: 1, rim: false });
      ctx.restore();
    });
    if (label) {
      ctx.fillStyle = '#FFF'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(label, -2, -12);
    }
    ctx.restore();
  }

  function drawHero(ctx, camX, camY, hero, alpha, frame) {
    var t = frame || 0, p = interp(hero, alpha), x = p.x - camX + hero.w / 2, feet = p.y - camY + hero.h;
    if (hero.invuln > 0 && !hero.dead && Math.floor(hero.invuln / 5) % 2 === 0 && hero.dazed <= 0) return;
    if (hero.dead) { ctx.save(); ctx.translate(x, feet - hero.h / 2); ctx.rotate(Math.PI); ctx.translate(-x, -(feet - hero.h / 2)); }

    // Aura Dourada do Especial Supremo em Dupla (União)!
    if ((G._unionSpecialTimer || 0) > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var ug = ctx.createRadialGradient(x, feet - 36, 6, x, feet - 36, 68);
      ug.addColorStop(0, 'rgba(255,243,191,0.75)');
      ug.addColorStop(0.5, 'rgba(255,180,40,0.42)');
      ug.addColorStop(1, 'rgba(255,140,0,0)');
      ctx.fillStyle = ug; ctx.fillRect(x - 70, feet - 106, 140, 140);
      ctx.restore();
    }

    // Círculo de Equipe e Super no chão em Fases Estilo Brawl Stars!
    if (G._oxeSpecialMode === 'brawlstars' && !hero.dead) {
      ctx.save();
      ell(ctx, x, feet - 2, 30, 12);
      ctx.fillStyle = 'rgba(51,154,240,0.28)'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#339af0'; ctx.stroke();
      if ((G._brawlSuperPct || 0) >= 100) {
        ctx.setLineDash([6, 4]);
        ell(ctx, x, feet - 2, 36, 15);
        ctx.lineWidth = 2.5; ctx.strokeStyle = '#ffd43b'; ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }

    // Modo Corrida Oxe-Kart: desenha o herói dentro do Kart Turbinado!
    if (G._oxeSpecialMode === 'kart') {
      var riderFake = Object.create(hero);
      riderFake.x = p.x; riderFake.prevX = p.x; riderFake.y = p.y - 16; riderFake.prevY = p.y - 16;
      drawSingleHeroByKind(ctx, camX, camY, riderFake, x, feet - 16, alpha, t);
      drawKartVehicle(ctx, x, feet, hero.facing || 1, t, '#E03131', 'OXE-1');
    }
    // Modo Voo do Carcará (Asa-Delta / Balão-Foguete)
    else if (G._oxeSpecialMode === 'shmup') {
      ctx.save();
      // Asa-delta de couro e fogo nas costas
      ctx.translate(x, feet - 44);
      ctx.scale(hero.facing || 1, 1);
      ctx.fillStyle = '#D9480F';
      ctx.beginPath(); ctx.moveTo(-36, -18); ctx.lineTo(28, -6); ctx.lineTo(-22, 8); ctx.closePath();
      ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
      ctx.fillStyle = '#FFD43B'; ell(ctx, -34, -4, 10 + (t % 5), 5); ctx.fill();
      ctx.restore();
      drawSingleHeroByKind(ctx, camX, camY, hero, x, feet, alpha, t);
    }
    else if (!hero.mount) {
      drawSingleHeroByKind(ctx, camX, camY, hero, x, feet, alpha, t);
    } else {
      var moving = hero.onGround && Math.abs(hero.vx) > 0.4;
      var mKind = hero.mount.kind || 'jegue';
      shadow(ctx, x, feet + 1, 104, 0.3);
      var kick = hero.whipTimer > 0 && (hero.meleeWeapon === 'patada' || hero.meleeWeapon === 'jegue_coice' || hero.meleeWeapon === 'jegue_disparada' || hero.meleeWeapon === 'chifrada_toddy');
      if (mKind === 'bode_toddy') {
        drawBodeToddy(ctx, x, feet, hero.facing || 1, (hero.mount.t || t), moving, 1, 1.85, kick);
      } else {
        drawJegue(ctx, x, feet, hero.facing || 1, (hero.mount.t || t), moving, 1, 1.85, kick);
      }
      if (kick) {
        ctx.save(); ctx.globalAlpha = 0.75; ctx.strokeStyle = '#FFF3BF'; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.arc(x + (mKind === 'bode_toddy' ? 1 : -1) * (hero.facing || 1) * 48, feet - 26, 22, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      // Desenha qualquer herói montado em cima do Jegue ou do Bode Toddy!
      var rider = Object.create(hero);
      rider.w = 28; rider.h = 44; rider.onGround = false; rider.vx = 0; rider.vy = 0; rider.runFrame = 0; rider.gliding = false;
      rider.x = p.x + 4; rider.prevX = rider.x; rider.y = p.y + hero.h - 44 - 54; rider.prevY = rider.y; rider.invuln = 0;
      drawSingleHeroByKind(ctx, camX, camY, rider, x + 4 * (hero.facing || 1), feet - 54, 1, t);
    }
    if (hero.dead) ctx.restore();
    if (hero.dazed > 0) stars3(ctx, x, feet - hero.h - 8, t);

    // Barra de Vida + 3 Barras de Munição em cima do personagem no Modo Brawl Stars!
    if (G._oxeSpecialMode === 'brawlstars' && !hero.dead) {
      var hy = feet - hero.h * 2.15 - 18;
      var bw = 64, hpPct = clamp((hero.hp || 3) / (hero.maxHp || 5), 0, 1);
      box(ctx, x - bw / 2, hy, bw, 9, 4, '#212529', 1.4);
      if (hpPct > 0) box(ctx, x - bw / 2 + 1, hy + 1, (bw - 2) * hpPct, 7, 3, '#51cf66', 0);
      // 3 slots de munição laranja estilo Brawl Stars
      var ammo = G._brawlAmmo != null ? G._brawlAmmo : 3;
      for (var ai = 0; ai < 3; ai++) {
        var ax = x - bw / 2 + ai * 22;
        box(ctx, ax, hy + 11, 20, 5, 2, ai < ammo ? '#ff922b' : '#495057', 1);
      }
    }
  }
  function drawDazed(ctx, camX, camY, hero, alpha, frame) { var p = interp(hero, alpha); stars3(ctx, p.x - camX + hero.w / 2, p.y - camY - 8, frame); }
  function drawSwapMark(ctx, camX, camY, hero, frame) {
    var p = interp(hero, 1), x = p.x - camX + hero.w / 2, y = p.y - camY - 14 - Math.sin(frame * 0.2) * 3;
    ctx.save(); ctx.globalAlpha = clamp(hero.swapMark / 25, 0, 1); ctx.fillStyle = hero.hero === 'zefinha' ? '#F06595' : '#FFD43B'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x - 7, y - 8); ctx.lineTo(x + 7, y - 8); ctx.lineTo(x, y); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  function drawFleeing(ctx, camX, camY, list, frame) {
    for (var i = 0; i < list.length; i++) { var j = list[i]; drawJegue(ctx, j.x - camX, j.y - camY, j.facing, frame, true, clamp(j.t / 30, 0, 1)); }
  }

  /* ============================================================ ITENS NOVOS */
  function drawItem(ctx, type, x, y, t) {
    ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.lineJoin = 'round';
    switch (type) {
      case 'porrete': ctx.save(); ctx.translate(x, y); ctx.rotate(-0.7 + Math.sin(t * 2) * 0.1); box(ctx, -4, -14, 8, 26, 4, '#8B5A2B'); ball(ctx, 0, -14, 7, 6, '#6F4518', { lw: 1.6 }); ctx.strokeStyle = 'rgba(40,20,5,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-2, -6); ctx.lineTo(-2, 6); ctx.stroke(); ctx.restore(); return true;
      case 'laco': ctx.save(); ctx.translate(x, y); ctx.strokeStyle = '#8B5A2B'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.ellipse(0, -2, 11, 8, Math.sin(t) * 0.2, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.moveTo(8, 4); ctx.quadraticCurveTo(14, 12, 6, 14); ctx.stroke(); ctx.strokeStyle = '#E9C46A'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(0, -2, 11, 8, Math.sin(t) * 0.2, 0, TAU); ctx.stroke(); ctx.restore(); return true;
      case 'zabumba': ctx.save(); ctx.translate(x, y); ell(ctx, 0, 6, 13, 5); ctx.fillStyle = '#A0522D'; ctx.fill(); ctx.stroke(); box(ctx, -13, -7, 26, 13, 2, '#C0392B'); ctx.strokeStyle = '#FFE066'; ctx.lineWidth = 1.2; ctx.beginPath(); for (var k = -10; k <= 10; k += 5) { ctx.moveTo(k, -7); ctx.lineTo(k + 3, 6); } ctx.stroke(); ell(ctx, 0, -7, 13, 5); ctx.fillStyle = '#F8F0E3'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.stroke(); ctx.restore(); return true;
      case 'candeeiro': ctx.save(); ctx.translate(x, y); box(ctx, -7, -2, 14, 13, 3, '#868E96'); ctx.strokeStyle = OUT; ctx.beginPath(); ctx.arc(0, -4, 7, Math.PI, TAU); ctx.stroke(); var fl = Math.sin(t * 8) * 1.5; ctx.save(); ctx.shadowColor = '#FFD43B'; ctx.shadowBlur = 12; ctx.fillStyle = '#FFA94D'; ctx.beginPath(); ctx.moveTo(-3, -2); ctx.quadraticCurveTo(0, -14 - fl, 3, -2); ctx.fill(); ctx.fillStyle = '#FFF3BF'; ctx.beginPath(); ctx.moveTo(-1.5, -2); ctx.quadraticCurveTo(0, -8 - fl, 1.5, -2); ctx.fill(); ctx.restore(); ctx.restore(); return true;
      case 'chocalho': ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 5) * 0.25); ctx.beginPath(); ctx.moveTo(-8, 8); ctx.lineTo(-6, -8); ctx.quadraticCurveTo(0, -13, 6, -8); ctx.lineTo(8, 8); ctx.closePath(); var g = ctx.createLinearGradient(-8, 0, 8, 0); g.addColorStop(0, '#9C6B30'); g.addColorStop(0.5, '#E3B05A'); g.addColorStop(1, '#7A4E1E'); ctx.fillStyle = g; ctx.fill(); ctx.stroke(); ball(ctx, 0, 10, 2.6, 2.6, '#5c3a12', { lw: 1 }); ctx.strokeStyle = '#3B2414'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-4, -11); ctx.quadraticCurveTo(0, -18, 4, -11); ctx.stroke(); ctx.restore(); return true;
      case 'triangulo': ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 2) * 0.15); ctx.strokeStyle = '#ADB5BD'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-10, 9); ctx.lineTo(0, -10); ctx.lineTo(10, 9); ctx.lineTo(-6, 9); ctx.stroke(); ctx.strokeStyle = '#F8F9FA'; ctx.lineWidth = 1; ctx.stroke(); ctx.strokeStyle = '#495057'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(12, -8); ctx.lineTo(4, 4); ctx.stroke(); ctx.restore(); return true;
      case 'presilha': ctx.save(); ctx.translate(x, y); ctx.rotate(-0.5 + Math.sin(t * 2) * 0.2); box(ctx, -12, -3, 24, 6, 3, '#F06595'); ball(ctx, -10, 0, 5, 5, '#FFE066', { lw: 1.4 }); ctx.restore(); badge(ctx, x, y, 'Z'); return true;
      case 'chapeu': ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 2) * 0.2); ell(ctx, 0, 4, 15, 4.5); ctx.fillStyle = '#E9C46A'; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = OUT; ctx.stroke(); ctx.beginPath(); ctx.moveTo(-8, 4); ctx.quadraticCurveTo(-7, -9, 0, -9); ctx.quadraticCurveTo(7, -9, 8, 4); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#C2255C'; ctx.fillRect(-8, 0, 16, 2.5); ctx.restore(); badge(ctx, x, y, 'Z'); return true;
      case 'fita': ctx.save(); ctx.translate(x, y); ctx.strokeStyle = '#F06595'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-12, 6); ctx.bezierCurveTo(-6, -12 + Math.sin(t * 3) * 3, 6, 12, 12, -6); ctx.stroke(); ctx.strokeStyle = '#FFE066'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.restore(); badge(ctx, x, y, 'Z'); return true;
      case 'sombrinha': ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t) * 0.15); var cs = ['#E03131', '#FCC419', '#1C7ED6', '#40C057']; for (var i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(0, -2); ctx.arc(0, -2, 13, Math.PI + i * Math.PI / 4, Math.PI + (i + 1) * Math.PI / 4); ctx.closePath(); ctx.fillStyle = cs[i]; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = OUT; ctx.stroke(); } ctx.strokeStyle = '#5c3d2e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(0, 12); ctx.arc(-3, 12, 3, 0, Math.PI); ctx.stroke(); ctx.restore(); badge(ctx, x, y, 'Z'); return true;
      case 'espelho': ctx.save(); ctx.translate(x, y); box(ctx, -2, 4, 4, 9, 2, '#C2255C'); ell(ctx, 0, -2, 9, 10); ctx.fillStyle = '#F06595'; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = OUT; ctx.stroke(); ell(ctx, 0, -2, 6.5, 7.5); var mg = ctx.createLinearGradient(-6, -9, 6, 5); mg.addColorStop(0, '#FFFFFF'); mg.addColorStop(1, '#A5D8FF'); ctx.fillStyle = mg; ctx.fill(); ctx.restore(); badge(ctx, x, y, 'Z'); return true;
      case 'especial_milho': case 'especial_pamonha': case 'especial_tapioca':
      case 'fantasia_cacto': case 'fantasia_boi': case 'fantasia_sol': {
        var em = { fantasia_cacto: '🌵', fantasia_boi: '🐂', fantasia_sol: '☀️', especial_milho: '🌽', especial_pamonha: '🫔', especial_tapioca: '🥞' }[type];
        if (/^especial/.test(type)) { ctx.save(); ctx.translate(x, y + Math.sin(t * 3) * 2); ctx.globalCompositeOperation = 'lighter'; var g2 = ctx.createRadialGradient(0, 0, 2, 0, 0, 32); g2.addColorStop(0, 'rgba(255,120,120,0.8)'); g2.addColorStop(1, 'rgba(255,80,80,0)'); ctx.fillStyle = g2; ctx.fillRect(-32, -32, 64, 64); ctx.globalCompositeOperation = 'source-over';
          ell(ctx, 0, 0, 15, 15); ctx.fillStyle = '#C92A2A'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#FFE066'; ctx.stroke(); ctx.font = '18px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(em, 0, 6); ctx.font = 'bold 9px sans-serif'; ctx.fillStyle = '#FFE066'; ctx.strokeStyle = OUT; ctx.lineWidth = 2.5; ctx.strokeText('ESPECIAL', 0, -20); ctx.fillText('ESPECIAL', 0, -20); ctx.restore(); return true; }
        ctx.save(); ctx.translate(x, y + Math.sin(t * 3) * 2); ctx.globalCompositeOperation = 'lighter'; var gg = ctx.createRadialGradient(0, 0, 2, 0, 0, 30); gg.addColorStop(0, 'rgba(255,240,150,0.8)'); gg.addColorStop(1, 'rgba(255,200,60,0)'); ctx.fillStyle = gg; ctx.fillRect(-30, -30, 60, 60); ctx.globalCompositeOperation = 'source-over';
        box(ctx, -13, -6, 26, 18, 4, '#8B5A2B'); box(ctx, -14, -11, 28, 7, 3, '#A0522D'); ctx.fillStyle = '#FFD43B'; ctx.fillRect(-3, -6, 6, 6);
        ctx.font = '20px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(em, 0, -14); ctx.restore(); return true; }
      case 'jegue': ctx.save(); drawJegue(ctx, x - 4, y + 16, 1, t * 10, false, 1, 1.15); ctx.restore(); ctx.save(); ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#FFF3BF'; ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.strokeText('MONTE!', x, y - 38 + Math.sin(t * 3) * 2); ctx.fillText('MONTE!', x, y - 38 + Math.sin(t * 3) * 2); ctx.restore(); return true;
      case 'bode_toddy_mount': ctx.save(); drawBodeToddy(ctx, x - 4, y + 16, 1, t * 10, false, 1, 1.15, false); ctx.restore(); ctx.save(); ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#FFD43B'; ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.strokeText('BODE TODDY!', x, y - 40 + Math.sin(t * 3) * 2); ctx.fillText('BODE TODDY!', x, y - 40 + Math.sin(t * 3) * 2); ctx.restore(); return true;
      case 'reliquia_uniao': {
        var unlocked = (G._unionGaugePct || 0) >= 75;
        ctx.save();
        ctx.translate(x, y + Math.sin(t * 3) * 3);
        ctx.globalCompositeOperation = 'lighter';
        var ug = ctx.createRadialGradient(0, 0, 2, 0, 0, 36);
        ug.addColorStop(0, unlocked ? 'rgba(255,230,80,0.95)' : 'rgba(180,180,220,0.45)');
        ug.addColorStop(1, 'rgba(255,160,0,0)');
        ctx.fillStyle = ug; ctx.fillRect(-36, -36, 72, 72);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = unlocked ? 1 : 0.65;
        ball(ctx, 0, 0, 16, 16, unlocked ? '#FFD43B' : '#868E96', { lw: 2.2 });
        ctx.font = '18px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(unlocked ? '🤝' : '🔒', 0, 6);
        ctx.font = 'bold 9px sans-serif';
        var lbl = unlocked ? 'UNIÃO PRONTA!' : ('UNIÃO ' + Math.floor(G._unionGaugePct || 0) + '%/75%');
        ctx.strokeStyle = OUT; ctx.lineWidth = 3;
        ctx.strokeText(lbl, 0, -22);
        ctx.fillStyle = unlocked ? '#FFE066' : '#DEE2E6';
        ctx.fillText(lbl, 0, -22);
        ctx.restore();
        return true;
      }
      default: {
        // Ícones ilustrados para todas as novas armas de Tonho, Zefinha, Cabeça de Vento, Galinha, Bode Toddy, Seu Lunga e Tatu-Bola!
        var NEW_WP_ICONS = {
          peixeira:       { em: '🗡️', col: '#ADB5BD', b: 'T' },
          bacamarte:      { em: '🎺', col: '#FF922B', b: 'T' },
          berimbau:       { em: '🏹', col: '#D9A441', b: 'T' },
          rede:           { em: '🕸️', col: '#74C0FC', b: 'T' },
          boneca_pano:    { em: '🪆', col: '#F06595', b: 'Z' },
          corda:          { em: '➰', col: '#FF8787', b: 'Z' },
          bilro:          { em: '🧶', col: '#DA77F2', b: 'Z' },
          cajuina:        { em: '🧃', col: '#FFD43B', b: 'Z' },
          estilingue:     { em: '🎯', col: '#FCC419', b: 'C' },
          pipa:           { em: '🪁', col: '#339AF0', b: 'C' },
          chiclete:       { em: '🫧', col: '#F783AC', b: 'C' },
          piao:           { em: '陀', col: '#FF922B', b: 'C' },
          bolinha_gude:   { em: '🔮', col: '#4DABF7', b: 'C' },
          bombinha:       { em: '🧨', col: '#FA5252', b: 'C' },
          aviao_papel:    { em: '✈️', col: '#E9ECEF', b: 'C' },
          ioio:           { em: '🪀', col: '#51CF66', b: 'C' },
          penas:          { em: '🪶', col: '#FF922B', b: 'G' },
          ciscar:         { em: '🌪️', col: '#FCC419', b: 'G' },
          ovo_ouro:       { em: '🥚', col: '#FFD43B', b: 'G' },
          cacarejo:       { em: '📢', col: '#FA5252', b: 'G' },
          bicada_furadeira:{ em: '⚡', col: '#F76707', b: 'G' },
          ninho_pintinhos:{ em: '🐤', col: '#FFE066', b: 'G' },
          redemoinho_penas:{ em: '🌀', col: '#FFA94D', b: 'G' },
          chifrada_toddy: { em: '🐏', col: '#8B5A2B', b: 'B' },
          berro_bode:     { em: '📯', col: '#FCC419', b: 'B' },
          cabecada_sismica:{ em: '💥', col: '#D9480F', b: 'B' },
          coice_bode:     { em: '🦵', col: '#A0522D', b: 'B' },
          lata_toddy:     { em: '🥫', col: '#ADB5BD', b: 'B' },
          salto_cabrito:  { em: '☄️', col: '#FF6B6B', b: 'B' },
          furia_toddy:    { em: '🔥', col: '#E03131', b: 'B' },
          sanfona_fole:   { em: '🪗', col: '#E03131', b: 'L' },
          resposta_braba: { em: '💢', col: '#FA5252', b: 'L' },
          bengala_couro:  { em: '🦯', col: '#8B5A2B', b: 'L' },
          cachimbo_fumaca:{ em: '💨', col: '#ADB5BD', b: 'L' },
          espora_prata:   { em: '⚙️', col: '#CED4DA', b: 'L' },
          forro_trovao:   { em: '⛈️', col: '#FFD43B', b: 'L' },
          giro_tatu:      { em: '🛡️', col: '#D9A441', b: 'A' },
          placa_casco:    { em: '🔶', col: '#E8590C', b: 'A' },
          cavada_sertaneja:{ em: '⛏️', col: '#8B5A2B', b: 'A' },
          terremoto_tatu: { em: '🌋', col: '#C92A2A', b: 'A' },
          espinho_mandacaru:{ em: '🌵', col: '#40C057', b: 'A' },
          tatu_foguete:   { em: '🚀', col: '#FF6B6B', b: 'A' }
        }[type];
        if (NEW_WP_ICONS) {
          ctx.save();
          ctx.translate(x, y + Math.sin(t * 2.5) * 2);
          ball(ctx, 0, 0, 14, 14, NEW_WP_ICONS.col, { lw: 2 });
          ctx.font = '16px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText(NEW_WP_ICONS.em, 0, 6);
          ctx.restore();
          badge(ctx, x, y, NEW_WP_ICONS.b);
          return true;
        }
      }
    }
    return false;
  }

  function badge(ctx, x, y, l) { ctx.save(); ctx.translate(x + 12, y - 12); ell(ctx, 0, 0, 6, 6); ctx.fillStyle = '#C2255C'; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(l, 0, 3); ctx.restore(); }
  // fantasias: desenho por cima do herói (escala 1.18x ancorada nos pés)
  function drawCostume(ctx, camX, camY, hero, frame) {
    if (!hero || !hero.costume || hero.dead) return;
    var p = interp(hero, 1), x = p.x - camX + hero.w / 2, feet = p.y - camY + hero.h, top = feet - hero.h, t = frame, k = hero.costume.type, end = hero.costume.t < 180 && Math.floor(t / 6) % 2 === 0;
    if (end) return; ctx.save();
    ctx.translate(x, feet); ctx.scale(1.18, 1.18); ctx.translate(-x, -feet);
    if (k === 'cacto') {
      ctx.globalAlpha = 0.85; var g = ctx.createLinearGradient(x - 18, 0, x + 18, 0); g.addColorStop(0, 'rgba(47,158,68,0.55)'); g.addColorStop(0.5, 'rgba(140,233,154,0.18)'); g.addColorStop(1, 'rgba(43,138,62,0.55)');
      rr(ctx, x - 17, top - 8, 34, hero.h + 6, 16); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
      rr(ctx, x - 30, top + 10, 12, 20, 6); ctx.fill(); ctx.stroke(); rr(ctx, x + 18, top + 4, 12, 22, 6); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#FFF3BF'; ctx.lineWidth = 1.4; for (var i = 0; i < 14; i++) { var sy = top - 4 + (i * 7) % (hero.h + 2), sx = i % 2 ? x - 17 : x + 17, d = i % 2 ? -1 : 1; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + d * 6, sy - 3); ctx.stroke(); }
      for (var f = 0; f < 5; f++) { var a = f * TAU / 5; ctx.fillStyle = '#FFFFFF'; ell(ctx, x + Math.cos(a) * 4, top - 10 + Math.sin(a) * 3, 3, 2, a); ctx.fill(); } ctx.fillStyle = '#FFD43B'; ell(ctx, x, top - 10, 2, 2); ctx.fill();
    } else if (k === 'boi') {
      var dir = hero.facing || 1;
      ctx.translate(x, top + 4); ctx.scale(dir, 1);
      ctx.fillStyle = 'rgba(201,42,42,0.85)'; ctx.beginPath(); ctx.moveTo(-18, 10); ctx.quadraticCurveTo(0, -4, 18, 10); ctx.lineTo(22, 34); ctx.lineTo(-22, 34); ctx.closePath(); ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = OUT; ctx.stroke();
      var cs = ['#FCC419', '#4DABF7', '#69DB7C', '#F06595']; for (var j = 0; j < 8; j++) { ctx.strokeStyle = cs[j % 4]; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-20 + j * 5.5, 32); ctx.lineTo(-20 + j * 5.5 + Math.sin(t * 0.3 + j) * 3, 44); ctx.stroke(); }
      for (var s2 = -1; s2 <= 1; s2 += 2) { ctx.beginPath(); ctx.moveTo(s2 * 7, -6); ctx.quadraticCurveTo(s2 * 18, -16, s2 * 14 + 8, -24); ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.strokeStyle = OUT; ctx.stroke(); ctx.lineWidth = 3; ctx.strokeStyle = '#FFF3BF'; ctx.stroke(); }
      if (hero.dash > 0) { ctx.globalAlpha = 0.5; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; for (var q = 0; q < 4; q++) { ctx.beginPath(); ctx.moveTo(-30 - q * 8, q * 10); ctx.lineTo(-50 - q * 8, q * 10); ctx.stroke(); } }
    } else if (k === 'sol') {
      ctx.globalCompositeOperation = 'lighter'; var cy = top + hero.h / 2, R = 78 + Math.sin(t * 0.2) * 4;
      var gl = ctx.createRadialGradient(x, cy, 10, x, cy, R); gl.addColorStop(0, 'rgba(255,220,100,0.35)'); gl.addColorStop(0.7, 'rgba(255,140,40,0.18)'); gl.addColorStop(1, 'rgba(255,100,20,0)'); ctx.fillStyle = gl; ctx.fillRect(x - R, cy - R, R * 2, R * 2);
      ctx.translate(x, top - 6); ctx.rotate(t * 0.03); ctx.fillStyle = 'rgba(255,212,59,0.9)'; for (var r = 0; r < 9; r++) { ctx.rotate(TAU / 9); ctx.beginPath(); ctx.moveTo(8, -2.5); ctx.lineTo(17, 0); ctx.lineTo(8, 2.5); ctx.fill(); }
    }
    ctx.restore();
  }

  /* ============================================================ CHEFES */
  function drawBoss(ctx, kind, boss, w, h, t) {
    // origem: pés no centro, já escalado e virado para a direita
    switch (kind) {
      case 'BossBull': return drawTouro(ctx, boss, w, h, t), true;
      case 'BossFulozinha': {
        ctx.save(); ctx.translate(0, Math.sin(t * 0.08) * 5);
        for (var l = 0; l < 10; l++) { ctx.save(); ctx.translate(0, -h * 0.5); ctx.rotate(l / 10 * TAU + t * 0.015); ell(ctx, 0, -w * 0.72, w * 0.1, w * 0.22); ctx.fillStyle = l % 2 ? 'rgba(47,158,68,0.85)' : 'rgba(81,207,102,0.85)'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.stroke(); ctx.restore(); }
        drawFulo(ctx, w * 1.05, h, t, true, boss); ctx.restore(); return true; }
      case 'BossCorpoSeco': return drawCorpoSeco(ctx, boss, w, h, t), true;
      case 'BossBoiEncantado': return drawBoi(ctx, boss, w, h, t), true;
    }
    return false;
  }
  function drawTouro(ctx, b, w, h, t) {
    var charge = b.state === 'charge', wind = b.state === 'windup', ph = b.phase || 1;
    var run = charge ? t * 0.6 : (Math.abs(b.vx) > 0.3 ? t * 0.3 : 0);
    // fogo atrás (fúria)
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (var f = 0; f < 6; f++) { var fx = -w * 0.45 - f * 6, fy = -h * 0.75 + Math.sin(t * 0.3 + f) * 4; ctx.fillStyle = f % 2 ? 'rgba(255,120,30,0.5)' : 'rgba(255,210,80,0.45)'; ell(ctx, fx, fy, 9 - f, 12 - f); ctx.fill(); }
    ctx.restore();
    // pernas
    [[-0.32, 0], [-0.18, Math.PI], [0.14, Math.PI], [0.28, 0]].forEach(function (l) { var a = Math.sin(run + l[1]) * (run ? 0.5 : 0); ctx.save(); ctx.translate(w * l[0], -h * 0.32); ctx.rotate(a); box(ctx, -5, 0, 10, h * 0.32, 4, '#4A2414', 1.6); ctx.fillStyle = '#1a0d06'; rr(ctx, -6, h * 0.29, 12, 5, 2); ctx.fill(); ctx.restore(); });
    // corpo musculoso
    ball(ctx, -w * 0.05, -h * 0.55, w * 0.46, h * 0.3, '#6B2E16');
    ball(ctx, w * 0.12, -h * 0.68, w * 0.26, h * 0.22, '#7A3519', { rim: false });
    // manto de boi-bumbá com fitas e espelhinhos
    ctx.save(); ctx.beginPath(); ctx.moveTo(-w * 0.32, -h * 0.78); ctx.quadraticCurveTo(-w * 0.05, -h * 0.9, w * 0.2, -h * 0.78); ctx.lineTo(w * 0.24, -h * 0.5); ctx.quadraticCurveTo(-w * 0.05, -h * 0.4, -w * 0.36, -h * 0.5); ctx.closePath();
    var mg = ctx.createLinearGradient(0, -h * 0.9, 0, -h * 0.45); mg.addColorStop(0, '#C92A2A'); mg.addColorStop(1, '#7A1010'); ctx.fillStyle = mg; ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = OUT; ctx.stroke();
    var cs = ['#FCC419', '#4DABF7', '#69DB7C', '#F06595'];
    for (var i = 0; i < 7; i++) { var mx = -w * 0.3 + i * w * 0.08, my = -h * 0.5 + Math.sin(i) * 2; ctx.strokeStyle = cs[i % 4]; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + Math.sin(t * 0.2 + i) * 3, my + 10 + (charge ? 4 : 0)); ctx.stroke(); }
    for (var k = 0; k < 4; k++) { ctx.save(); ctx.translate(-w * 0.22 + k * w * 0.13, -h * 0.66); ctx.rotate(Math.PI / 4); ctx.fillStyle = '#E7F5FF'; ctx.fillRect(-2.5, -2.5, 5, 5); ctx.strokeStyle = '#FFD43B'; ctx.lineWidth = 1; ctx.strokeRect(-2.5, -2.5, 5, 5); ctx.restore(); }
    ctx.restore();
    // cabeça
    ctx.save(); ctx.translate(w * 0.36, -h * 0.62 + (wind ? 4 : 0)); ctx.rotate(charge ? 0.35 : (wind ? 0.25 : 0));
    ball(ctx, 0, 0, w * 0.18, h * 0.2, '#5A2410');
    ball(ctx, w * 0.12, h * 0.07, w * 0.1, h * 0.1, '#C98A6A', { lw: 1.4 });
    ctx.fillStyle = '#2b1208'; ell(ctx, w * 0.16, h * 0.05, 1.6, 2.2); ctx.fill(); ell(ctx, w * 0.1, h * 0.06, 1.6, 2.2); ctx.fill();
    ctx.strokeStyle = '#FFD43B'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(w * 0.13, h * 0.13, 3.5, 0, Math.PI); ctx.stroke(); // argola
    // chifres em chama
    var hc = ph === 1 ? '#FF922B' : ph === 2 ? '#FA5252' : (Math.floor(t / 6) % 2 ? '#339AF0' : '#FFD43B');
    for (var s = -1; s <= 1; s += 2) {
      ctx.beginPath(); ctx.moveTo(-w * 0.04 + s * 4, -h * 0.14); ctx.quadraticCurveTo(-w * 0.1 + s * 8, -h * 0.42, w * 0.06 + s * 10, -h * 0.46); ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.strokeStyle = OUT; ctx.stroke(); ctx.lineWidth = 5; ctx.strokeStyle = '#FFF3BF'; ctx.stroke();
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (var q = 0; q < 3; q++) { ctx.fillStyle = rgba(hc.charAt(0) === '#' ? hc : '#FF922B', 0.55 - q * 0.12); ell(ctx, w * 0.06 + s * 10, -h * 0.5 - q * 5 - Math.sin(t * 0.5 + q) * 2, 5 - q, 7 - q); ctx.fill(); } ctx.restore();
    }
    eye(ctx, w * 0.05, -h * 0.05, 3.4, { iris: '#C92A2A', angry: 1, glow: (wind || charge) ? '#FF3B30' : null });
    // fumaça pelo focinho
    if (wind) { ctx.save(); ctx.globalAlpha = 0.6; ctx.fillStyle = '#ADB5BD'; for (var sm = 0; sm < 3; sm++) { ell(ctx, w * 0.24 + sm * 6 + (t % 10), h * 0.06 - sm * 2, 3 + sm, 2.5 + sm); ctx.fill(); } ctx.restore(); }
    ctx.restore();
    // rabo
    ctx.strokeStyle = '#4A2414'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-w * 0.48, -h * 0.65); ctx.quadraticCurveTo(-w * 0.6, -h * 0.5 + Math.sin(t * 0.2) * 5, -w * 0.56, -h * 0.35); ctx.stroke();
  }
  function drawCorpoSeco(ctx, b, w, h, t) {
    var bur = b.state === 'burrow';
    if (bur) { ctx.save(); ctx.beginPath(); ctx.rect(-w, -h * 0.25, w * 2, h * 0.3); ctx.clip(); }
    // terra rachada embaixo
    ctx.save(); ctx.strokeStyle = 'rgba(60,40,20,0.7)'; ctx.lineWidth = 1.5; for (var c = -3; c <= 3; c++) { ctx.beginPath(); ctx.moveTo(c * 8, 0); ctx.lineTo(c * 12 + 4, 4); ctx.stroke(); } ctx.restore();
    // pernas secas
    [-1, 1].forEach(function (s) { ctx.save(); ctx.translate(s * 8, -h * 0.4); ctx.rotate(Math.sin(t * 0.12 + s) * 0.15); ctx.strokeStyle = OUT; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s * 2, h * 0.4); ctx.stroke(); ctx.strokeStyle = '#8D7B68'; ctx.lineWidth = 4; ctx.stroke(); ctx.restore(); });
    // tronco (costelas)
    ctx.beginPath(); ctx.moveTo(-w * 0.22, -h * 0.42); ctx.quadraticCurveTo(-w * 0.3, -h * 0.68, -w * 0.12, -h * 0.82); ctx.lineTo(w * 0.14, -h * 0.82); ctx.quadraticCurveTo(w * 0.3, -h * 0.68, w * 0.22, -h * 0.42); ctx.closePath();
    var g = ctx.createLinearGradient(0, -h * 0.82, 0, -h * 0.42); g.addColorStop(0, '#A8977E'); g.addColorStop(1, '#5E4E3C'); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.strokeStyle = 'rgba(40,25,10,0.75)'; ctx.lineWidth = 1.6; for (var r = 0; r < 4; r++) { ctx.beginPath(); ctx.moveTo(-w * 0.18, -h * (0.5 + r * 0.075)); ctx.quadraticCurveTo(0, -h * (0.46 + r * 0.075), w * 0.18, -h * (0.5 + r * 0.075)); ctx.stroke(); }
    // trapos
    ctx.fillStyle = '#5C4A35'; ctx.beginPath(); ctx.moveTo(-w * 0.24, -h * 0.45); for (var k = 0; k <= 6; k++) ctx.lineTo(-w * 0.24 + k * w * 0.08, -h * (0.36 - (k % 2) * 0.05) + Math.sin(t * 0.2 + k) * 1.5); ctx.lineTo(w * 0.24, -h * 0.48); ctx.closePath(); ctx.fill(); ctx.stroke();
    // braços galhos
    [-1, 1].forEach(function (s) { ctx.save(); ctx.translate(s * w * 0.2, -h * 0.76); ctx.rotate(s * (0.5 + Math.sin(t * 0.1 + s) * 0.2) + (b.state === 'branches' ? -s * 0.8 : 0)); ctx.strokeStyle = OUT; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s * 4, 26); ctx.lineTo(s * 10, 34); ctx.moveTo(s * 4, 26); ctx.lineTo(s * -2, 36); ctx.stroke(); ctx.strokeStyle = '#7A6550'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore(); });
    // cabeça caveira com cabelo de capim seco
    ball(ctx, 0, -h * 0.9, w * 0.2, h * 0.11, '#C9B898');
    ctx.fillStyle = '#B08D57'; for (var hh = -5; hh <= 5; hh++) { ctx.beginPath(); ctx.moveTo(hh * 2.4, -h * 0.98); ctx.lineTo(hh * 3.4 + Math.sin(t * 0.1 + hh) * 1.5, -h * 1.06 - (hh % 3) * 2); ctx.lineTo(hh * 2.4 + 2, -h * 0.98); ctx.fill(); }
    var angry = b.hp <= b.maxHp / 2;
    ctx.fillStyle = '#1A0F08'; ell(ctx, -w * 0.07, -h * 0.9, 3.4, 3.8); ctx.fill(); ell(ctx, w * 0.08, -h * 0.9, 3.4, 3.8); ctx.fill();
    ctx.save(); ctx.shadowColor = angry ? '#FF3B30' : '#FFD43B'; ctx.shadowBlur = 8; ctx.fillStyle = angry ? '#FF6B6B' : '#FFE066'; ell(ctx, -w * 0.06, -h * 0.9, 1.3, 1.3); ctx.fill(); ell(ctx, w * 0.09, -h * 0.9, 1.3, 1.3); ctx.fill(); ctx.restore();
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.beginPath(); for (var tq = -3; tq <= 3; tq++) { ctx.moveTo(tq * 2.5, -h * 0.83); ctx.lineTo(tq * 2.5, -h * 0.8); } ctx.stroke();
    if (bur) ctx.restore();
  }
  function drawBoi(ctx, b, w, h, t) {
    var dance = b.state === 'dance', charge = b.state === 'charge';
    var spin = dance ? Math.sin(t * 0.3) * 0.15 : 0; ctx.rotate(spin);
    // saia de chita com fitas (Bumba-meu-boi)
    var cs = ['#F06595', '#FCC419', '#4DABF7', '#69DB7C', '#FF922B', '#B197FC'];
    for (var i = 0; i < 14; i++) { var x0 = -w * 0.44 + i * w * 0.065; ctx.strokeStyle = cs[i % cs.length]; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x0, -h * 0.4); ctx.quadraticCurveTo(x0 + Math.sin(t * 0.25 + i) * (dance ? 8 : 3), -h * 0.15, x0 + Math.sin(t * 0.2 + i) * (dance ? 10 : 4), -1); ctx.stroke(); }
    // pernas do brincante
    [-1, 1].forEach(function (s) { box(ctx, s * 10 - 4, -10, 8, 10, 3, '#3B2414', 1.4); });
    // corpo do boi (veludo bordado)
    ctx.beginPath(); ctx.ellipse(-w * 0.04, -h * 0.55, w * 0.46, h * 0.22, 0, 0, TAU);
    var g = ctx.createLinearGradient(0, -h * 0.77, 0, -h * 0.33); g.addColorStop(0, '#2B1B4E'); g.addColorStop(1, '#120A26'); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = OUT; ctx.stroke();
    // bordados de lantejoula
    for (var k = 0; k < 18; k++) { var a = k / 18 * TAU, px = -w * 0.04 + Math.cos(a) * w * 0.36, py = -h * 0.55 + Math.sin(a) * h * 0.15; var on = (Math.floor(t / 6) + k) % 3 === 0; ctx.fillStyle = on ? '#FFFFFF' : cs[k % cs.length]; ell(ctx, px, py, on ? 2.4 : 1.8, on ? 2.4 : 1.8); ctx.fill(); }
    ctx.save(); ctx.translate(-w * 0.04, -h * 0.56); ctx.fillStyle = '#FCC419'; ctx.beginPath(); for (var st = 0; st < 10; st++) { var rr2 = st % 2 ? 5 : 12, an = -Math.PI / 2 + st * Math.PI / 5; ctx.lineTo(Math.cos(an) * rr2, Math.sin(an) * rr2); } ctx.closePath(); ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = OUT; ctx.stroke(); ctx.restore();
    // cabeça
    ctx.save(); ctx.translate(w * 0.42, -h * 0.66); ctx.rotate(charge ? 0.35 : Math.sin(t * 0.1) * 0.08);
    ball(ctx, 0, 0, w * 0.13, h * 0.17, '#F8F0E3');
    ctx.fillStyle = '#E03131'; ctx.beginPath(); ctx.moveTo(-w * 0.06, -h * 0.05); ctx.lineTo(0, -h * 0.13); ctx.lineTo(w * 0.06, -h * 0.05); ctx.lineTo(0, h * 0.02); ctx.closePath(); ctx.fill(); // estrela na testa
    ctx.fillStyle = '#FCC419'; ctx.beginPath(); for (var q = 0; q < 10; q++) { var r3 = q % 2 ? 2.4 : 5.5, a3 = -Math.PI / 2 + q * Math.PI / 5; ctx.lineTo(Math.cos(a3) * r3, -h * 0.06 + Math.sin(a3) * r3); } ctx.closePath(); ctx.fill();
    ball(ctx, w * 0.08, h * 0.08, w * 0.06, h * 0.07, '#F4A6A6', { lw: 1.2, rim: false });
    for (var s = -1; s <= 1; s += 2) { ctx.beginPath(); ctx.moveTo(s * 5, -h * 0.13); ctx.quadraticCurveTo(s * 14, -h * 0.3, s * 6 + 6, -h * 0.34); ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.strokeStyle = OUT; ctx.stroke(); ctx.lineWidth = 3; ctx.strokeStyle = '#FFE8A3'; ctx.stroke(); }
    eye(ctx, w * 0.04, -h * 0.02, 2.8, { iris: '#1A1A1A', angry: charge ? 1 : 0 });
    ctx.restore();
    // chifre de fitas no rabo
    ctx.strokeStyle = '#F06595'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-w * 0.48, -h * 0.6); ctx.quadraticCurveTo(-w * 0.6, -h * 0.75 + Math.sin(t * 0.3) * 6, -w * 0.62, -h * 0.5); ctx.stroke();
  }

  /* ============================================================ MUNDO: espinhos, troncos, fogueiras, carroça, balão */
  function drawThorns(ctx, x, y, w, h, t) {
    // xique-xique deitado com espinhos
    var g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#5C940D'); g.addColorStop(1, '#2B5A0A');
    for (var i = 0; i < w; i += 18) { var bw = Math.min(18, w - i); rr(ctx, x + i, y + 2, bw + 2, h, 6); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 1.3; ctx.strokeStyle = OUT; ctx.stroke(); }
    ctx.strokeStyle = '#FFF3BF'; ctx.lineWidth = 1.2;
    for (var k = 4; k < w; k += 7) { var hy = y + 4 + (k * 13 % 6); ctx.beginPath(); ctx.moveTo(x + k, hy); ctx.lineTo(x + k - 2, hy - 7); ctx.moveTo(x + k, hy); ctx.lineTo(x + k + 3, hy - 6); ctx.stroke(); }
    if (w > 120) for (var f = 30; f < w; f += 110) { ctx.fillStyle = '#F783AC'; ell(ctx, x + f, y + 1, 3, 2.2); ctx.fill(); }
  }
  function logBack(ctx, x, y, w, h) {
    var g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#2a170b'); g.addColorStop(0.5, '#3a2212'); g.addColorStop(1, '#1a0d05');
    rr(ctx, x, y, w, h, h * 0.45); ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.globalAlpha = 0.35; ctx.strokeStyle = '#6b4424'; ctx.lineWidth = 1; for (var i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(x + 12, y + i * h / 5); ctx.lineTo(x + w - 12, y + i * h / 5); ctx.stroke(); } ctx.restore();
  }
  function logFront(ctx, x, y, w, h, inside, t) {
    ctx.save(); if (inside) ctx.globalAlpha = 0.45;
    // casca por cima e por baixo, deixa o "túnel" aberto
    var bark = ctx.createLinearGradient(0, y, 0, y + 18); bark.addColorStop(0, '#B07A45'); bark.addColorStop(1, '#6F4518');
    rr(ctx, x, y - 4, w, 18, 9); ctx.fillStyle = bark; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
    rr(ctx, x, y + h - 10, w, 12, 6); ctx.fillStyle = '#6F4518'; ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(50,25,8,0.6)'; ctx.lineWidth = 1.2; for (var i = 14; i < w - 10; i += 22) { ctx.beginPath(); ctx.moveTo(x + i, y - 2); ctx.quadraticCurveTo(x + i + 6, y + 6, x + i + 2, y + 12); ctx.stroke(); }
    // bocas do tronco (anéis)
    [x + 6, x + w - 6].forEach(function (ex) { ctx.save(); ell(ctx, ex, y + h / 2, 10, h / 2 + 4); ctx.lineWidth = 7; ctx.strokeStyle = '#8B5A2B'; ctx.stroke(); ctx.lineWidth = 1.6; ctx.strokeStyle = OUT; ctx.stroke(); ell(ctx, ex, y + h / 2, 6, h / 2 - 2); ctx.strokeStyle = 'rgba(230,190,130,0.6)'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.restore(); });
    // musgo e cogumelo
    ctx.fillStyle = '#69DB7C'; for (var m = 20; m < w - 20; m += 46) { ell(ctx, x + m, y - 4, 7, 3); ctx.fill(); }
    ball(ctx, x + w * 0.7, y - 7, 5, 3.5, '#FA5252', { lw: 1, rim: false }); ctx.fillStyle = '#fff'; ell(ctx, x + w * 0.7 - 2, y - 8, 1, 1); ctx.fill();
    ctx.restore();
  }
  function drawFire(ctx, f, camX, camY, t) {
    var x = f.x - camX, y = f.y - camY, w = f.w, cx = x + w / 2;
    // lenha
    ctx.save(); ctx.translate(cx, y - 4); for (var i = -1; i <= 1; i++) { ctx.save(); ctx.rotate(i * 0.5); box(ctx, -18, -3, 36, 7, 3, '#6F4518', 1.4); ctx.restore(); } ctx.restore();
    var hgt = f.high ? 70 + Math.sin(t * 0.4) * 10 : (f.warn ? 26 + Math.sin(t * 1.2) * 6 : 16);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    var gl = ctx.createRadialGradient(cx, y - hgt * 0.4, 4, cx, y - hgt * 0.4, hgt * 1.3); gl.addColorStop(0, f.high ? 'rgba(255,170,60,0.55)' : 'rgba(255,170,60,0.25)'); gl.addColorStop(1, 'rgba(255,120,30,0)'); ctx.fillStyle = gl; ctx.fillRect(cx - hgt * 1.3, y - hgt * 1.8, hgt * 2.6, hgt * 2.2);
    for (var k = 0; k < 3; k++) { var hh = hgt * (1 - k * 0.28), ww = w * (0.55 - k * 0.14); ctx.fillStyle = ['rgba(255,90,20,0.9)', 'rgba(255,170,40,0.9)', 'rgba(255,240,170,0.95)'][k];
      ctx.beginPath(); ctx.moveTo(cx - ww, y - 4); ctx.quadraticCurveTo(cx - ww * 0.9, y - hh * 0.6, cx + Math.sin(t * 0.3 + k) * 5, y - hh); ctx.quadraticCurveTo(cx + ww * 0.9, y - hh * 0.6, cx + ww, y - 4); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    if (f.warn) { ctx.save(); ctx.fillStyle = '#FFE066'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.strokeText('!', cx, y - 44); ctx.fillText('!', cx, y - 44); ctx.restore(); }
  }
  function drawCarroca(ctx, x, y, w, h, t, mvx) {
    var spin = (x * 0.08);
    // jegue puxando
    var dir = mvx >= 0 ? 1 : -1;
    drawJegue(ctx, dir > 0 ? x + w + 50 : x - 50, y + 46, dir, t, Math.abs(mvx) > 0.1, 1, 1.25);
    // varais
    ctx.strokeStyle = '#6F4518'; ctx.lineWidth = 3; ctx.beginPath(); if (dir > 0) { ctx.moveTo(x + w - 4, y + 12); ctx.lineTo(x + w + 42, y + 18); } else { ctx.moveTo(x + 4, y + 12); ctx.lineTo(x - 42, y + 18); } ctx.stroke();
    // caixa
    box(ctx, x, y, w, h + 8, 4, '#A0522D', 2);
    ctx.strokeStyle = 'rgba(60,30,10,0.6)'; ctx.lineWidth = 1.2; for (var i = 14; i < w; i += 18) { ctx.beginPath(); ctx.moveTo(x + i, y + 3); ctx.lineTo(x + i, y + h + 5); ctx.stroke(); }
    ctx.fillStyle = '#FCC419'; ctx.fillRect(x + 4, y + 4, w - 8, 3);
    // rodas
    [x + 26, x + w - 26].forEach(function (wx) { ctx.save(); ctx.translate(wx, y + h + 12); ball(ctx, 0, 0, 13, 13, '#7A4A22', { lw: 2 }); ctx.rotate(spin); ctx.strokeStyle = '#3B2414'; ctx.lineWidth = 2; for (var k = 0; k < 4; k++) { ctx.rotate(Math.PI / 4); ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(11, 0); ctx.stroke(); } ball(ctx, 0, 0, 3, 3, '#FFD43B', { lw: 1, rim: false }); ctx.restore(); });
  }
  function drawBalao(ctx, x, y, w, h, t) {
    var cx = x + w / 2;
    // balão de São João (papel de seda)
    ctx.save(); ctx.strokeStyle = 'rgba(60,40,20,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 8, y); ctx.lineTo(cx - 18, y - 46); ctx.moveTo(x + w - 8, y); ctx.lineTo(cx + 18, y - 46); ctx.stroke(); ctx.restore();
    var cs = ['#E03131', '#FCC419', '#1C7ED6', '#40C057'];
    ctx.save(); ctx.beginPath(); ctx.moveTo(cx - 22, y - 44); ctx.quadraticCurveTo(cx - 40, y - 90, cx, y - 108); ctx.quadraticCurveTo(cx + 40, y - 90, cx + 22, y - 44); ctx.closePath(); ctx.clip();
    for (var i = 0; i < 6; i++) { ctx.fillStyle = cs[i % 4]; ctx.fillRect(cx - 42 + i * 14, y - 110, 14, 70); }
    var gl = ctx.createRadialGradient(cx, y - 52, 2, cx, y - 60, 40); gl.addColorStop(0, 'rgba(255,240,180,0.7)'); gl.addColorStop(1, 'rgba(255,240,180,0)'); ctx.fillStyle = gl; ctx.fillRect(cx - 42, y - 110, 84, 70);
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(cx - 22, y - 44); ctx.quadraticCurveTo(cx - 40, y - 90, cx, y - 108); ctx.quadraticCurveTo(cx + 40, y - 90, cx + 22, y - 44); ctx.closePath(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,200,80,' + (0.6 + Math.sin(t * 0.4) * 0.2) + ')'; ell(ctx, cx, y - 42, 5, 6); ctx.fill(); ctx.restore();
    // cestinho/tábua
    box(ctx, x, y, w, h, 6, '#C08A50', 1.8); ctx.strokeStyle = 'rgba(80,40,10,0.6)'; ctx.lineWidth = 1; for (var k = 10; k < w; k += 10) { ctx.beginPath(); ctx.moveTo(x + k, y + 2); ctx.lineTo(x + k, y + h - 2); ctx.stroke(); }
  }
  function drawPartner(ctx, P, camX, camY, t) {
    var x = P.x - camX, y = P.y - camY;
    var k = P.kind || 'zefinha';
    var dummy = { hero: k, facing: -1, onGround: true, vx: 0, vy: 0, runFrame: 0, landSquash: 0, blinkTimer: (t % 140) < 6 ? -1 : 1, hatTilt: Math.sin(t * 0.05) * 0.1, whipCooldown: 0 };
    if (k === 'cabeca_vento') drawCabecaVento(ctx, x, y, dummy, t);
    else if (k === 'galinha') drawGalinha(ctx, x, y, dummy, t);
    else if (k === 'bode_toddy') drawBodeToddy(ctx, x, y, -1, t, false, 1, 1.85, false);
    else if (k === 'seu_lunga') drawSeuLunga(ctx, x, y, dummy, t);
    else if (k === 'tatu_bola') drawTatuBola(ctx, x, y, dummy, t);
    else drawZefinha(ctx, x, y, dummy, t);
    // balão de fala personalizado por amigo!
    var speech = {
      zefinha: 'Bora junto, Tonho?',
      cabeca_vento: 'Bora aprontar, Tonho! 🪁',
      galinha: 'Cócóricó! Vou ciscar geral! 🐔',
      bode_toddy: 'BÉÉÉ! Sobe ou bora chifrar! 🐐',
      seu_lunga: 'Oxente, já vai começar? 🪗',
      tatu_bola: 'Casco pronto pra rolar! 🛡️'
    }[k] || 'Bora junto, Tonho?';
    var by = y - 114 + Math.sin(t * 0.08) * 2;
    ctx.save(); ctx.font = 'bold 12px sans-serif'; var tw = ctx.measureText(speech).width + 18;
    rr(ctx, x - tw / 2, by - 16, tw, 22, 8); ctx.fillStyle = 'rgba(255,248,235,0.96)'; ctx.fill(); ctx.strokeStyle = '#C2255C'; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 4, by + 6); ctx.lineTo(x, by + 12); ctx.lineTo(x + 4, by + 6); ctx.fill();
    ctx.fillStyle = '#7A1F45'; ctx.textAlign = 'center'; ctx.fillText(speech, x, by); ctx.restore();
  }
  function drawWorldBack(ctx, camX, camY, L, t, W, H, player) {
    var i;
    (L.logs || []).forEach(function (l) { var x = l.x - camX; if (x > W + 50 || x + l.w < -50) return; logBack(ctx, x, l.y - camY, l.w, l.h); });
    (L.movingPlatforms || []).forEach(function (mp) {
      if (!mp.style) return; var a = L._alpha == null ? 1 : L._alpha;
      var px = mp.prevX != null ? lerp(mp.prevX, mp.x, a) : mp.x, py = mp.prevY != null ? lerp(mp.prevY, mp.y, a) : mp.y, x = px - camX, y = py - camY;
      if (x > W + 120 || x + mp.w < -120) return;
      if (mp.style === 'carroca') drawCarroca(ctx, x, y, mp.w, mp.h, t, mp.vx || 0);
      else if (mp.style === 'balao') drawBalao(ctx, x, y, mp.w, mp.h, t);
    });
    (L.hazards || []).forEach(function (hz) { var x = hz.x - camX; if (x > W + 20 || x + hz.w < -20) return; drawThorns(ctx, x, hz.y - camY, hz.w, hz.h, t); });
    (L.fires || []).forEach(function (f) { var x = f.x - camX; if (x > W + 100 || x + f.w < -100) return; drawFire(ctx, f, camX, camY, t); });
    if (L.partner && !L.partner.joined) drawPartner(ctx, L.partner, camX, camY, t);
  }
  function drawWorldFront(ctx, camX, camY, L, t, W, H, player) {
    (L.logs || []).forEach(function (l) {
      var x = l.x - camX; if (x > W + 50 || x + l.w < -50) return;
      var inside = player && player.x + player.w > l.x && player.x < l.x + l.w && player.y + player.h > l.y + 10 && player.y < l.y + l.h;
      logFront(ctx, x, l.y - camY, l.w, l.h, inside, t);
    });
    drawForeground(ctx, camX, camY, L, t, W, H);
  }
  // primeiro plano discreto: plantas desfocadas que passam rente à borda de baixo (escala +22%)
  function drawForeground(ctx, camX, camY, L, t, W, H) {
    if (G.OxeHD && G.OxeHD.lowQuality) return;
    var biome = (L.spec && L.spec.biome) || 'sertao', off = camX * 1.25, span = 520;
    var col = { sertao: '#3d2a14', caverna: '#0d0a18', pantano: '#10281a', mangue: '#0e2422', canion: '#2a0e06', trono: '#120a12', caatinga: '#2a2a1a', saojoao: '#0a0a1a' }[biome] || '#20140a';
    ctx.save(); ctx.globalAlpha = 0.58;
    for (var i = -1; i < W / span + 2; i++) {
      var k = Math.floor(off / span) + i, x = k * span - off + ((k * 97) % 180), h = (40 + ((k * 53) % 40)) * 1.22, y = H + 6 - camY * 0.05;
      ctx.fillStyle = col;
      if (biome === 'caverna') { ctx.beginPath(); ctx.moveTo(x, -4); ctx.lineTo(x + 32, -4); ctx.lineTo(x + 16, 36 + h * 0.45); ctx.closePath(); ctx.fill(); continue; }
      if (biome === 'pantano' || biome === 'mangue') { for (var g = 0; g < 7; g++) { ctx.beginPath(); ctx.moveTo(x + g * 11, y); ctx.quadraticCurveTo(x + g * 11 - 7 + Math.sin(t * 0.03 + g) * 4, y - h * 0.6, x + g * 11 - 2, y - h - g * 2.4); ctx.lineTo(x + g * 11 + 5, y); ctx.fill(); } continue; }
      // cactos/capim
      rr(ctx, x, y - h, 17, h + 12, 8); ctx.fill(); rr(ctx, x - 17, y - h * 0.7, 12, h * 0.4, 6); ctx.fill(); rr(ctx, x - 17, y - h * 0.4, 24, 10, 5); ctx.fill();
      for (var q = 0; q < 6; q++) { ctx.beginPath(); ctx.moveTo(x + 48 + q * 7, y); ctx.lineTo(x + 46 + q * 7 + Math.sin(t * 0.04 + q) * 3, y - 27 - (q % 3) * 7); ctx.lineTo(x + 52 + q * 7, y); ctx.fill(); }
    }
    ctx.restore();
  }

  /* ============================================================ CENÁRIOS (props de fundo por bioma + variação por fase) */
  function hash(n) { var s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  function scenery(ctx, biome, camX, camY, t, W, H, layer, stageIdx) {
    // layer 1 = longe (depois da 2ª serra), layer 3 = perto (depois da 4ª)
    var st = typeof stageIdx === 'number' ? stageIdx : 0;
    var f = layer === 1 ? 0.2 : 0.5, off = camX * f, span = layer === 1 ? 400 : 320, baseY = layer === 1 ? H * 0.6 - camY * 0.06 : H * 0.8 - camY * 0.15;
    var S = 1.25; // escala aumentada (+25%) dos elementos de cenário
    ctx.save();
    for (var i = -1; i < W / span + 2; i++) {
      var k = Math.floor(off / span) + i, x = k * span - off + hash(k + layer * 31 + st * 17) * 120, r = hash(k * 3 + layer + st * 11);
      if (biome === 'sertao') {
        if (layer === 1) {
          if (st % 2 === 0) { if (r < 0.28) igrejinha(ctx, x, baseY, 0.8 * S, st === 5); else if (r < 0.55) cataVento(ctx, x, baseY, 0.9 * S, t); else if (r < 0.72) casaTaipa(ctx, x, baseY, 0.8 * S); }
          else { if (r < 0.32) casaTaipa(ctx, x, baseY, 0.85 * S); else if (r < 0.58) acudeSeco(ctx, x, baseY + 6, 0.95 * S); else if (r < 0.72) cataVento(ctx, x, baseY, 0.95 * S, t); }
        } else {
          if (r < 0.38) juazeiro(ctx, x, baseY + 6, (0.9 + r * 0.4) * S); else if (r < 0.54) vaqueiro(ctx, x, baseY + 4, 0.9 * S); else if (st >= 3 && r < 0.68) xiquexique(ctx, x, baseY + 8, 0.95 * S);
        }
      } else if (biome === 'caverna') {
        if (layer === 1 && r < 0.65) pinturaRupestre(ctx, x, baseY - 60 - r * 40, (1 + r * 0.5) * S, k + st * 5, t);
      } else if (biome === 'pantano') {
        if (layer === 1 && r < 0.35) casaTaipa(ctx, x, baseY, 0.75 * S);
        else if (layer === 3 && r < 0.52) buriti(ctx, x, baseY + 10, (0.9 + r * 0.4) * S, t);
      } else if (biome === 'mangue') {
        if (layer === 1) { if (r < 0.24) farol(ctx, x, baseY, 0.9 * S, t); else if (r < 0.6) jangada(ctx, x, baseY + 8 + Math.sin(t * 0.03 + k) * 2, 0.9 * S, t + k * 20); }
        else if (r < 0.55) coqueiro(ctx, x, baseY + 14, (1 + r * 0.3) * S, t);
      } else if (biome === 'canion') {
        if (layer === 1 && r < 0.45) pedraFurada(ctx, x, baseY + 10, (1 + r * 0.5) * S);
        else if (layer === 3 && r < 0.35) xiquexique(ctx, x, baseY + 10, 1.05 * S);
      } else if (biome === 'trono') {
        if (layer === 1 && r < 0.5) ruinaSol(ctx, x, baseY + 4, (1 + r * 0.4) * S, t);
        else if (layer === 3 && r < 0.38) caveiraBoi(ctx, x, baseY + 12, 1.1 * S);
      } else if (biome === 'caatinga') {
        if (layer === 1) { if (r < 0.34) casaTaipa(ctx, x, baseY, 0.75 * S); else if (r < 0.58) acudeSeco(ctx, x, baseY + 6, 1 * S); else if (st % 2 === 1 && r < 0.72) cataVento(ctx, x, baseY, 0.85 * S, t); }
        else { if (r < 0.32) xiquexique(ctx, x, baseY + 10, (1 + r * 0.6) * S); else if (r < 0.58) umbuzeiro(ctx, x, baseY + 10, (0.9 + r * 0.4) * S); else if (r < 0.74) caveiraBoi(ctx, x, baseY + 12, 1 * S); }
      } else if (biome === 'saojoao') {
        if (layer === 1) { if (r < 0.34) igrejinha(ctx, x, baseY, 0.85 * S, true); else if (r < 0.7) baloesCeu(ctx, x, baseY - 150 - r * 60, t, k + st); }
        else { if (r < 0.42) fogueiraFundo(ctx, x, baseY + 6, 0.9 * S, t); else if (r < 0.65) barraquinha(ctx, x, baseY + 6, 0.9 * S, t, k + st); }
      }
    }
    ctx.restore();
  }
  function sil(ctx, a) { ctx.globalAlpha = a; }
  function igrejinha(ctx, x, y, s, night) {
    ctx.save(); sil(ctx, 0.9); var w = 46 * s, h = 40 * s;
    box(ctx, x, y - h, w, h, 3, night ? '#C9C4E8' : '#F8F0E3', 1.4);
    ctx.fillStyle = night ? '#4C3F8A' : '#C0392B'; ctx.beginPath(); ctx.moveTo(x - 3, y - h); ctx.lineTo(x + w / 2, y - h - 16 * s); ctx.lineTo(x + w + 3, y - h); ctx.fill();
    box(ctx, x + w * 0.62, y - h - 30 * s, 14 * s, 30 * s, 2, night ? '#BDB6E0' : '#F1E6D2', 1.2);
    ctx.fillStyle = '#4a3020'; ctx.fillRect(x + w * 0.62 + 6 * s, y - h - 40 * s, 2, 10 * s); ctx.fillRect(x + w * 0.62 + 3 * s, y - h - 36 * s, 8 * s, 2);
    ctx.fillStyle = night ? '#FFE066' : '#3B5BA5'; rr(ctx, x + w * 0.38, y - h * 0.55, w * 0.22, h * 0.55, 6 * s); ctx.fill();
    if (night) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,224,102,0.25)'; ell(ctx, x + w * 0.5, y - h * 0.3, w * 0.6, h * 0.5); ctx.fill(); ctx.restore(); }
    ctx.restore();
  }
  function casaTaipa(ctx, x, y, s) {
    ctx.save(); sil(ctx, 0.88); var w = 54 * s, h = 30 * s;
    box(ctx, x, y - h, w, h, 2, '#C8955A', 1.3);
    ctx.strokeStyle = 'rgba(80,50,20,0.5)'; ctx.lineWidth = 1; for (var i = 6; i < w; i += 8) { ctx.beginPath(); ctx.moveTo(x + i, y - h); ctx.lineTo(x + i, y); ctx.stroke(); }
    ctx.fillStyle = '#9C5A2E'; ctx.beginPath(); ctx.moveTo(x - 5, y - h); ctx.lineTo(x + w * 0.3, y - h - 14 * s); ctx.lineTo(x + w + 5, y - h - 6 * s); ctx.lineTo(x + w + 5, y - h); ctx.closePath(); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = '#3B2414'; ctx.fillRect(x + w * 0.4, y - h * 0.65, w * 0.18, h * 0.65); ctx.fillStyle = '#2B6CB0'; ctx.fillRect(x + w * 0.12, y - h * 0.7, w * 0.16, h * 0.3);
    ctx.restore();
  }
  function cataVento(ctx, x, y, s, t) {
    ctx.save(); sil(ctx, 0.8); ctx.strokeStyle = '#5C4A3A'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 10 * s, y); ctx.lineTo(x, y - 80 * s); ctx.lineTo(x + 10 * s, y); ctx.moveTo(x - 6 * s, y - 30 * s); ctx.lineTo(x + 6 * s, y - 30 * s); ctx.moveTo(x - 4 * s, y - 55 * s); ctx.lineTo(x + 4 * s, y - 55 * s); ctx.stroke();
    ctx.translate(x, y - 82 * s); ctx.rotate(t * 0.04); ctx.fillStyle = '#ADB5BD'; for (var i = 0; i < 12; i++) { ctx.rotate(TAU / 12); ctx.fillRect(2, -1.5, 16 * s, 3); } ctx.restore();
  }
  function juazeiro(ctx, x, y, s) {
    ctx.save(); sil(ctx, 0.9); ctx.fillStyle = '#5C3D2E'; ctx.beginPath(); ctx.moveTo(x - 4 * s, y); ctx.quadraticCurveTo(x - 2 * s, y - 30 * s, x - 10 * s, y - 46 * s); ctx.lineTo(x + 4 * s, y - 44 * s); ctx.quadraticCurveTo(x + 2 * s, y - 26 * s, x + 6 * s, y); ctx.fill();
    ball(ctx, x - 14 * s, y - 56 * s, 24 * s, 16 * s, '#3F7A2E', { lw: 1.2 }); ball(ctx, x + 10 * s, y - 60 * s, 26 * s, 18 * s, '#4A8A35', { lw: 1.2 }); ball(ctx, x - 2 * s, y - 72 * s, 20 * s, 13 * s, '#5BA03F', { lw: 1.2 });
    ctx.restore();
  }
  function vaqueiro(ctx, x, y, s) {
    ctx.save(); sil(ctx, 0.75); ctx.fillStyle = '#3B2414';
    drawJegue(ctx, x, y, 1, 0, false, 0.75, 0.9);
    ctx.fillStyle = '#5C3317'; ctx.beginPath(); ctx.ellipse(x + 2, y - 62 * s, 14 * s, 3.5 * s, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.moveTo(x - 6 * s, y - 62 * s); ctx.quadraticCurveTo(x + 2, y - 76 * s, x + 10 * s, y - 62 * s); ctx.fill();
    ctx.fillRect(x - 5 * s, y - 60 * s, 12 * s, 18 * s);
    ctx.restore();
  }
  function pinturaRupestre(ctx, x, y, s, k, t) {
    ctx.save(); ctx.globalAlpha = 0.55 + Math.sin(t * 0.01 + k) * 0.05; ctx.strokeStyle = '#C0603A'; ctx.fillStyle = '#C0603A'; ctx.lineWidth = 2 * s; ctx.lineCap = 'round';
    var kind = Math.floor(hash(k * 7) * 3);
    if (kind === 0) { for (var p = 0; p < 3; p++) { var px = x + p * 18 * s; ctx.beginPath(); ctx.arc(px, y - 18 * s, 3 * s, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.moveTo(px, y - 15 * s); ctx.lineTo(px, y - 4 * s); ctx.moveTo(px - 6 * s, y - 12 * s); ctx.lineTo(px + 6 * s, y - 10 * s); ctx.moveTo(px, y - 4 * s); ctx.lineTo(px - 4 * s, y + 4 * s); ctx.moveTo(px, y - 4 * s); ctx.lineTo(px + 4 * s, y + 4 * s); ctx.stroke(); } }
    else if (kind === 1) { ctx.beginPath(); ctx.ellipse(x, y, 16 * s, 7 * s, 0, 0, TAU); ctx.fill(); ctx.beginPath(); for (var l = -1; l <= 1; l += 2) { ctx.moveTo(x + l * 8 * s, y + 5 * s); ctx.lineTo(x + l * 10 * s, y + 14 * s); } ctx.moveTo(x + 14 * s, y - 3 * s); ctx.lineTo(x + 22 * s, y - 10 * s); ctx.moveTo(x + 18 * s, y - 7 * s); ctx.lineTo(x + 20 * s, y - 16 * s); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(x, y, 10 * s, 0, TAU); ctx.stroke(); for (var r = 0; r < 8; r++) { var a = r * TAU / 8; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 12 * s, y + Math.sin(a) * 12 * s); ctx.lineTo(x + Math.cos(a) * 18 * s, y + Math.sin(a) * 18 * s); ctx.stroke(); } }
    ctx.restore();
  }
  function buriti(ctx, x, y, s, t) {
    ctx.save(); sil(ctx, 0.85); box(ctx, x - 4 * s, y - 110 * s, 8 * s, 110 * s, 3, '#6F5A44', 1);
    ctx.translate(x, y - 112 * s); for (var i = 0; i < 9; i++) { ctx.save(); ctx.rotate(-Math.PI + i * Math.PI / 8 + Math.sin(t * 0.02 + i) * 0.05); ctx.beginPath(); ctx.moveTo(0, 0); for (var j = 0; j < 6; j++) { ctx.lineTo(34 * s * (j / 5), (j % 2 ? -4 : 4) * s); } ctx.strokeStyle = '#2F7A3A'; ctx.lineWidth = 3 * s; ctx.stroke(); ctx.restore(); }
    ctx.fillStyle = '#8B4513'; for (var c = -1; c <= 1; c++) { ell(ctx, c * 5 * s, 6 * s, 3 * s, 3 * s); ctx.fill(); }
    ctx.restore();
  }
  function coqueiro(ctx, x, y, s, t) {
    ctx.save(); sil(ctx, 0.9); ctx.strokeStyle = '#7A5C3A'; ctx.lineWidth = 7 * s; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 18 * s, y - 60 * s, x + 6 * s, y - 120 * s); ctx.stroke();
    ctx.translate(x + 6 * s, y - 120 * s); for (var i = 0; i < 7; i++) { ctx.save(); ctx.rotate(-Math.PI * 0.95 + i * 0.32 + Math.sin(t * 0.03 + i) * 0.06); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(26 * s, -10 * s, 46 * s, 10 * s); ctx.quadraticCurveTo(24 * s, 2 * s, 0, 4 * s); ctx.fillStyle = i % 2 ? '#2B8A3E' : '#37B24D'; ctx.fill(); ctx.restore(); }
    ball(ctx, -4 * s, 4 * s, 4 * s, 4 * s, '#8D6E3F', { lw: 1, rim: false }); ball(ctx, 4 * s, 5 * s, 4 * s, 4 * s, '#8D6E3F', { lw: 1, rim: false });
    ctx.restore();
  }
  function jangada(ctx, x, y, s, t) {
    ctx.save(); sil(ctx, 0.85); box(ctx, x - 26 * s, y - 6 * s, 52 * s, 7 * s, 3, '#B5835A', 1);
    ctx.strokeStyle = '#5C3D2E'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y - 6 * s); ctx.lineTo(x, y - 62 * s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 1, y - 60 * s); ctx.quadraticCurveTo(x + 30 * s + Math.sin(t * 0.04) * 3, y - 36 * s, x + 2, y - 10 * s); ctx.closePath(); ctx.fillStyle = '#FFF8EC'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#E03131'; ctx.fillRect(x + 2, y - 44 * s, 10 * s, 3 * s);
    ctx.restore();
  }
  function farol(ctx, x, y, s, t) {
    ctx.save(); sil(ctx, 0.9); var w = 18 * s, h = 90 * s;
    ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x - w * 0.35, y - h); ctx.lineTo(x + w * 0.35, y - h); ctx.lineTo(x + w / 2, y); ctx.closePath(); ctx.fillStyle = '#F8F9FA'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = '#E03131'; for (var i = 1; i < 4; i++) ctx.fillRect(x - w * 0.45 + i * 0.6, y - h * i / 4 - 6 * s, w * 0.9 - i * 1.2, 7 * s);
    box(ctx, x - 7 * s, y - h - 12 * s, 14 * s, 12 * s, 2, '#495057', 1);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; var a = t * 0.02; ctx.fillStyle = 'rgba(255,240,180,0.18)'; ctx.beginPath(); ctx.moveTo(x, y - h - 6 * s); ctx.lineTo(x + Math.cos(a) * 200, y - h - 6 * s + Math.sin(a) * 20 - 20); ctx.lineTo(x + Math.cos(a) * 200, y - h - 6 * s + Math.sin(a) * 20 + 20); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.restore();
  }
  function pedraFurada(ctx, x, y, s) {
    ctx.save(); sil(ctx, 0.85); var g = ctx.createLinearGradient(0, y - 120 * s, 0, y); g.addColorStop(0, '#D9784A'); g.addColorStop(1, '#8F3A22');
    ctx.beginPath(); ctx.moveTo(x - 60 * s, y); ctx.quadraticCurveTo(x - 70 * s, y - 100 * s, x - 20 * s, y - 120 * s); ctx.quadraticCurveTo(x + 50 * s, y - 130 * s, x + 64 * s, y - 60 * s); ctx.lineTo(x + 60 * s, y); ctx.closePath();
    ctx.moveTo(x + 10 * s, y - 50 * s); ctx.ellipse(x - 4 * s, y - 60 * s, 18 * s, 22 * s, 0, 0, TAU, true); ctx.fillStyle = g; ctx.fill('evenodd'); ctx.strokeStyle = 'rgba(40,10,5,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,200,150,0.25)'; for (var i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(x - 60 * s, y - i * 18 * s); ctx.lineTo(x + 60 * s, y - i * 18 * s - 4); ctx.stroke(); }
    ctx.restore();
  }
  function ruinaSol(ctx, x, y, s, t) {
    ctx.save(); sil(ctx, 0.8); box(ctx, x - 14 * s, y - 70 * s, 28 * s, 70 * s, 2, '#5A4A3A', 1);
    ctx.save(); ctx.translate(x, y - 84 * s); ctx.rotate(t * 0.004); ctx.fillStyle = '#C9A227'; for (var i = 0; i < 9; i++) { ctx.rotate(TAU / 9); ctx.beginPath(); ctx.moveTo(10 * s, -3 * s); ctx.lineTo(22 * s, 0); ctx.lineTo(10 * s, 3 * s); ctx.fill(); } ball(ctx, 0, 0, 10 * s, 10 * s, '#E8B830', { lw: 1 }); ctx.restore();
    ctx.restore();
  }
  function xiquexique(ctx, x, y, s) {
    ctx.save(); sil(ctx, 0.92); var col = '#6B8F3A';
    function arm(ax, ay, w, h) { var g = ctx.createLinearGradient(ax - w / 2, 0, ax + w / 2, 0); g.addColorStop(0, shade(col, -0.35)); g.addColorStop(0.45, shade(col, 0.2)); g.addColorStop(1, shade(col, -0.5)); rr(ctx, ax - w / 2, ay - h, w, h, w / 2); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 1.3; ctx.strokeStyle = OUT; ctx.stroke(); ctx.strokeStyle = '#FFF3BF'; ctx.lineWidth = 0.8; for (var k = 4; k < h - 4; k += 6) { ctx.beginPath(); ctx.moveTo(ax - w / 2, ay - k); ctx.lineTo(ax - w / 2 - 3, ay - k - 2); ctx.moveTo(ax + w / 2, ay - k); ctx.lineTo(ax + w / 2 + 3, ay - k - 2); ctx.stroke(); } }
    arm(x, y, 10 * s, 50 * s); arm(x - 12 * s, y - 8 * s, 8 * s, 26 * s); arm(x + 12 * s, y - 4 * s, 8 * s, 32 * s); arm(x + 22 * s, y, 7 * s, 18 * s);
    ctx.restore();
  }
  function umbuzeiro(ctx, x, y, s) {
    ctx.save(); sil(ctx, 0.9); ctx.strokeStyle = '#6B5A48'; ctx.lineWidth = 6 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 30 * s); ctx.moveTo(x, y - 26 * s); ctx.quadraticCurveTo(x - 20 * s, y - 40 * s, x - 34 * s, y - 44 * s); ctx.moveTo(x, y - 28 * s); ctx.quadraticCurveTo(x + 22 * s, y - 42 * s, x + 36 * s, y - 40 * s); ctx.stroke();
    ball(ctx, x - 30 * s, y - 52 * s, 22 * s, 12 * s, '#7D8F45', { lw: 1 }); ball(ctx, x + 30 * s, y - 50 * s, 24 * s, 12 * s, '#8A9A50', { lw: 1 }); ball(ctx, x, y - 60 * s, 28 * s, 14 * s, '#95A65A', { lw: 1 });
    ctx.fillStyle = '#C5D96B'; for (var i = 0; i < 6; i++) { ell(ctx, x - 30 * s + i * 12 * s, y - 48 * s + (i % 2) * 6, 2.4 * s, 2.4 * s); ctx.fill(); }
    ctx.restore();
  }
  function acudeSeco(ctx, x, y, s) {
    ctx.save(); sil(ctx, 0.7); ell(ctx, x, y, 60 * s, 10 * s); ctx.fillStyle = '#B79A72'; ctx.fill(); ctx.strokeStyle = 'rgba(70,45,20,0.6)'; ctx.lineWidth = 1;
    for (var i = 0; i < 9; i++) { ctx.beginPath(); ctx.moveTo(x - 50 * s + i * 12 * s, y - 6 * s); ctx.lineTo(x - 46 * s + i * 12 * s, y + 2 * s); ctx.lineTo(x - 52 * s + i * 12 * s, y + 7 * s); ctx.stroke(); }
    ctx.restore();
  }
  function caveiraBoi(ctx, x, y, s) {
    ctx.save(); sil(ctx, 0.85); ball(ctx, x, y - 8 * s, 10 * s, 8 * s, '#F1E6D2', { lw: 1.2 });
    ctx.strokeStyle = '#E9DCC0'; ctx.lineWidth = 3 * s; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - 8 * s, y - 12 * s); ctx.quadraticCurveTo(x - 20 * s, y - 16 * s, x - 22 * s, y - 26 * s); ctx.moveTo(x + 8 * s, y - 12 * s); ctx.quadraticCurveTo(x + 20 * s, y - 16 * s, x + 22 * s, y - 26 * s); ctx.stroke();
    ctx.fillStyle = OUT; ell(ctx, x - 4 * s, y - 9 * s, 2 * s, 2.6 * s); ctx.fill(); ell(ctx, x + 4 * s, y - 9 * s, 2 * s, 2.6 * s); ctx.fill();
    ctx.restore();
  }
  function baloesCeu(ctx, x, y, t, k) {
    ctx.save(); for (var i = 0; i < 3; i++) { var bx = x + i * 40 + Math.sin(t * 0.01 + i + k) * 8, by = y - ((t * 0.15 + i * 70 + k * 30) % 160); ctx.globalAlpha = 0.75;
      ctx.beginPath(); ctx.moveTo(bx - 7, by); ctx.quadraticCurveTo(bx - 12, by - 14, bx, by - 20); ctx.quadraticCurveTo(bx + 12, by - 14, bx + 7, by); ctx.closePath(); ctx.fillStyle = ['#FF6B6B', '#FCC419', '#74C0FC'][i]; ctx.fill();
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,220,120,0.6)'; ell(ctx, bx, by + 1, 2.5, 3); ctx.fill(); ctx.restore(); }
    ctx.restore();
  }
  function fogueiraFundo(ctx, x, y, s, t) {
    ctx.save(); sil(ctx, 0.85); ctx.fillStyle = '#3B2414'; for (var i = -1; i <= 1; i++) { ctx.save(); ctx.translate(x, y - 3); ctx.rotate(i * 0.5); ctx.fillRect(-16 * s, -2, 32 * s, 5); ctx.restore(); }
    ctx.globalCompositeOperation = 'lighter'; var h = 34 * s + Math.sin(t * 0.3 + x) * 5;
    var g = ctx.createRadialGradient(x, y - h * 0.4, 2, x, y - h * 0.4, h * 1.6); g.addColorStop(0, 'rgba(255,170,60,0.45)'); g.addColorStop(1, 'rgba(255,120,30,0)'); ctx.fillStyle = g; ctx.fillRect(x - h * 1.6, y - h * 2, h * 3.2, h * 2.4);
    ctx.fillStyle = 'rgba(255,140,40,0.85)'; ctx.beginPath(); ctx.moveTo(x - 12 * s, y - 2); ctx.quadraticCurveTo(x, y - h * 1.2, x + 12 * s, y - 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,230,140,0.9)'; ctx.beginPath(); ctx.moveTo(x - 6 * s, y - 2); ctx.quadraticCurveTo(x, y - h * 0.7, x + 6 * s, y - 2); ctx.fill();
    ctx.restore();
  }
  function barraquinha(ctx, x, y, s, t, k) {
    ctx.save(); sil(ctx, 0.85); var w = 60 * s, h = 34 * s;
    ctx.fillStyle = '#5C3D2E'; ctx.fillRect(x, y - h - 10 * s, 3, h + 10 * s); ctx.fillRect(x + w - 3, y - h - 10 * s, 3, h + 10 * s);
    box(ctx, x - 2, y - 16 * s, w + 4, 16 * s, 2, '#A0522D', 1.2);
    for (var i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#FFFFFF' : '#E03131'; ctx.beginPath(); ctx.moveTo(x - 6 + i * (w + 12) / 6, y - h - 10 * s); ctx.lineTo(x - 6 + (i + 1) * (w + 12) / 6, y - h - 10 * s); ctx.lineTo(x - 6 + (i + 0.5) * (w + 12) / 6, y - h + 2 * s); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = '#FCC419'; ctx.font = 'bold ' + Math.round(9 * s) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(['MILHO', 'PAMONHA', 'CANJICA', 'QUENTÃO', 'PÉ DE MOLEQUE'][Math.abs(k) % 5], x + w / 2, y - 5 * s);
    ctx.restore();
  }
  // céu da Noite de São João: estrelas e fogos de artifício
  function skyExtra(ctx, biome, camX, camY, t, W, H) {
    if (biome !== 'saojoao') return;
    ctx.save();
    for (var i = 0; i < 60; i++) { var sx = ((hash(i) * W * 1.2 - camX * 0.02) % W + W) % W, sy = hash(i + 50) * H * 0.5; ctx.globalAlpha = 0.4 + 0.5 * Math.abs(Math.sin(t * 0.03 + i)); ctx.fillStyle = '#FFF9DB'; ctx.fillRect(sx, sy, 1.6, 1.6); }
    for (var f = 0; f < 3; f++) {
      var per = 150 + f * 40, ph = (t + f * 70) % per, fx = W * (0.2 + f * 0.3) + Math.sin(f * 9 + Math.floor((t + f * 70) / per)) * 80, fy = H * (0.18 + f * 0.05);
      if (ph < 60) { ctx.globalAlpha = 0.9; ctx.fillStyle = '#FFE8A3'; ctx.fillRect(fx, fy + (60 - ph) * 2.4, 2, 6); }
      else if (ph < 120) { var r = (ph - 60) * 1.4, a = 1 - (ph - 60) / 60; ctx.globalAlpha = a; ctx.globalCompositeOperation = 'lighter'; var cs = ['#FF6B6B', '#FCC419', '#74C0FC', '#B197FC'];
        for (var k = 0; k < 16; k++) { var an = k / 16 * TAU; ctx.fillStyle = cs[(k + f) % 4]; ctx.beginPath(); ctx.arc(fx + Math.cos(an) * r, fy + Math.sin(an) * r + (ph - 60) * 0.15, 2.2, 0, TAU); ctx.fill(); }
        ctx.globalCompositeOperation = 'source-over'; }
    }
    ctx.restore();
  }

  G.OxeArt3 = {
    hasEnemy: hasEnemy, drawEnemy: drawEnemy, drawQuibungo: drawQuibungo, drawBoss: drawBoss,
    drawHero: drawHero, drawDazed: drawDazed, drawSwapMark: drawSwapMark, drawFleeing: drawFleeing, drawItem: drawItem,
    drawWorldBack: drawWorldBack, drawWorldFront: drawWorldFront, scenery: scenery, skyExtra: skyExtra,
    drawZefinha: drawZefinha, drawJegue: drawJegue, drawCabecaVento: drawCabecaVento, drawGalinha: drawGalinha,
    drawBodeToddy: drawBodeToddy, drawSeuLunga: drawSeuLunga, drawTatuBola: drawTatuBola, drawKartVehicle: drawKartVehicle,
    drawCostume: drawCostume, ENEMY_TYPES: ENEMY_TYPES
  };
})(typeof window !== 'undefined' ? window : this);
