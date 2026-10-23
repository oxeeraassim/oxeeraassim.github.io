const AudioEngine = (() => {
  'use strict';

  // ===================== CONTEXTO E ROTEAMENTO =====================
  let ctx = null;
  let master = null, musicBus = null, sfxBus = null, comp = null, reverb = null, reverbSend = null;
  let noiseBuffer = null;
  let muted = false;
  let masterVolume = 0.8, musicVolume = 0.55, sfxVolume = 0.85;
  let unlocked = false;

  function createImpulse(duration = 1.6, decay = 2.5) {
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
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function init() {
    if (ctx) return ctx;
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
    reverbSend.gain.value = 0.22;

    musicBus.connect(comp);
    sfxBus.connect(comp);
    reverbSend.connect(reverb);
    reverb.connect(comp);
    comp.connect(master);
    master.connect(ctx.destination);

    noiseBuffer = createNoise();
    return ctx;
  }

  // ===================== UNLOCK MOBILE =====================
  function unlock() {
    init();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (!unlocked) {
      // buffer silencioso para destravar iOS
      const b = ctx.createBuffer(1, 1, 22050);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.start(0);
      unlocked = true;
      if (pendingState) { const st = pendingState; pendingState = null; playMusic(st); }
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
    unlockEvents.forEach(e => document.addEventListener(e, handler, { capture: true, passive: true }));
  }
  if (typeof document !== 'undefined') attachUnlock();

  // ===================== UTILITÁRIOS =====================
  const A4 = 440;
  const NOTE_INDEX = { C: -9, 'C#': -8, Db: -8, D: -7, 'D#': -6, Eb: -6, E: -5, F: -4, 'F#': -3, Gb: -3, G: -2, 'G#': -1, Ab: -1, A: 0, 'A#': 1, Bb: 1, B: 2 };
  function noteFreq(n) {
    if (typeof n === 'number') return n;
    const m = /^([A-G][#b]?)(-?\d)$/.exec(n);
    if (!m) return 0;
    const semis = NOTE_INDEX[m[1]] + (parseInt(m[2], 10) - 4) * 12;
    return A4 * Math.pow(2, semis / 12);
  }
  const midiFreq = m => 440 * Math.pow(2, (m - 69) / 12);

  function env(gainNode, t, a, peak, d, sustain = 0.0001) {
    const g = gainNode.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(peak, t + a);
    g.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + a + d);
  }

  function noiseSource(t, dur) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuffer;
    s.loop = true;
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
    return s;
  }

  // ===================== INSTRUMENTOS =====================

  // Zabumba: bacalhau grave (pele) + batida de aro/bacalhau agudo
  function zabumbaKick(t, vel = 1, dest = musicBus) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.35);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.95 * vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + 0.45);

    // estalo da pele
    const n = noiseSource(t, 0.03);
    const nf = ctx.createBiquadFilter();
    nf.type = 'lowpass'; nf.frequency.value = 1800;
    const ng = ctx.createGain();
    env(ng, t, 0.001, 0.25 * vel, 0.025);
    n.connect(nf); nf.connect(ng); ng.connect(dest);
  }

  function zabumbaRim(t, vel = 1, dest = musicBus) {
    // bacalhau (vareta fina) no aro de baixo
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(820, t);
    o.frequency.exponentialRampToValueAtTime(420, t + 0.04);
    env(g, t, 0.001, 0.22 * vel, 0.06);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + 0.08);

    const n = noiseSource(t, 0.05);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 2.5;
    const ng = ctx.createGain();
    env(ng, t, 0.001, 0.3 * vel, 0.04);
    n.connect(bp); bp.connect(ng); ng.connect(dest);
  }

  // Triângulo: parciais inarmônicos metálicos (3500-6000Hz)
  function triangulo(t, open = false, vel = 1, dest = musicBus) {
    const base = 3500 + Math.random() * 150;
    const ratios = [1, 1.27, 1.52, 1.71];
    const dur = open ? 0.55 : 0.06;
    const out = ctx.createGain();
    env(out, t, 0.001, (open ? 0.09 : 0.06) * vel, dur);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 3000;
    out.connect(hp); hp.connect(dest);
    if (open) hp.connect(reverbSend);
    ratios.forEach((r, i) => {
      const f = Math.min(base * r, 6000);
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = i === 0 ? 'sine' : 'square';
      o.frequency.value = f;
      g.gain.value = i === 0 ? 0.6 : 0.12;
      o.connect(g); g.connect(out);
      o.start(t); o.stop(t + dur + 0.05);
    });
  }

  // Sanfona: saw + square desafinadas, vibrato LFO, filtro de "fole"
  function sanfona(t, freq, dur, vel = 1, dest = musicBus, bright = 1) {
    const out = ctx.createGain();
    const a = 0.025, r = 0.06;
    const peak = 0.11 * vel;
    out.gain.setValueAtTime(0.0001, t);
    out.gain.linearRampToValueAtTime(peak, t + a);
    out.gain.setValueAtTime(peak * 0.85, t + Math.max(a, dur - r));
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur + r);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(1800 + freq * 3 * bright, 9000);
    lp.Q.value = 1.2;

    // ressonância do "palheta"
    const peakF = ctx.createBiquadFilter();
    peakF.type = 'peaking'; peakF.frequency.value = 1400; peakF.gain.value = 4; peakF.Q.value = 1;

    const lfo = ctx.createOscillator();
    const lfoG = ctx.createGain();
    lfo.frequency.value = 5.5;
    lfoG.gain.value = freq * 0.004;
    lfo.connect(lfoG);

    // tremolo do fole (musette)
    const trem = ctx.createOscillator();
    const tremG = ctx.createGain();
    trem.frequency.value = 6.2;
    tremG.gain.value = peak * 0.12;
    trem.connect(tremG); tremG.connect(out.gain);

    const voices = [
      { type: 'sawtooth', det: -7, g: 0.5 },
      { type: 'sawtooth', det: 7, g: 0.5 },
      { type: 'square', det: 0, g: 0.3, mul: 0.5 },
    ];
    voices.forEach(v => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = v.type;
      o.frequency.value = freq * (v.mul || 1);
      o.detune.value = v.det;
      lfoG.connect(o.frequency);
      g.gain.value = v.g;
      o.connect(g); g.connect(lp);
      o.start(t); o.stop(t + dur + r + 0.05);
    });
    lp.connect(peakF); peakF.connect(out);
    out.connect(dest);
    out.connect(reverbSend);
    lfo.start(t); lfo.stop(t + dur + r + 0.05);
    trem.start(t); trem.stop(t + dur + r + 0.05);
  }

  // Baixos da sanfona (botões de baixo)
  function sanfonaBass(t, freq, dur, vel = 1, dest = musicBus) {
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o2.type = 'square';
    o.frequency.value = freq; o2.frequency.value = freq / 2;
    lp.type = 'lowpass'; lp.frequency.value = 600;
    const pk = 0.16 * vel;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(pk, t + 0.01);
    g.gain.exponentialRampToValueAtTime(pk * 0.4, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const g2 = ctx.createGain(); g2.gain.value = 0.4;
    o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(dest);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }

  function sanfonaChord(t, freqs, dur, vel = 0.5, dest = musicBus) {
    freqs.forEach(f => sanfona(t, f, dur, vel / Math.sqrt(freqs.length) * 1.3, dest, 0.6));
  }

  // ===================== COMPOSIÇÕES =====================
  // Escalas: mixolídio (b7) e lídio (#4) = "modo nordestino"; dórico para tensão.
  // Notação melodia: [grau MIDI relativo ou null, duração em 16avos]
  // Acordes: array de offsets MIDI em relação à tônica

  const SONGS = {
    title: {
      bpm: 92, root: 55, // G3 — Xote
      style: 'xote', loops: true,
      chords: [[0, 4, 7, 10], [5, 9, 12], [0, 4, 7, 10], [-2, 2, 5, 9], [5, 9, 12, 15], [0, 4, 7], [-5, -1, 2, 5], [0, 4, 7, 10]],
      melody: [
        [12, 4], [14, 2], [16, 2], [19, 6], [17, 2],
        [16, 4], [14, 2], [12, 2], [10, 8],
        [12, 4], [14, 2], [16, 2], [18, 4], [19, 4],
        [17, 4], [16, 2], [14, 2], [12, 8],
        [19, 2], [21, 2], [22, 4], [21, 2], [19, 2], [17, 4],
        [16, 4], [14, 2], [16, 2], [12, 8],
        [10, 2], [12, 2], [14, 4], [16, 2], [14, 2], [11, 4],
        [12, 12], [null, 4],
      ],
    },
    overworld: {
      bpm: 112, root: 57, // A3 — Xote animado, lídio
      style: 'xote', loops: true,
      chords: [[0, 4, 7], [2, 6, 9], [0, 4, 7], [-5, -1, 2, 5], [0, 4, 7], [2, 6, 9], [5, 9, 12], [-5, -1, 2]],
      melody: [
        [12, 2], [14, 2], [16, 2], [18, 2], [19, 4], [16, 4],
        [18, 2], [16, 2], [14, 4], [12, 8],
        [12, 2], [14, 2], [16, 2], [18, 2], [21, 4], [19, 2], [18, 2],
        [19, 4], [14, 4], [7, 8],
        [16, 2], [18, 2], [19, 2], [18, 2], [16, 4], [12, 4],
        [14, 2], [18, 2], [21, 4], [19, 8],
        [17, 2], [16, 2], [14, 2], [12, 2], [14, 4], [11, 4],
        [12, 12], [null, 4],
      ],
    },
    stage: {
      bpm: 132, root: 52, // E3 — Baião, mixolídio
      style: 'baiao', loops: true,
      chords: [[0, 4, 7, 10], [0, 4, 7, 10], [-2, 2, 5], [-2, 2, 5], [5, 9, 12], [3, 7, 10], [0, 4, 7, 10], [-2, 2, 5, 10]],
      melody: [
        [12, 3], [12, 3], [14, 2], [16, 4], [19, 4],
        [17, 2], [16, 2], [14, 2], [12, 2], [10, 8],
        [10, 3], [10, 3], [12, 2], [14, 4], [17, 4],
        [16, 2], [14, 2], [12, 2], [10, 2], [12, 8],
        [17, 3], [17, 3], [19, 2], [21, 4], [17, 4],
        [15, 3], [15, 3], [17, 2], [19, 4], [15, 4],
        [16, 2], [19, 2], [22, 2], [19, 2], [16, 2], [14, 2], [12, 4],
        [10, 2], [12, 2], [14, 2], [10, 2], [12, 8],
      ],
    },
    boss: {
      bpm: 150, root: 50, // D3 — Forró tenso, dórico
      style: 'forro', loops: true,
      chords: [[0, 3, 7], [0, 3, 7, 10], [5, 9, 12], [5, 9, 12], [3, 7, 10], [-2, 2, 5], [0, 3, 7], [-5, -2, 2, 7]],
      melody: [
        [12, 2], [15, 2], [17, 2], [12, 2], [21, 4], [19, 2], [17, 2],
        [15, 2], [17, 2], [15, 2], [14, 2], [12, 8],
        [12, 2], [15, 2], [17, 2], [19, 2], [21, 2], [22, 2], [24, 4],
        [22, 2], [21, 2], [19, 2], [17, 2], [21, 8],
        [24, 2], [22, 2], [21, 2], [19, 2], [17, 4], [15, 4],
        [17, 2], [15, 2], [14, 2], [10, 2], [12, 8],
        [12, 1], [15, 1], [17, 1], [19, 1], [21, 4], [19, 2], [17, 2], [15, 4],
        [14, 4], [7, 4], [12, 8],
      ],
    },
    victory: {
      bpm: 140, root: 60, // C4 — fanfarra baião
      style: 'baiao', loops: false,
      chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14, 17], [0, 4, 7, 12]],
      melody: [
        [7, 2], [12, 2], [16, 2], [19, 4], [16, 2], [19, 4],
        [17, 2], [21, 2], [24, 4], [21, 2], [19, 2],
        [17, 2], [19, 2], [21, 2], [23, 2], [26, 4], [23, 4],
        [24, 12], [null, 4],
      ],
    },
    gameover: {
      bpm: 76, root: 50, // D3 — lamento dórico
      style: 'lamento', loops: false,
      chords: [[0, 3, 7], [-2, 2, 5], [-4, 0, 3], [0, 3, 7]],
      melody: [
        [15, 4], [14, 4], [12, 4], [10, 4],
        [9, 6], [7, 2], [5, 8],
        [7, 4], [8, 4], [10, 4], [9, 4],
        [12, 14], [null, 2],
      ],
    },
  };

  // Padrões de percussão por estilo (16 passos por compasso)
  // K = kick zabumba, R = aro, t = triângulo fechado, T = triângulo aberto, '.' nada
  const GROOVES = {
    baiao: {
      zab: ['K', '.', '.', 'K', '.', '.', 'R', '.', 'K', '.', '.', 'K', '.', '.', 'R', 'R'],
      tri: ['t', 't', 'T', 't', 't', 't', 'T', 't', 't', 't', 'T', 't', 't', 't', 'T', 't'],
      bass: [0, null, null, 7, null, null, null, null, 0, null, null, 7, null, null, 5, null],
      comp: [null, null, 1, null, null, null, 1, null, null, null, 1, null, null, null, 1, null],
    },
    xote: {
      zab: ['K', '.', '.', '.', 'R', '.', 'K', '.', 'K', '.', '.', '.', 'R', '.', '.', '.'],
      tri: ['T', '.', 't', 't', 'T', '.', 't', 't', 'T', '.', 't', 't', 'T', '.', 't', 't'],
      bass: [0, null, null, null, null, null, 7, null, 0, null, null, null, null, null, null, null],
      comp: [null, null, null, null, 1, null, null, null, null, null, null, null, 1, null, 1, null],
    },
    forro: {
      zab: ['K', '.', 'R', 'K', '.', 'R', 'R', '.', 'K', '.', 'R', 'K', '.', 'R', 'K', 'R'],
      tri: ['t', 't', 'T', 't', 't', 't', 'T', 't', 't', 't', 'T', 't', 't', 't', 'T', 't'],
      bass: [0, null, null, 0, null, null, 7, null, 0, null, null, 0, null, null, 10, null],
      comp: [null, null, 1, null, null, 1, null, null, null, null, 1, null, null, 1, null, null],
    },
    lamento: {
      zab: ['K', '.', '.', '.', '.', '.', '.', '.', 'R', '.', '.', '.', '.', '.', '.', '.'],
      tri: ['T', '.', '.', '.', '.', '.', '.', '.', 'T', '.', '.', '.', '.', '.', '.', '.'],
      bass: [0, null, null, null, null, null, null, null, 7, null, null, null, null, null, null, null],
      comp: [1, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    },
  };

  // ===================== SEQUENCIADOR =====================
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
    if (!SONGS[state]) { console.warn('[AudioEngine] estado desconhecido:', state); return; }
    init();
    if (!ctx) return;
    if (ctx.state !== 'running' && !unlocked) { pendingState = state; currentState = state; return; }
    if (currentState === state && seq) return;
    stopMusic(0.4);
    currentState = state;

    const song = SONGS[state];
    songGain = ctx.createGain();
    songGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    songGain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.4);
    songGain.connect(musicBus);

    const mel = buildMelodyEvents(song);
    const pat = RHYTHMS[song.rhythm] || RHYTHMS.baiao;
    const stepDur = (60 / song.bpm) / 4; // 16th note duration

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
      if (zHit === 'K') playZabumbaKick(stepTime, 0.9);
      else if (zHit === 'k') playZabumbaKick(stepTime, 0.5);
      else if (zHit === 'R') playZabumbaRim(stepTime, 0.7);

      // 2. Triângulo
      const tStep = stepInLoop % seq.pat.tri.length;
      const tHit = seq.pat.tri[tStep];
      if (tHit === 'T') playTriangle(stepTime, false, 0.65);
      else if (tHit === 'O') playTriangle(stepTime, true, 0.5);

      // 3. Baixo / Sanfona
      const bStep = stepInLoop % seq.pat.bass.length;
      const bNote = seq.pat.bass[bStep];
      if (bNote !== null && bNote !== undefined) {
        const rootFreq = 55 * Math.pow(2, (seq.song.root || 0) / 12);
        const freq = rootFreq * Math.pow(2, bNote / 12);
        playAccordionNote(freq, stepTime, seq.stepDur * 1.5, 0.35);
      }

      // 4. Melodia
      const melEv = seq.mel.events.find(e => e.step === (seq.nextStep % seq.mel.length));
      if (melEv) {
        const rootFreq = 220 * Math.pow(2, (seq.song.root || 0) / 12);
        const freq = rootFreq * Math.pow(2, melEv.note / 12);
        playAccordionNote(freq, stepTime, melEv.len * seq.stepDur * 0.9, 0.5);
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
      songGain.gain.setValueAtTime(songGain.gain.value, ctx.currentTime);
      songGain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + fadeTime);
      setTimeout(() => {
        try { songGain.disconnect(); } catch (e) {}
        songGain = null;
      }, fadeTime * 1000 + 50);
    }
    seq = null;
    currentState = null;
  }

  // ===================== DESBLOQUEIO DE ÁUDIO (MOBILE/AUTOPLAY) =====================
  function unlock() {
    init();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => {
        unlocked = true;
        if (pendingState) {
          const s = pendingState;
          pendingState = null;
          playMusic(s);
        }
      });
    } else {
      unlocked = true;
      if (pendingState) {
        const s = pendingState;
        pendingState = null;
        playMusic(s);
      }
    }
  }

  function toggleMute() {
    muted = !muted;
    if (master) {
      master.gain.setValueAtTime(muted ? 0 : masterVolume, ctx ? ctx.currentTime : 0);
    }
    return muted;
  }

  function setMasterVolume(v) {
    masterVolume = Math.max(0, Math.min(1, v));
    if (master && !muted) {
      master.gain.setValueAtTime(masterVolume, ctx.currentTime);
    }
  }

  return {
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
})();