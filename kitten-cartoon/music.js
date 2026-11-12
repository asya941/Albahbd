/* ===========================================================
   Музыка и звуки для «Рыжика» — Web Audio API, без аудиофайлов.
   Оригинальная мелодия-«музыкальная шкатулка» в фа мажоре,
   8 тактов × 2.5 с = 20 с, синхронно с сюжетом мультфильма:
   такты 1–4 — прогулка, 4–6 — бабочка (искорки), 7–8 — финал, «мяу».
   =========================================================== */
window.KittenMusic = (() => {
  "use strict";

  const BAR = 2.5;            // длительность такта, сек
  const BEAT = BAR / 4;       // четверть
  const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  let ctx = null, master = null, dry = null, wet = null;
  let session = null;                 // текущая «партия» (для перемотки/повтора)
  let base = { ctx: 0, story: 0 };    // связь часов аудио и времени сюжета

  // ---------- Граф: master → компрессор → колонки, + ревербератор ----------
  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    master = ctx.createGain();
    master.gain.value = 1.3;
    master.connect(comp).connect(ctx.destination);

    // «волшебная» реверберация из затухающего шума
    const len = Math.floor(ctx.sampleRate * 2.8);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    const rev = ctx.createConvolver();
    rev.buffer = ir;
    const revOut = ctx.createGain();
    revOut.gain.value = 0.45;
    rev.connect(revOut).connect(master);
    dry = master;
    wet = rev;
    return ctx;
  }

  function newSession() {
    if (session) {
      const old = session;
      const now = ctx.currentTime;
      old.dry.gain.setTargetAtTime(0, now, 0.03);
      old.wet.gain.setTargetAtTime(0, now, 0.03);
      setTimeout(() => { old.dry.disconnect(); old.wet.disconnect(); }, 400);
    }
    const s = { dry: ctx.createGain(), wet: ctx.createGain() };
    s.dry.connect(dry);
    s.wet.connect(wet);
    session = s;
    return s;
  }

  // ---------- Инструменты ----------
  // Колокольчик музыкальной шкатулки
  function bell(s, when, midi, vel, len = 1.6) {
    const f = midiHz(midi);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vel, when + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0005, when + len);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0, when);
    g2.gain.linearRampToValueAtTime(vel * 0.35, when + 0.004);
    g2.gain.exponentialRampToValueAtTime(0.0005, when + len * 0.35);
    const o1 = ctx.createOscillator();
    o1.type = "sine"; o1.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = "sine"; o2.frequency.value = f * 4.01;   // «металлический» обертон
    o1.connect(g); o2.connect(g2);
    for (const n of [g, g2]) { n.connect(s.dry); n.connect(s.wet); }
    o1.start(when); o2.start(when);
    o1.stop(when + len + 0.05); o2.stop(when + len + 0.05);
  }

  // Мягкий фон-аккорд
  function pad(s, when, midis, len, vel = 0.03) {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(700, when);
    lp.frequency.linearRampToValueAtTime(1400, when + len * 0.6);
    lp.frequency.linearRampToValueAtTime(800, when + len + 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vel, when + 0.6);
    g.gain.setValueAtTime(vel, when + len);
    g.gain.linearRampToValueAtTime(0, when + len + 0.9);
    lp.connect(g);
    g.connect(s.dry); g.connect(s.wet);
    for (const m of midis) {
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = "triangle";
        o.frequency.value = midiHz(m);
        o.detune.value = det;
        o.connect(lp);
        o.start(when);
        o.stop(when + len + 1);
      }
    }
  }

  // Мягкий бас
  function bass(s, when, midi, len) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(0.16, when + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, when + len);
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = midiHz(midi);
    o.connect(g); g.connect(s.dry);
    o.start(when); o.stop(when + len + 0.05);
  }

  // Искорки (бабочка)
  const PENTA = [77, 79, 81, 84, 86, 89, 91, 93, 96];
  function sparkle(s, when, n = 6, up = false) {
    for (let i = 0; i < n; i++) {
      const m = up ? PENTA[i % PENTA.length] : PENTA[Math.floor(Math.random() * PENTA.length)];
      bell(s, when + i * 0.07, m, 0.045, 0.9);
    }
  }

  // «Мяу!»
  function meow(s, when) {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(480, when);
    o.frequency.linearRampToValueAtTime(760, when + 0.12);
    o.frequency.linearRampToValueAtTime(820, when + 0.28);
    o.frequency.exponentialRampToValueAtTime(520, when + 0.62);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 7;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 14;
    lfo.connect(lfoG).connect(o.frequency);
    // форманты: «м» → «я» → «у»
    const f1 = ctx.createBiquadFilter();
    f1.type = "bandpass"; f1.Q.value = 3;
    f1.frequency.setValueAtTime(700, when);
    f1.frequency.linearRampToValueAtTime(1500, when + 0.15);
    f1.frequency.linearRampToValueAtTime(900, when + 0.6);
    const f2 = ctx.createBiquadFilter();
    f2.type = "bandpass"; f2.Q.value = 5;
    f2.frequency.setValueAtTime(2400, when);
    f2.frequency.linearRampToValueAtTime(2900, when + 0.2);
    f2.frequency.linearRampToValueAtTime(1800, when + 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(0.5, when + 0.06);
    g.gain.setValueAtTime(0.5, when + 0.38);
    g.gain.linearRampToValueAtTime(0, when + 0.66);
    o.connect(f1); o.connect(f2);
    const mix = ctx.createGain();
    mix.gain.value = 0.9;
    f1.connect(mix); f2.connect(mix);
    mix.connect(g);
    g.connect(s.dry); g.connect(s.wet);
    o.start(when); lfo.start(when);
    o.stop(when + 0.7); lfo.stop(when + 0.7);
  }

  // ---------- Партитура ----------
  // Аккорды по тактам (MIDI) и басовые ноты
  const CHORDS = [
    { t: 0, notes: [53, 57, 60], bass: 41, len: 4 },   // F
    { t: 4, notes: [50, 53, 57], bass: 38, len: 4 },   // Dm
    { t: 8, notes: [46, 50, 53], bass: 34, len: 4 },   // Bb
    { t: 12, notes: [48, 52, 55], bass: 36, len: 4 },  // C
    { t: 16, notes: [53, 57, 60], bass: 41, len: 4 },  // F
    { t: 20, notes: [45, 48, 52], bass: 33, len: 4 },  // Am
    { t: 24, notes: [46, 50, 53], bass: 34, len: 2 },  // Bb
    { t: 26, notes: [48, 52, 55], bass: 36, len: 2 },  // C
    { t: 28, notes: [53, 57, 60, 65], bass: 41, len: 5 }, // F (финал)
  ];
  // Мелодия: [доля, нота, длительность в долях]
  const MELODY = [
    [0, 72, 1], [1, 69, 1], [2, 77, 1.5], [3.5, 76, 0.5],
    [4, 74, 1.5], [5.5, 72, 0.5], [6, 69, 2],
    [8, 70, 1], [9, 74, 1], [10, 77, 1], [11, 79, 1],
    [12, 81, 1.5], [13.5, 79, 0.5], [14, 76, 2],
    [16, 77, 1], [17, 81, 1], [18, 84, 1.5], [19.5, 81, 0.5],
    [20, 79, 1], [21, 76, 1], [22, 72, 2],
    [24, 74, 1], [25, 77, 1], [26, 76, 1], [27, 79, 1],
    [28, 77, 4],
  ];

  const EVENTS = [];
  const at = (t, fn) => EVENTS.push({ t, fn });
  for (const c of CHORDS) {
    const t = c.t * BEAT;
    const len = c.len * BEAT;
    at(t, (s, w) => pad(s, w, c.notes, len));
    at(t, (s, w) => bass(s, w, c.bass, Math.min(len, 2.4)));
    // арпеджио восьмыми (тише мелодии)
    const arp = [c.notes[0], c.notes[1], c.notes[2], c.notes[0] + 12, c.notes[2], c.notes[1], c.notes[0] + 12, c.notes[1] + 12];
    const steps = Math.min(c.len, 4) * 2;
    for (let i = 0; i < steps; i++) {
      const m = arp[i % arp.length] + 12;
      at(t + i * BEAT / 2, (s, w) => bell(s, w, m, 0.03, 1.1));
    }
  }
  for (const [b, m, d] of MELODY) {
    at(b * BEAT, (s, w) => bell(s, w, m, 0.11, Math.max(1.2, d * BEAT * 2.2)));
  }
  // бабочка прилетает, кружит и улетает
  at(7.4, (s, w) => sparkle(s, w, 7));
  at(8.7, (s, w) => sparkle(s, w, 5));
  at(10.0, (s, w) => sparkle(s, w, 5));
  at(11.3, (s, w) => sparkle(s, w, 5));
  at(12.6, (s, w) => sparkle(s, w, 9, true));
  // «Мяу!» и финальный перезвон
  at(17.95, (s, w) => meow(s, w));
  at(19.0, (s, w) => sparkle(s, w, 9, true));
  EVENTS.sort((a, b) => a.t - b.t);

  // ---------- Публичное API ----------
  function startFrom(storyT) {
    if (!ensure()) return;
    const s = newSession();
    const lead = 0.06;
    base = { ctx: ctx.currentTime + lead, story: storyT };
    for (const e of EVENTS) {
      if (e.t < storyT - 0.02) continue;
      e.fn(s, base.ctx + (e.t - storyT));
    }
  }

  return {
    // Создать звук (лучше вызывать из нажатия пользователя)
    unlock() {
      if (!ensure()) return Promise.resolve(false);
      return ctx.resume().then(() => ctx.state === "running").catch(() => false);
    },
    isRunning: () => !!ctx && ctx.state === "running",
    startFrom,
    pause() { if (ctx) ctx.suspend(); },
    resume() { if (ctx) return ctx.resume(); },
    stop() {
      if (!ctx) return;
      newSession(); // заглушить запланированное
    },
    // Текущее время сюжета по аудиочасам (точная синхронизация)
    storyNow() {
      return base.story + Math.max(0, ctx.currentTime - base.ctx);
    },
  };
})();
