/**
 * AUDIO ENGINE PROCEDURAL — OXE! A ODISSEIA DOS NOVE SÓIS
 * Trilha sonora e efeitos sintetizados 100% em Web Audio API.
 * Autêntico baião, xote e forró (Zabumba, Triângulo, Sanfona) + SFX arcade sertanejo.
 */

const AudioEngine = (() => {
  'use strict';

  // ===================== CONTEXTO E ROTEAMENTO =====================
  let ctx = null;
  let master = null, musicBus = null, sfxBus = null, comp = null, reverb = null, reverbSend = null;
  let noiseBuffer = null;
  let muted = false;
  let masterVolume = 0.8, musicVolume = 0.55, sfxVolume = 0.85;
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
    }
    return ctx;
  }

  // ===================== UNLOCK MOBILE =====================
  function unlock() {
    try {
      init();
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        ctx.resume().then(() => {
          unlocked = true;
          if (pendingState) {
            const st = pendingState;
            pendingState = null;
            playMusic(st);
          }
        }).catch(() => {});
      } else {
        unlocked = true;
      }

      // Buffer silencioso para desbloquear Web Audio no iOS Safari
      const b = ctx.createBuffer(1, 1, 22050);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.start(0);

      if (pendingState) {
        const st = pendingState;
        pendingState = null;
        playMusic(st);
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
        unlockEvents.forEach(e => document.removeEventListener(e, handler, true));
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
  function env(gainNode, t, a, peak, d, sustain = 0.0001) {
    const g = gainNode.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(peak, t + a);
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

  // ===================== INSTRUMENTOS =====================

  // Zabumba: batida grave da pele
  function zabumbaKick(t, vel = 1, dest = musicBus) {
    if (!ctx) return;
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
    if (!ctx) return;
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
    if (!ctx) return;
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
        o.type = i === 0 ? 'sine' : 'square';
        o.frequency.value = f;
        g.gain.value = i === 0 ? 0.6 : 0.12;
        o.connect(g); g.connect(out);
        o.start(t); o.stop(t + dur + 0.04);
      });
    } catch (e) {}
  }

  // Sanfona: fole com palhetas sintetizadas em saw + square desafinadas
  function sanfona(t, freq, dur, vel = 1, dest = musicBus, bright = 1) {
    if (!ctx || !freq) return;
    try {
      const out = ctx.createGain();
      const a = 0.02, r = 0.05;
      const peak = 0.12 * vel;
      out.gain.setValueAtTime(0.0001, t);
      out.gain.linearRampToValueAtTime(peak, t + a);
      out.gain.setValueAtTime(peak, t + Math.max(a, dur - r));
      out.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = Math.min(freq * 6 * bright, 5500);

      const oscDetunes = [-7, 0, 7];
      oscDetunes.forEach((cents, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = i === 1 ? 'sawtooth' : 'triangle';
        o.frequency.value = freq;
        o.detune.value = cents;
        g.gain.value = i === 1 ? 0.45 : 0.28;
        o.connect(g); g.connect(lp);
        o.start(t); o.stop(t + dur + 0.05);
      });

      lp.connect(out);
      out.connect(dest);
      if (reverbSend) out.connect(reverbSend);
    } catch (e) {}
  }

  // ===================== COMPOSIÇÕES NORDESTINAS =====================
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
      ],
    },
    overworld: {
      bpm: 110, root: 57, // A3 — Xote animado
      style: 'xote', loops: true,
      melody: [
        [12, 2], [14, 2], [16, 2], [18, 2], [19, 4], [16, 4],
        [18, 2], [16, 2], [14, 4], [12, 8],
        [12, 2], [14, 2], [16, 2], [18, 2], [21, 4], [19, 2], [18, 2],
        [19, 4], [14, 4], [7, 8]
      ],
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
      ],
    },
    boss: {
      bpm: 146, root: 50, // D3 — Forró tenso
      style: 'forro', loops: true,
      melody: [
        [12, 2], [15, 2], [17, 2], [12, 2], [21, 4], [19, 2], [17, 2],
        [15, 2], [17, 2], [15, 2], [14, 2], [12, 8],
        [12, 2], [15, 2], [17, 2], [19, 2], [21, 2], [22, 2], [24, 4],
        [22, 2], [21, 2], [19, 2], [17, 2], [21, 8]
      ],
    },
    victory: {
      bpm: 138, root: 60, // C4 — Fanfarra Baião
      style: 'baiao', loops: false,
      melody: [
        [7, 2], [12, 2], [16, 2], [19, 4], [16, 2], [19, 4],
        [17, 2], [21, 2], [24, 4], [21, 2], [19, 2],
        [17, 2], [19, 2], [21, 2], [23, 2], [26, 4], [23, 4],
        [24, 12]
      ],
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
    }
  };

  // ===================== SEQUENCIADOR DE MÚSICA =====================
  let currentState = null;
  let pendingState = null;
  let songGain = null;
  let schedTimer = null;
  let seq = null;
  const LOOKAHEAD = 0.12;
  const INTERVAL = 25;

  function buildMelodyEvents(song) {
    const ev = [];
    let pos = 0;
    song.melody.forEach(([n, d]) => {
      if (n !== null) ev.push({ step: pos, note: n, len: d });
      pos += d;
    });
    return { events: ev, length: pos };
  }

  function playMusic(state) {
    if (!SONGS[state]) return;
    init();
    if (!ctx) return;
    if (ctx.state !== 'running' && !unlocked) {
      pendingState = state;
      currentState = state;
      return;
    }
    if (currentState === state && seq) return;
    stopMusic(0.3);
    currentState = state;

    const song = SONGS[state];
    songGain = ctx.createGain();
    songGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    songGain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.3);
    songGain.connect(musicBus);

    const mel = buildMelodyEvents(song);
    const pat = GROOVES[song.style] || GROOVES.baiao;
    const stepDur = (60 / song.bpm) / 4;

    seq = {
      song,
      mel,
      pat,
      stepDur,
      startCtxTime: ctx.currentTime + 0.05,
      nextStep: 0,
      loopLength: Math.max(mel.length, pat.zab.length)
    };

    if (schedTimer) clearInterval(schedTimer);
    schedTimer = setInterval(scheduler, INTERVAL);
  }

  function scheduler() {
    if (!seq || !ctx || ctx.state !== 'running') return;
    const scheduleUntil = ctx.currentTime + LOOKAHEAD;
    while (seq.startCtxTime + seq.nextStep * seq.stepDur < scheduleUntil) {
      const stepTime = seq.startCtxTime + seq.nextStep * seq.stepDur;
      const stepInLoop = seq.nextStep % seq.loopLength;

      // 1. Zabumba
      const zStep = stepInLoop % seq.pat.zab.length;
      const zHit = seq.pat.zab[zStep];
      if (zHit === 'K') zabumbaKick(stepTime, 0.9, songGain);
      else if (zHit === 'R') zabumbaRim(stepTime, 0.7, songGain);

      // 2. Triângulo
      const tStep = stepInLoop % seq.pat.tri.length;
      const tHit = seq.pat.tri[tStep];
      if (tHit === 'T') triangulo(stepTime, true, 0.55, songGain);
      else if (tHit === 't') triangulo(stepTime, false, 0.45, songGain);

      // 3. Baixo
      const bStep = stepInLoop % seq.pat.bass.length;
      const bNote = seq.pat.bass[bStep];
      if (bNote !== null && bNote !== undefined) {
        const rootFreq = 55 * Math.pow(2, (seq.song.root || 0) / 12);
        const freq = rootFreq * Math.pow(2, bNote / 12);
        sanfona(stepTime, freq, seq.stepDur * 1.5, 0.35, songGain, 0.5);
      }

      // 4. Melodia
      const melEv = seq.mel.events.find(e => e.step === (seq.nextStep % seq.mel.length));
      if (melEv) {
        const rootFreq = 220 * Math.pow(2, (seq.song.root || 0) / 12);
        const freq = rootFreq * Math.pow(2, melEv.note / 12);
        sanfona(stepTime, freq, melEv.len * seq.stepDur * 0.9, 0.5, songGain, 1);
      }

      seq.nextStep++;
    }
  }

  function stopMusic(fadeTime = 0.3) {
    if (schedTimer) {
      clearInterval(schedTimer);
      schedTimer = null;
    }
    if (songGain && ctx) {
      try {
        songGain.gain.setValueAtTime(songGain.gain.value, ctx.currentTime);
        songGain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + fadeTime);
        setTimeout(() => {
          try { songGain.disconnect(); } catch (e) {}
          songGain = null;
        }, fadeTime * 1000 + 40);
      } catch (e) {}
    }
    seq = null;
    currentState = null;
  }

  // ===================== EFEITOS SONOROS (SFX ARCADE) =====================
  function playSFX(name) {
    if (muted) return;
    init();
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;

    try {
      switch (name) {
        case 'jump': {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'square';
          o.frequency.setValueAtTime(160, t);
          o.frequency.exponentialRampToValueAtTime(480, t + 0.12);
          env(g, t, 0.005, 0.3, 0.12);
          o.connect(g); g.connect(sfxBus);
          o.start(t); o.stop(t + 0.14);
          break;
        }

        case 'doubleJump': {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'triangle';
          o.frequency.setValueAtTime(320, t);
          o.frequency.exponentialRampToValueAtTime(680, t + 0.15);
          env(g, t, 0.005, 0.35, 0.15);
          o.connect(g); g.connect(sfxBus);
          o.start(t); o.stop(t + 0.16);
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
          // Pisão em cima do inimigo
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(220, t);
          o.frequency.exponentialRampToValueAtTime(50, t + 0.15);
          env(g, t, 0.002, 0.5, 0.16);
          o.connect(g); g.connect(sfxBus);
          o.start(t); o.stop(t + 0.18);
          break;
        }

        case 'hit': {
          // Dano sofrido
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(180, t);
          o.frequency.exponentialRampToValueAtTime(40, t + 0.22);
          env(g, t, 0.002, 0.45, 0.22);
          o.connect(g); g.connect(sfxBus);
          o.start(t); o.stop(t + 0.24);
          break;
        }

        case 'coin': {
          // Rapadura coletada (chime cristalino duplo)
          const notes = [987, 1318]; // B5 -> E6
          notes.forEach((freq, idx) => {
            const delay = idx * 0.06;
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'sine';
            o.frequency.value = freq;
            env(g, t + delay, 0.002, 0.28, 0.16);
            o.connect(g); g.connect(sfxBus);
            o.start(t + delay); o.stop(t + delay + 0.18);
          });
          break;
        }

        case 'caju': {
          // Joia de Caju Dourado (arpejo mágico)
          const notes = [523, 659, 784, 1046]; // C5, E5, G5, C6
          notes.forEach((freq, idx) => {
            const delay = idx * 0.05;
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'triangle';
            o.frequency.value = freq;
            env(g, t + delay, 0.004, 0.3, 0.2);
            o.connect(g); g.connect(sfxBus);
            if (reverbSend) g.connect(reverbSend);
            o.start(t + delay); o.stop(t + delay + 0.22);
          });
          break;
        }

        case 'checkpoint': {
          // Fanfarra curta de bandeira
          const notes = [440, 554, 659, 880];
          notes.forEach((freq, idx) => {
            const delay = idx * 0.07;
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'sawtooth';
            o.frequency.value = freq;
            env(g, t + delay, 0.005, 0.25, 0.25);
            o.connect(g); g.connect(sfxBus);
            o.start(t + delay); o.stop(t + delay + 0.28);
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
          // Planar com o chapéu
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
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'square';
          o.frequency.setValueAtTime(800, t);
          o.frequency.exponentialRampToValueAtTime(320, t + 0.08);
          env(g, t, 0.002, 0.22, 0.08);
          o.connect(g); g.connect(sfxBus);
          o.start(t); o.stop(t + 0.09);
          break;
        }

        case 'bee': {
          // BÉÉÉ! do bode furioso
          for (let i = 0; i < 4; i++) {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'sawtooth';
            const f = 460 + (i % 2) * 50;
            o.frequency.setValueAtTime(f, t + i * 0.06);
            env(g, t + i * 0.06, 0.005, 0.25, 0.07);
            o.connect(g); g.connect(sfxBus);
            o.start(t + i * 0.06); o.stop(t + i * 0.06 + 0.08);
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
          o.start(t); o.stop(t + 0.47);
          break;
        }

        case 'miasma': {
          // Miasma tenebroso do Papa-Figo
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(140, t);
          o.frequency.exponentialRampToValueAtTime(45, t + 0.35);
          env(g, t, 0.01, 0.3, 0.35);
          o.connect(g); g.connect(sfxBus);
          o.start(t); o.stop(t + 0.37);
          break;
        }

        case 'bonk': {
          // Colisão na parede / atordoamento
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'triangle';
          o.frequency.setValueAtTime(110, t);
          o.frequency.exponentialRampToValueAtTime(35, t + 0.2);
          env(g, t, 0.003, 0.4, 0.2);
          o.connect(g); g.connect(sfxBus);
          o.start(t); o.stop(t + 0.22);
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
          o1.start(t); o2.start(t); o1.stop(t + 0.22); o2.stop(t + 0.22);
          break;
        }
      }
    } catch (e) {}
  }

  function toggleMute() {
    muted = !muted;
    if (master && ctx) {
      try {
        master.gain.setValueAtTime(muted ? 0 : masterVolume, ctx.currentTime);
      } catch (e) {}
    }
    return muted;
  }

  function setMasterVolume(v) {
    masterVolume = Math.max(0, Math.min(1, v));
    if (master && !muted && ctx) {
      try {
        master.gain.setValueAtTime(masterVolume, ctx.currentTime);
      } catch (e) {}
    }
  }

  const api = {
    init,
    unlock,
    playMusic,
    stopMusic,
    playSFX,
    toggleMute,
    setMasterVolume,
    get unlocked() { return unlocked; },
    get muted() { return muted; }
  };

  if (typeof window !== 'undefined') {
    window.AudioEngine = api;
  }

  return api;
})();

if (typeof window !== 'undefined') {
  window.AudioEngine = AudioEngine;
}
