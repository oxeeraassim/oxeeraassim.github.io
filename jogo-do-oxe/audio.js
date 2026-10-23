/**
 * AUDIO ENGINE PROCEDURAL — OXE! 2.0: A GRANDE JORNADA DOS NOVE SÓIS
 * Trilha sonora e efeitos sintetizados 100% em Web Audio API.
 * Baião, xote, forró, coco, maracatu e frevo (Zabumba, Triângulo, Sanfona) + SFX arcade sertanejo.
 *
 * Correções:
 *  - B4 : todas as faixas chamadas pelo jogo existem em SONGS (sem silêncio ao trocar de mundo).
 *  - B9 : pauseMusic()/resumeMusic() reais (preservam currentState e nextStep).
 *  - B10: todos os SFX chamados pelo jogo implementados (death, leaf, splash, geyser, vine, quake...).
 *  - Extra: conversão MIDI->Hz corrigida, race condition do songGain no stopMusic,
 *           desbloqueio duplicado no unlock(), faixas não-loop finalizam corretamente.
 */

const AudioEngine = (() => {
  'use strict';

  // ===================== CONTEXTO E ROTEAMENTO =====================
  let ctx = null;
  let master = null, musicBus = null, sfxBus = null, comp = null, reverb = null, reverbSend = null;
  let noiseBuffer = null;
  let muted = false;
  // v2.4: música mais baixa e macia (seguidores acharam irritante); volume ajustável nas configurações
  let masterVolume = 0.8, musicVolume = 0.3, sfxVolume = 0.85;
  try { const sv = JSON.parse(localStorage.getItem('oxe2_settings') || '{}'); if (typeof sv.musicVolume === 'number') musicVolume = Math.max(0, Math.min(1, sv.musicVolume / 100 * 0.6)); } catch (e) {}
  let unlocked = false;

  function createImpulse(duration = 1.4, decay = 2.2) {
    if (!ctx) return null;
    const len = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  function createNoise() {
    if (!ctx) return null;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function init() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { console.warn('[AudioEngine] Web Audio API não suportada.'); return null; }
      ctx = new AC();

      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 10;
      comp.ratio.value = 4;
      comp.attack.value = 0.004;
      comp.release.value = 0.2;

      master = ctx.createGain();
      master.gain.value = muted ? 0 : masterVolume;

      musicBus = ctx.createGain();
      musicBus.gain.value = musicVolume;
      sfxBus = ctx.createGain();
      sfxBus.gain.value = sfxVolume;

      reverb = ctx.createConvolver();
      reverb.buffer = createImpulse();
      reverbSend = ctx.createGain();
      reverbSend.gain.value = 0.2;

      musicBus.connect(comp);
      sfxBus.connect(comp);
      reverbSend.connect(reverb);
      reverb.connect(comp);
      comp.connect(master);
      master.connect(ctx.destination);

      noiseBuffer = createNoise();
    } catch (e) {
      console.warn('[AudioEngine] Erro ao inicializar Web Audio:', e);
      ctx = null;
    }
    return ctx;
  }

  // ===================== UNLOCK MOBILE =====================
  function flushPending() {
    if (!pendingState) return;
    const st = pendingState;
    pendingState = null;
    currentState = null; // força criação do sequenciador
    playMusic(st);
  }

  function unlock() {
    try {
      init();
      if (!ctx) return;

      // Buffer silencioso para desbloquear Web Audio no iOS Safari
      try {
        const b = ctx.createBuffer(1, 1, 22050);
        const s = ctx.createBufferSource();
        s.buffer = b;
        s.connect(ctx.destination);
        s.start(0);
      } catch (e) {}

      if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
        ctx.resume().then(() => {
          unlocked = true;
          flushPending();
          if (seq && !paused && !schedTimer) startScheduler();
        }).catch(() => {});
      } else if (ctx.state === 'running') {
        unlocked = true;
        flushPending();
      }
    } catch (e) {
      console.warn('[AudioEngine] Erro ao destravar áudio:', e);
    }
  }

  const unlockEvents = ['touchstart', 'touchend', 'mousedown', 'click', 'keydown', 'pointerdown'];
  function attachUnlock() {
    const handler = () => {
      unlock();
      if (ctx && ctx.state === 'running') {
        unlockEvents.forEach(e => {
          try { document.removeEventListener(e, handler, true); } catch (err) {}
        });
      }
    };
    unlockEvents.forEach(e => {
      try {
        document.addEventListener(e, handler, { capture: true, passive: true });
      } catch (err) {}
    });
  }
  if (typeof document !== 'undefined') attachUnlock();

  // ===================== UTILITÁRIOS =====================
  function midiToFreq(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  function env(gainNode, t, a, peak, d, sustain = 0.0001) {
    const g = gainNode.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + a + d);
  }

  function noiseSource(t, dur) {
    if (!ctx || !noiseBuffer) return null;
    const s = ctx.createBufferSource();
    s.buffer = noiseBuffer;
    s.loop = true;
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
    return s;
  }

  function tone(type, t, f0, f1, dur, peak, dest, attack = 0.003, ramp = 'exp') {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) {
      if (ramp === 'lin') o.frequency.linearRampToValueAtTime(f1, t + dur);
      else o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    }
    env(g, t, attack, peak, dur);
    o.connect(g); g.connect(dest || sfxBus);
    o.start(t); o.stop(t + attack + dur + 0.03);
    return { o, g };
  }

  // ===================== INSTRUMENTOS =====================

  // Zabumba: batida grave da pele
  function zabumbaKick(t, vel = 1, dest = musicBus) {
    if (!ctx || !dest) return;
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      o.frequency.exponentialRampToValueAtTime(36, t + 0.35);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.9 * vel, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o.connect(g); g.connect(dest);
      o.start(t); o.stop(t + 0.42);

      const n = noiseSource(t, 0.03);
      if (n) {
        const nf = ctx.createBiquadFilter();
        nf.type = 'lowpass'; nf.frequency.value = 1600;
        const ng = ctx.createGain();
        env(ng, t, 0.001, 0.25 * vel, 0.025);
        n.connect(nf); nf.connect(ng); ng.connect(dest);
      }
    } catch (e) {}
  }

  // Zabumba Rim: vareta (bacalhau) no aro de baixo
  function zabumbaRim(t, vel = 1, dest = musicBus) {
    if (!ctx || !dest) return;
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(780, t);
      o.frequency.exponentialRampToValueAtTime(380, t + 0.04);
      env(g, t, 0.001, 0.22 * vel, 0.06);
      o.connect(g); g.connect(dest);
      o.start(t); o.stop(t + 0.08);

      const n = noiseSource(t, 0.04);
      if (n) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 3000; bp.Q.value = 2.5;
        const ng = ctx.createGain();
        env(ng, t, 0.001, 0.28 * vel, 0.04);
        n.connect(bp); bp.connect(ng); ng.connect(dest);
      }
    } catch (e) {}
  }

  // Triângulo: batida metálica típica do forró
  function triangulo(t, open = false, vel = 1, dest = musicBus) {
    if (!ctx || !dest) return;
    try {
      const base = 3600;
      const ratios = [1, 1.28, 1.54, 1.72];
      const dur = open ? 0.45 : 0.055;
      const out = ctx.createGain();
      env(out, t, 0.001, (open ? 0.09 : 0.06) * vel, dur);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 2800;
      out.connect(hp); hp.connect(dest);
      if (open && reverbSend) hp.connect(reverbSend);

      ratios.forEach((r, i) => {
        const f = Math.min(base * r, 6200);
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.value = i === 0 ? 0.45 : 0.06;
        o.connect(g); g.connect(out);
        o.start(t); o.stop(t + dur + 0.04);
      });
    } catch (e) {}
  }

  // Sanfona: fole com palhetas sintetizadas em saw + triangle desafinadas
  function sanfona(t, freq, dur, vel = 1, dest = musicBus, bright = 1) {
    if (!ctx || !freq || !dest) return;
    try {
      const out = ctx.createGain();
      const a = 0.02, r = 0.05;
      const d = Math.max(dur, a + 0.03);
      const peak = 0.12 * vel;
      out.gain.setValueAtTime(0.0001, t);
      out.gain.linearRampToValueAtTime(peak, t + a);
      out.gain.setValueAtTime(peak, t + Math.max(a, d - r));
      out.gain.exponentialRampToValueAtTime(0.0001, t + d);

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = Math.min(freq * 3.2 * bright, 2600);

      const oscDetunes = [-7, 0, 7];
      oscDetunes.forEach((cents, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = i === 1 ? 'triangle' : 'sine';
        o.frequency.value = freq;
        o.detune.value = cents;
        g.gain.value = i === 1 ? 0.5 : 0.32;
        o.connect(g); g.connect(lp);
        o.start(t); o.stop(t + d + 0.05);
      });

      lp.connect(out);
      out.connect(dest);
      if (reverbSend) out.connect(reverbSend);
    } catch (e) {}
  }

  // ===================== COMPOSIÇÕES NORDESTINAS =====================
  // root = nota MIDI de referência; melody = [semitons acima do root | null (pausa), duração em 16 avos]
  const SONGS = {
    title: {
      bpm: 94, root: 55, // G3 — Xote
      style: 'xote', loops: true,
      melody: [
        [12, 4], [14, 2], [16, 2], [19, 6], [17, 2],
        [16, 4], [14, 2], [12, 2], [10, 8],
        [12, 4], [14, 2], [16, 2], [18, 4], [19, 4],
        [17, 4], [16, 2], [14, 2], [12, 8],
        [19, 2], [21, 2], [22, 4], [21, 2], [19, 2], [17, 4],
        [16, 4], [14, 2], [16, 2], [12, 8]
      ]
    },
    overworld: {
      bpm: 110, root: 57, // A3 — Xote animado
      style: 'xote', loops: true,
      melody: [
        [12, 2], [14, 2], [16, 2], [18, 2], [19, 4], [16, 4],
        [18, 2], [16, 2], [14, 4], [12, 8],
        [12, 2], [14, 2], [16, 2], [18, 2], [21, 4], [19, 2], [18, 2],
        [19, 4], [14, 4], [7, 8]
      ]
    },
    map: {
      bpm: 102, root: 53, // F3 — Xote de estrada (mapa dos Nove Sóis)
      style: 'xote', loops: true,
      melody: [
        [7, 2], [12, 2], [14, 2], [16, 2], [17, 4], [16, 2], [14, 2],
        [12, 4], [10, 4], [12, 8],
        [12, 2], [14, 2], [16, 2], [17, 2], [19, 4], [21, 2], [19, 2],
        [17, 4], [16, 2], [14, 2], [12, 8]
      ]
    },
    stage: {
      bpm: 130, root: 52, // E3 — Baião
      style: 'baiao', loops: true,
      melody: [
        [12, 3], [12, 3], [14, 2], [16, 4], [19, 4],
        [17, 2], [16, 2], [14, 2], [12, 2], [10, 8],
        [10, 3], [10, 3], [12, 2], [14, 4], [17, 4],
        [16, 2], [14, 2], [12, 2], [10, 2], [12, 8],
        [17, 3], [17, 3], [19, 2], [21, 4], [17, 4],
        [15, 3], [15, 3], [17, 2], [19, 4], [15, 4]
      ]
    },
    baiao: {
      bpm: 128, root: 50, // D3 — Mundo 1: Sertão Rachado (baião mixolídio)
      style: 'baiao', loops: true,
      melody: [
        [12, 3], [16, 3], [19, 2], [22, 4], [21, 2], [19, 2],
        [17, 3], [16, 3], [14, 2], [12, 8],
        [14, 3], [17, 3], [21, 2], [22, 4], [24, 2], [22, 2],
        [21, 3], [19, 3], [17, 2], [19, 8],
        [24, 2], [22, 2], [21, 2], [19, 2], [17, 2], [16, 2], [14, 2], [12, 2],
        [10, 3], [10, 3], [14, 2], [12, 8]
      ]
    },
    xote: {
      bpm: 100, root: 55, // G3 — Mundo 2: Agreste Florido
      style: 'xote', loops: true,
      melody: [
        [12, 4], [16, 2], [19, 2], [21, 4], [19, 4],
        [17, 2], [16, 2], [14, 2], [16, 2], [12, 8],
        [14, 4], [17, 2], [21, 2], [22, 4], [21, 4],
        [19, 2], [17, 2], [16, 2], [14, 2], [12, 8]
      ]
    },
    caverna: {
      bpm: 84, root: 45, // A2 — Mundo 2: Grutas de Ubajara (xote menor, reverberante)
      style: 'xote', loops: true, wet: 0.6, bright: 0.6,
      melody: [
        [12, 4], [15, 4], [17, 4], [15, 2], [14, 2],
        [12, 8], [null, 4], [10, 4],
        [12, 4], [15, 2], [19, 2], [20, 6], [19, 2],
        [17, 4], [15, 4], [12, 8],
        [24, 4], [22, 2], [20, 2], [19, 4], [17, 4],
        [15, 4], [14, 4], [12, 8]
      ]
    },
    forro: {
      bpm: 140, root: 52, // E3 — Mundo 3: Pé-de-Serra (forró arrasta-pé)
      style: 'forro', loops: true,
      melody: [
        [12, 2], [14, 2], [16, 2], [19, 2], [21, 2], [19, 2], [16, 2], [14, 2],
        [12, 4], [10, 4], [12, 8],
        [16, 2], [17, 2], [19, 2], [21, 2], [22, 4], [21, 2], [19, 2],
        [17, 2], [16, 2], [14, 2], [10, 2], [12, 8],
        [24, 2], [22, 2], [21, 2], [19, 2], [22, 2], [21, 2], [19, 2], [17, 2],
        [16, 4], [14, 4], [12, 8]
      ]
    },
    coco: {
      bpm: 118, root: 57, // A3 — Mundo 4: Litoral das Jangadas (coco de roda)
      style: 'coco', loops: true, wet: 0.25,
      melody: [
        [12, 2], [12, 2], [16, 2], [12, 2], [19, 4], [17, 4],
        [16, 2], [16, 2], [14, 2], [12, 2], [14, 8],
        [14, 2], [14, 2], [17, 2], [14, 2], [21, 4], [19, 4],
        [17, 2], [16, 2], [14, 2], [10, 2], [12, 8]
      ]
    },
    maracatu: {
      bpm: 96, root: 50, // D3 — Mundo 5: Cortejo das Alfaias (dórico, solene)
      style: 'maracatu', loops: true, wet: 0.35,
      melody: [
        [12, 4], [15, 4], [17, 6], [15, 2],
        [14, 4], [12, 4], [10, 8],
        [12, 4], [15, 4], [19, 6], [17, 2],
        [21, 4], [19, 4], [17, 8],
        [24, 4], [22, 2], [21, 2], [19, 4], [17, 4],
        [15, 4], [14, 4], [12, 8]
      ]
    },
    frevo: {
      bpm: 168, root: 58, // A#3 — Mundo 6: Ladeiras em Chamas (frevo de rua)
      style: 'frevo', loops: true, bright: 1.2,
      melody: [
        [12, 1], [14, 1], [16, 1], [17, 1], [19, 2], [24, 2], [19, 2], [16, 2], [12, 4],
        [14, 1], [16, 1], [17, 1], [19, 1], [21, 2], [26, 2], [21, 2], [17, 2], [14, 4],
        [24, 2], [23, 2], [21, 2], [19, 2], [17, 2], [16, 2], [14, 2], [12, 2],
        [11, 2], [14, 2], [17, 2], [19, 2], [24, 8]
      ]
    },
    asaBranca: {
      bpm: 150, root: 55, // G3 — Power-up "Asa Branca" (tema original, baião acelerado)
      style: 'baiao', loops: true, bright: 1.3,
      melody: [
        [12, 2], [16, 2], [19, 2], [24, 2], [22, 2], [19, 2], [17, 2], [16, 2],
        [17, 2], [21, 2], [24, 2], [26, 2], [24, 4], [19, 4],
        [12, 2], [16, 2], [19, 2], [24, 2], [26, 2], [28, 2], [26, 2], [24, 2],
        [22, 2], [21, 2], [19, 2], [17, 2], [19, 8]
      ]
    },
    boss: {
      bpm: 146, root: 50, // D3 — Forró tenso
      style: 'forro', loops: true,
      melody: [
        [12, 2], [15, 2], [17, 2], [12, 2], [21, 4], [19, 2], [17, 2],
        [15, 2], [17, 2], [15, 2], [14, 2], [12, 8],
        [12, 2], [15, 2], [17, 2], [19, 2], [21, 2], [22, 2], [24, 4],
        [22, 2], [21, 2], [19, 2], [17, 2], [21, 8]
      ]
    },
    victory: {
      bpm: 138, root: 60, // C4 — Fanfarra Baião
      style: 'baiao', loops: false,
      melody: [
        [7, 2], [12, 2], [16, 2], [19, 4], [16, 2], [19, 4],
        [17, 2], [21, 2], [24, 4], [21, 2], [19, 2],
        [17, 2], [19, 2], [21, 2], [23, 2], [26, 4], [23, 4],
        [24, 12]
      ]
    }
  };

  // Padrões de percussão por estilo (16 passos)
  const GROOVES = {
    baiao: {
      zab: ['K', '.', '.', 'K', '.', '.', 'R', '.', 'K', '.', '.', 'K', '.', '.', 'R', 'R'],
      tri: ['t', 't', 'T', 't', 't', 't', 'T', 't', 't', 't', 'T', 't', 't', 't', 'T', 't'],
      bass: [0, null, null, 7, null, null, null, null, 0, null, null, 7, null, null, 5, null]
    },
    xote: {
      zab: ['K', '.', '.', '.', 'R', '.', 'K', '.', 'K', '.', '.', '.', 'R', '.', '.', '.'],
      tri: ['T', '.', 't', 't', 'T', '.', 't', 't', 'T', '.', 't', 't', 'T', '.', 't', 't'],
      bass: [0, null, null, null, null, null, 7, null, 0, null, null, null, null, null, null, null]
    },
    forro: {
      zab: ['K', '.', 'R', 'K', '.', 'R', 'R', '.', 'K', '.', 'R', 'K', '.', 'R', 'K', 'R'],
      tri: ['t', 't', 'T', 't', 't', 't', 'T', 't', 't', 't', 'T', 't', 't', 't', 'T', 't'],
      bass: [0, null, null, 0, null, null, 7, null, 0, null, null, 0, null, null, 10, null]
    },
    coco: {
      // Coco de roda: pisada sincopada + ganzá contínuo
      zab: ['K', '.', 'R', '.', 'R', 'K', '.', 'R', 'K', '.', 'R', '.', 'R', 'K', 'R', '.'],
      tri: ['t', 't', 't', 'T', 't', 't', 't', 'T', 't', 't', 't', 'T', 't', 't', 't', 'T'],
      bass: [0, null, null, null, null, 7, null, null, 0, null, null, null, null, 5, null, 7]
    },
    maracatu: {
      // Maracatu de baque virado: alfaias pesadas, gonguê no triângulo aberto
      zab: ['K', '.', 'K', '.', 'R', '.', 'K', 'K', '.', 'R', 'K', '.', 'K', '.', 'R', 'R'],
      tri: ['T', '.', '.', 't', '.', '.', 'T', '.', '.', 't', '.', '.', 'T', '.', 't', '.'],
      bass: [0, null, 0, null, null, null, 3, null, null, null, 5, null, 0, null, null, null]
    },
    frevo: {
      // Frevo: caixa rufando em semicolcheias, surdo no tempo
      zab: ['K', 'R', 'R', 'R', 'K', 'R', 'R', 'R', 'K', 'R', 'R', 'R', 'K', 'R', 'K', 'R'],
      tri: ['t', 't', 'T', 't', 't', 't', 'T', 't', 't', 't', 'T', 't', 't', 't', 'T', 'T'],
      bass: [0, null, 7, null, 0, null, 7, null, 5, null, 12, null, 7, null, 4, null]
    }
  };

  const SFX_NAMES = [
    'jump', 'doubleJump', 'whip', 'stomp', 'hit', 'death', 'coin', 'caju', 'checkpoint',
    'bossRoar', 'glide', 'spine', 'bee', 'whistle', 'miasma', 'bonk', 'metal', 'leaf',
    'splash', 'geyser', 'vine', 'quake'
  ];

  // ===================== SEQUENCIADOR DE MÚSICA =====================
  let currentState = null;
  let pendingState = null;
  let songGain = null;
  let songWet = null;
  let schedTimer = null;
  let seq = null;
  let paused = false;
  let autoPaused = false;
  const LOOKAHEAD = 0.12;
  const INTERVAL = 25;

  function buildMelodyEvents(song) {
    const map = new Map();
    let pos = 0;
    song.melody.forEach(([n, d]) => {
      if (n !== null && n !== undefined) map.set(pos, { note: n, len: d });
      pos += d;
    });
    return { map, length: Math.max(pos, 1) };
  }

  function startScheduler() {
    if (schedTimer) clearInterval(schedTimer);
    schedTimer = setInterval(scheduler, INTERVAL);
  }

  function stopScheduler() {
    if (schedTimer) {
      clearInterval(schedTimer);
      schedTimer = null;
    }
  }

  function playMusic(state) {
    if (!SONGS[state]) {
      console.warn('[AudioEngine] Faixa inexistente:', state);
      return;
    }
    init();
    if (!ctx) return;

    if (ctx.state !== 'running' && !unlocked) {
      pendingState = state;
      return;
    }

    if (currentState === state && seq) {
      if (paused) resumeMusic();
      return;
    }

    stopMusic(0.3);
    currentState = state;
    pendingState = null;
    paused = false;
    autoPaused = false;

    const song = SONGS[state];
    const now = ctx.currentTime;

    songGain = ctx.createGain();
    songGain.gain.setValueAtTime(0.0001, now);
    songGain.gain.linearRampToValueAtTime(1, now + 0.3);
    songGain.connect(musicBus);

    if (song.wet && reverbSend) {
      songWet = ctx.createGain();
      songWet.gain.value = song.wet;
      songGain.connect(songWet);
      songWet.connect(reverbSend);
    }

    const mel = buildMelodyEvents(song);
    const pat = GROOVES[song.style] || GROOVES.baiao;
    const stepDur = (60 / song.bpm) / 4;

    seq = {
      song,
      mel,
      pat,
      stepDur,
      gain: songGain,
      startCtxTime: now + 0.05,
      nextStep: 0,
      endStep: song.loops ? Infinity : mel.length
    };

    startScheduler();
  }

  function scheduler() {
    if (!seq || paused || !ctx || ctx.state !== 'running') return;
    const s = seq;
    const scheduleUntil = ctx.currentTime + LOOKAHEAD;

    while (s.startCtxTime + s.nextStep * s.stepDur < scheduleUntil) {
      if (s.nextStep >= s.endStep) {
        // Faixa não-loop terminou: deixa a última nota soar e encerra
        const tail = Math.max(0.6, s.stepDur * 4);
        const finishedState = currentState;
        stopScheduler();
        setTimeout(() => {
          if (seq === s && currentState === finishedState) stopMusic(0.4);
        }, tail * 1000);
        return;
      }

      const stepTime = s.startCtxTime + s.nextStep * s.stepDur;
      const dest = s.gain;

      // 1. Zabumba
      const zHit = s.pat.zab[s.nextStep % s.pat.zab.length];
      if (zHit === 'K') zabumbaKick(stepTime, 0.9, dest);
      else if (zHit === 'R') zabumbaRim(stepTime, 0.7, dest);

      // 2. Triângulo
      const tHit = s.pat.tri[s.nextStep % s.pat.tri.length];
      if (tHit === 'T') triangulo(stepTime, true, 0.55, dest);
      else if (tHit === 't') triangulo(stepTime, false, 0.45, dest);

      // 3. Baixo (uma oitava abaixo do root)
      const bNote = s.pat.bass[s.nextStep % s.pat.bass.length];
      if (bNote !== null && bNote !== undefined) {
        const freq = midiToFreq((s.song.root || 48) - 12 + bNote);
        sanfona(stepTime, freq, s.stepDur * 1.5, 0.35, dest, 0.5);
      }

      // 4. Melodia
      const melEv = s.mel.map.get(s.nextStep % s.mel.length);
      const loopN = Math.floor(s.nextStep / s.mel.length);
      if (melEv && loopN % 4 !== 3) { // v2.4: varia a repetição (uma volta em 4 só com ritmo e baixo)
        const oct = loopN % 2 === 1 ? -12 : 0;
        const freq = midiToFreq((s.song.root || 48) + melEv.note + oct);
        sanfona(stepTime, freq, melEv.len * s.stepDur * 0.9, oct ? 0.38 : 0.45, dest, s.song.bright || 1);
      }

      s.nextStep++;
    }
  }

  function fadeOutAndDisconnect(gainNode, wetNode, fadeTime) {
    if (!ctx || !gainNode) return;
    try {
      const now = ctx.currentTime;
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(Math.max(gainNode.gain.value, 0.0001), now);
      gainNode.gain.linearRampToValueAtTime(0.0001, now + Math.max(fadeTime, 0.01));
    } catch (e) {}
    setTimeout(() => {
      try { gainNode.disconnect(); } catch (e) {}
      if (wetNode) { try { wetNode.disconnect(); } catch (e) {} }
    }, Math.max(fadeTime, 0.01) * 1000 + 60);
  }

  function stopMusic(fadeTime = 0.3) {
    stopScheduler();
    if (songGain) {
      // Captura local: evita que o timeout anule o songGain de uma nova faixa
      fadeOutAndDisconnect(songGain, songWet, fadeTime);
    }
    songGain = null;
    songWet = null;
    seq = null;
    currentState = null;
    pendingState = null;
    paused = false;
    autoPaused = false;
  }

  // ===================== PAUSA / RETOMADA REAIS (B9) =====================
  function pauseMusic() {
    if (paused) return;
    paused = true;
    stopScheduler();
    if (songGain && ctx) {
      try {
        const now = ctx.currentTime;
        songGain.gain.cancelScheduledValues(now);
        songGain.gain.setValueAtTime(Math.max(songGain.gain.value, 0.0001), now);
        songGain.gain.linearRampToValueAtTime(0.0001, now + 0.06);
      } catch (e) {}
    }
    // currentState e seq.nextStep são preservados intencionalmente
  }

  function resumeMusic() {
    if (!paused) return;
    paused = false;
    autoPaused = false;
    if (!ctx) return;

    if (!seq) {
      // Pausado antes do unlock: toca o pendente se houver
      if (pendingState && (unlocked || ctx.state === 'running')) flushPending();
      return;
    }

    const doResume = () => {
      if (!seq || paused) return;
      const now = ctx.currentTime;
      // Re-ancora a linha do tempo para que nextStep toque daqui a ~60ms
      seq.startCtxTime = now + 0.06 - seq.nextStep * seq.stepDur;
      if (songGain) {
        try {
          songGain.gain.cancelScheduledValues(now);
          songGain.gain.setValueAtTime(0.0001, now);
          songGain.gain.linearRampToValueAtTime(1, now + 0.15);
        } catch (e) {}
      }
      if (seq.nextStep < seq.endStep) startScheduler();
    };

    if (ctx.state === 'suspended') {
      ctx.resume().then(doResume).catch(() => {});
    } else {
      doResume();
    }
  }

  // Pausa automática quando a aba fica oculta (não interfere na pausa do jogador)
  if (typeof document !== 'undefined') {
    try {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          if (seq && !paused) {
            pauseMusic();
            autoPaused = true;
          }
        } else if (autoPaused) {
          autoPaused = false;
          resumeMusic();
        }
      });
    } catch (e) {}
  }

  // ===================== EFEITOS SONOROS (SFX ARCADE) =====================
  const lastSfxTime = {};
  const SFX_MIN_GAP = 0.025;

  function playSFX(name) {
    if (muted) return;
    init();
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;

    // Anti-spam: evita empilhar o mesmo SFX no mesmo frame
    if (lastSfxTime[name] !== undefined && t - lastSfxTime[name] < SFX_MIN_GAP) return;
    lastSfxTime[name] = t;

    try {
      switch (name) {
        case 'jump': {
          tone('square', t, 160, 480, 0.12, 0.3, sfxBus, 0.005);
          break;
        }

        case 'doubleJump': {
          tone('triangle', t, 320, 680, 0.15, 0.35, sfxBus, 0.005);
          tone('sine', t + 0.05, 640, 1200, 0.1, 0.12, sfxBus, 0.003);
          break;
        }

        case 'whip': {
          // Estalo de chicote de couro
          const n = noiseSource(t, 0.08);
          if (n) {
            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.setValueAtTime(3500, t);
            bp.frequency.exponentialRampToValueAtTime(600, t + 0.08);
            bp.Q.value = 3.5;
            const g = ctx.createGain();
            env(g, t, 0.001, 0.6, 0.08);
            n.connect(bp); bp.connect(g); g.connect(sfxBus);
          }
          break;
        }

        case 'stomp': {
          tone('sine', t, 220, 50, 0.16, 0.5, sfxBus, 0.002);
          break;
        }

        case 'hit': {
          tone('sawtooth', t, 180, 40, 0.22, 0.45, sfxBus, 0.002);
          break;
        }

        case 'death': {
          // Lamento descendente + baque no chão
          const notes = [659, 587, 523, 440, 392, 330];
          notes.forEach((f, i) => {
            tone('square', t + i * 0.09, f, f * 0.97, 0.09, 0.22, sfxBus, 0.004);
          });
          const tEnd = t + notes.length * 0.09;
          tone('sine', tEnd, 140, 35, 0.35, 0.55, sfxBus, 0.003);
          const n = noiseSource(tEnd, 0.15);
          if (n) {
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass'; lp.frequency.value = 700;
            const g = ctx.createGain();
            env(g, tEnd, 0.002, 0.3, 0.15);
            n.connect(lp); lp.connect(g); g.connect(sfxBus);
          }
          break;
        }

        case 'coin': {
          // Rapadura coletada (chime cristalino duplo)
          [987, 1318].forEach((freq, idx) => {
            tone('sine', t + idx * 0.06, freq, freq, 0.16, 0.28, sfxBus, 0.002);
          });
          break;
        }

        case 'caju': {
          // Joia de Caju Dourado (arpejo mágico)
          [523, 659, 784, 1046].forEach((freq, idx) => {
            const { g } = tone('triangle', t + idx * 0.05, freq, freq, 0.2, 0.3, sfxBus, 0.004);
            if (reverbSend) g.connect(reverbSend);
          });
          break;
        }

        case 'checkpoint': {
          // Fanfarra curta de bandeira
          [440, 554, 659, 880].forEach((freq, idx) => {
            tone('sawtooth', t + idx * 0.07, freq, freq, 0.25, 0.25, sfxBus, 0.005);
          });
          break;
        }

        case 'bossRoar': {
          // Rugido do Touro de Fogo
          const o1 = ctx.createOscillator();
          const o2 = ctx.createOscillator();
          const g = ctx.createGain();
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.setValueAtTime(450, t);
          lp.frequency.linearRampToValueAtTime(180, t + 0.4);
          o1.type = 'sawtooth'; o1.frequency.value = 65;
          o2.type = 'sawtooth'; o2.frequency.value = 68;
          env(g, t, 0.01, 0.5, 0.4);
          o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(sfxBus);
          o1.start(t); o2.start(t); o1.stop(t + 0.42); o2.stop(t + 0.42);
          break;
        }

        case 'glide': {
          // Planar com o chapéu de couro
          const n = noiseSource(t, 0.15);
          if (n) {
            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass'; bp.frequency.value = 800; bp.Q.value = 1.2;
            const g = ctx.createGain();
            env(g, t, 0.02, 0.18, 0.14);
            n.connect(bp); bp.connect(g); g.connect(sfxBus);
          }
          break;
        }

        case 'spine': {
          // Disparo de espinho do cacto
          tone('square', t, 800, 320, 0.08, 0.22, sfxBus, 0.002);
          break;
        }

        case 'bee': {
          // BÉÉÉ! do bode furioso
          for (let i = 0; i < 4; i++) {
            const f = 460 + (i % 2) * 50;
            tone('sawtooth', t + i * 0.06, f, f, 0.07, 0.25, sfxBus, 0.005);
          }
          break;
        }

        case 'whistle': {
          // Assovio cortante da Comadre Fulozinha
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(1700, t);
          o.frequency.linearRampToValueAtTime(2400, t + 0.25);
          o.frequency.linearRampToValueAtTime(1900, t + 0.45);
          env(g, t, 0.02, 0.25, 0.45);
          o.connect(g); g.connect(sfxBus);
          o.start(t); o.stop(t + 0.5);
          break;
        }

        case 'miasma': {
          // Miasma tenebroso do Papa-Figo
          tone('sawtooth', t, 140, 45, 0.35, 0.3, sfxBus, 0.01);
          break;
        }

        case 'bonk': {
          // Colisão na parede / atordoamento
          tone('triangle', t, 110, 35, 0.2, 0.4, sfxBus, 0.003);
          break;
        }

        case 'metal': {
          // Escudo blindado metálico
          const o1 = ctx.createOscillator();
          const o2 = ctx.createOscillator();
          const g = ctx.createGain();
          o1.type = 'square'; o1.frequency.setValueAtTime(1200, t);
          o2.type = 'triangle'; o2.frequency.setValueAtTime(1850, t);
          env(g, t, 0.002, 0.35, 0.2);
          o1.connect(g); o2.connect(g); g.connect(sfxBus);
          o1.start(t); o2.start(t); o1.stop(t + 0.24); o2.stop(t + 0.24);
          break;
        }

        case 'leaf': {
          // Folhagem farfalhando (mandacaru / juazeiro)
          for (let i = 0; i < 3; i++) {
            const ti = t + i * 0.045;
            const n = noiseSource(ti, 0.06);
            if (!n) break;
            const hp = ctx.createBiquadFilter();
            hp.type = 'highpass'; hp.frequency.value = 2500 + i * 600;
            const g = ctx.createGain();
            env(g, ti, 0.004, 0.12, 0.06);
            n.connect(hp); hp.connect(g); g.connect(sfxBus);
          }
          break;
        }

        case 'splash': {
          // Mergulho no açude
          const n = noiseSource(t, 0.4);
          if (n) {
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.setValueAtTime(4000, t);
            lp.frequency.exponentialRampToValueAtTime(300, t + 0.4);
            const g = ctx.createGain();
            env(g, t, 0.005, 0.45, 0.38);
            n.connect(lp); lp.connect(g); g.connect(sfxBus);
          }
          // Bolhas
          [0.08, 0.15, 0.24].forEach((d, i) => {
            tone('sine', t + d, 380 + i * 140, 900 + i * 200, 0.05, 0.12, sfxBus, 0.002);
          });
          break;
        }

        case 'geyser': {
          // Gêiser de vapor subindo
          const dur = 0.7;
          const n = noiseSource(t, dur);
          if (n) {
            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.setValueAtTime(300, t);
            bp.frequency.exponentialRampToValueAtTime(3200, t + dur);
            bp.Q.value = 1.4;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(0.4, t + 0.12);
            g.gain.setValueAtTime(0.4, t + dur * 0.6);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            n.connect(bp); bp.connect(g); g.connect(sfxBus);
            if (reverbSend) g.connect(reverbSend);
          }
          tone('sine', t, 90, 60, 0.4, 0.25, sfxBus, 0.02);
          break;
        }

        case 'vine': {
          // Cipó esticando / balanço (boing com vibrato)
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          const lfo = ctx.createOscillator();
          const lfoG = ctx.createGain();
          o.type = 'triangle';
          o.frequency.setValueAtTime(220, t);
          o.frequency.exponentialRampToValueAtTime(520, t + 0.18);
          o.frequency.exponentialRampToValueAtTime(380, t + 0.3);
          lfo.type = 'sine'; lfo.frequency.value = 22;
          lfoG.gain.value = 25;
          lfo.connect(lfoG); lfoG.connect(o.frequency);
          env(g, t, 0.005, 0.3, 0.3);
          o.connect(g); g.connect(sfxBus);
          o.start(t); lfo.start(t);
          o.stop(t + 0.34); lfo.stop(t + 0.34);
          break;
        }

        case 'quake': {
          // Terremoto / pisão do chefe
          const dur = 0.9;
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          const lfo = ctx.createOscillator();
          const lfoG = ctx.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(48, t);
          o.frequency.exponentialRampToValueAtTime(28, t + dur);
          lfo.type = 'sine'; lfo.frequency.value = 9;
          lfoG.gain.value = 0.25;
          lfo.connect(lfoG); lfoG.connect(g.gain);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.6, t + 0.03);
          g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
          o.connect(g); g.connect(sfxBus);
          o.start(t); lfo.start(t);
          o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);

          const n = noiseSource(t, dur);
          if (n) {
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass'; lp.frequency.value = 220;
            const ng = ctx.createGain();
            env(ng, t, 0.02, 0.5, dur - 0.02);
            n.connect(lp); lp.connect(ng); ng.connect(sfxBus);
          }
          break;
        }

        default:
          break;
      }
    } catch (e) {}
  }

  // ===================== VOLUME / MUTE =====================
  function toggleMute() {
    muted = !muted;
    if (master && ctx) {
      try {
        const now = ctx.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(muted ? 0 : masterVolume, now);
      } catch (e) {}
    }
    return muted;
  }

  function setMusicVolume(v01) {
    const n = Number(v01);
    musicVolume = Math.max(0, Math.min(1, isFinite(n) ? n : musicVolume));
    if (musicBus && ctx) { try { musicBus.gain.setTargetAtTime(musicVolume, ctx.currentTime, 0.05); } catch (e) {} }
    return musicVolume;
  }

  function setMasterVolume(v) {
    const n = Number(v);
    masterVolume = Math.max(0, Math.min(1, isFinite(n) ? n : masterVolume));
    if (master && !muted && ctx) {
      try {
        master.gain.setValueAtTime(masterVolume, ctx.currentTime);
      } catch (e) {}
    }
    return masterVolume;
  }

  // ===================== API PÚBLICA =====================
  const api = {
    init,
    unlock,
    playMusic,
    stopMusic,
    pauseMusic,
    resumeMusic,
    playSFX,
    toggleMute,
    setMasterVolume,
    setMusicVolume,
    SONGS,
    SFX_NAMES,
    get unlocked() { return unlocked; },
    get muted() { return muted; },
    get isPaused() { return paused; },
    get currentTrack() { return currentState || pendingState; }
  };

  if (typeof window !== 'undefined') {
    window.AudioEngine = api;
  }

  return api;
})();

if (typeof window !== 'undefined') {
  window.AudioEngine = AudioEngine;
}
