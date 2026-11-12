/* ===========================================================
   Рыжик в волшебном лесу — анимация (≈20 секунд)
   Чистый JavaScript + SVG, без библиотек.

   Сюжет:
   0–3 c     — затемнение, титр, котёнок выходит слева
   3–8 c     — котёнок гуляет, камера плавно едет за ним
   8–12.5 c  — остановка: прилетает бабочка, котёнок следит за ней
   12.5–17 c — котёнок идёт дальше
   17–20 c   — остановка, «Мяу!», титр «Конец», кнопка повтора
   =========================================================== */
(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const DURATION = 20;           // длина мультфильма, сек
  const GROUND_Y = 860;          // линия земли, по которой идёт котёнок
  const KITTEN_SCREEN_X = 620;   // где камера держит котёнка на экране
  const STRIDE = 130;            // длина шага (пикселей за цикл лап)

  const $ = (id) => document.getElementById(id);

  // ---------- Математика ----------
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  // окно: плавно 0→1 на [a,b], держим 1, плавно 1→0 на [c,d]
  const win = (x, a, b, c, d) => smooth(a, b, x) * (1 - smooth(c, d, x));

  // Детерминированный генератор случайных чисел — повтор всегда одинаковый
  function rng(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const R = rng(20250327);
  const rand = (a, b) => a + R() * (b - a);

  function el(tag, attrs, parent) {
    const n = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  // ---------- Движение котёнка ----------
  // «Желание идти» во времени (0 — стоит, 1 — идёт), плавные переходы
  const walkWeight = (t) =>
    win(t, 0.0, 0.6, 7.4, 8.4) + win(t, 12.3, 13.2, 16.6, 17.6);
  const SPEED = 175; // px/сек

  // Предрасчёт пройденного пути (интеграл скорости) — 120 точек/сек
  const SAMPLES = 120;
  const distTable = new Float32Array(DURATION * SAMPLES + 2);
  for (let i = 1; i < distTable.length; i++) {
    const t = i / SAMPLES;
    distTable[i] = distTable[i - 1] + (SPEED * walkWeight(t)) / SAMPLES;
  }
  const distAt = (t) => {
    const f = clamp(t, 0, DURATION) * SAMPLES;
    const i = Math.floor(f);
    const j = Math.min(i + 1, distTable.length - 1);
    return lerp(distTable[i], distTable[j], f - i);
  };
  const START_X = -260;
  const kittenWorldX = (t) => START_X + distAt(t);
  const cameraX = (t) => {
    const k = kittenWorldX(t) - KITTEN_SCREEN_X;
    // мягкий «вход» камеры, чтобы не было рывка
    return k > 0 ? k : 0;
  };
  const WORLD_END = kittenWorldX(DURATION);

  // ==========================================================
  //                 ПОСТРОЕНИЕ ДЕКОРАЦИЙ
  // ==========================================================
  const layers = {
    hills: { g: $("layerHills"), k: 0.12 },
    far: { g: $("layerFar"), k: 0.28 },
    mid: { g: $("layerMid"), k: 0.6 },
    ground: { g: $("layerGround"), k: 1.0 },
    front: { g: $("layerFront"), k: 1.45 },
  };
  const span = (k) => 1600 + (WORLD_END - KITTEN_SCREEN_X) * k + 400;

  // Звёзды
  const stars = [];
  for (let i = 0; i < 70; i++) {
    const s = el("circle", {
      cx: rand(0, 1600), cy: rand(0, 380), r: rand(0.8, 2.4), fill: "#fff",
    }, $("stars"));
    stars.push({ n: s, ph: rand(0, 6.28), sp: rand(1, 3) });
  }

  // Лучи света
  const rays = [];
  for (let i = 0; i < 6; i++) {
    const x = 700 + i * 120 + rand(-30, 30);
    const w = rand(40, 90);
    const p = el("polygon", {
      points: `${x},-50 ${x + w},-50 ${x - 260 + w * 2},1000 ${x - 380},1000`,
      fill: "url(#gRay)", opacity: 0.35,
    }, $("rays"));
    rays.push({ n: p, ph: rand(0, 6.28) });
  }

  // Холмы на горизонте
  function hillPath(width, baseY, amp, step, seedOff) {
    let d = `M-100,1000 L-100,${baseY}`;
    for (let x = -100; x <= width + step; x += step) {
      const y = baseY - amp * (0.5 + 0.5 * Math.sin(x * 0.004 + seedOff)) - amp * 0.4 * Math.sin(x * 0.011 + seedOff * 2);
      d += ` Q${x + step / 2},${y - amp * 0.3} ${x + step},${y}`;
    }
    return d + ` L${width + step},1000 Z`;
  }
  el("path", { d: hillPath(span(0.12), 700, 60, 160, 1), fill: "url(#gHillFar)", opacity: 0.9 }, layers.hills.g);

  // Дерево: ствол + пышная крона из кругов
  function tree(parent, x, baseY, h, pal, opts = {}) {
    const g = el("g", {}, parent);
    const w = h * 0.06 + 6;
    el("path", {
      d: `M${x - w * 1.6},${baseY} Q${x - w * 0.6},${baseY - h * 0.3} ${x - w * 0.55},${baseY - h * 0.85}
          L${x + w * 0.55},${baseY - h * 0.85} Q${x + w * 0.6},${baseY - h * 0.3} ${x + w * 1.6},${baseY} Z`,
      fill: pal.trunk,
    }, g);
    // ветки
    el("path", {
      d: `M${x},${baseY - h * 0.55} Q${x + h * 0.12},${baseY - h * 0.65} ${x + h * 0.2},${baseY - h * 0.78}`,
      stroke: pal.trunk, "stroke-width": w * 0.5, fill: "none", "stroke-linecap": "round",
    }, g);
    el("path", {
      d: `M${x},${baseY - h * 0.62} Q${x - h * 0.1},${baseY - h * 0.7} ${x - h * 0.18},${baseY - h * 0.84}`,
      stroke: pal.trunk, "stroke-width": w * 0.45, fill: "none", "stroke-linecap": "round",
    }, g);
    const cy = baseY - h * 0.85;
    const r = h * 0.26;
    const blobs = [[0, -0.5, 1], [-0.75, 0, 0.8], [0.75, 0, 0.85], [-0.35, 0.35, 0.75], [0.4, 0.35, 0.75], [0, -1.15, 0.7]];
    for (const [bx, by, br] of blobs) {
      el("circle", { cx: x + bx * r, cy: cy + by * r, r: br * r, fill: pal.leaf }, g);
    }
    for (const [bx, by, br] of blobs.slice(0, 4)) {
      el("circle", { cx: x + bx * r - r * 0.15, cy: cy + by * r - r * 0.2, r: br * r * 0.55, fill: pal.light, opacity: 0.55 }, g);
    }
    // волшебные огоньки-ягодки на кроне
    if (opts.berries) {
      for (let i = 0; i < 5; i++) {
        el("circle", {
          cx: x + rand(-1.1, 1.1) * r, cy: cy + rand(-1.3, 0.5) * r, r: rand(3, 6),
          fill: opts.berries, class: "twinkle", "data-ph": rand(0, 6.28).toFixed(2),
        }, g);
      }
    }
    return g;
  }

  // Дальние деревья (сиреневые силуэты)
  {
    const g = layers.far.g;
    const pal = { trunk: "#4a3d7d", leaf: "#6a5aa8", light: "#8f80cc" };
    for (let x = -60; x < span(0.28); x += rand(90, 150)) {
      tree(g, x, rand(760, 790), rand(260, 380), pal);
    }
  }
  // Средние деревья
  {
    const g = layers.mid.g;
    el("path", { d: hillPath(span(0.6), 820, 25, 200, 3), fill: "url(#gHillMid)" }, g);
    const pals = [
      { trunk: "#5b3a2e", leaf: "#2f7a55", light: "#58b277" },
      { trunk: "#61402f", leaf: "#357f4f", light: "#7fcf7a" },
      { trunk: "#5a3b33", leaf: "#c4683c", light: "#f2a65a" }, // осеннее
      { trunk: "#5a3b33", leaf: "#d49a3a", light: "#ffd36b" }, // золотое
    ];
    for (let x = 0; x < span(0.6); x += rand(170, 260)) {
      const pal = pals[Math.floor(rand(0, pals.length))];
      tree(g, x, rand(835, 850), rand(380, 520), pal, { berries: R() < 0.5 ? "#fff7a8" : null });
    }
  }

  // Земля, тропинка, цветы, грибы
  const mushrooms = [];
  const grass = [];
  {
    const g = layers.ground.g;
    const w = span(1);
    el("path", {
      d: `M-100,1000 L-100,${GROUND_Y - 30} ` +
        Array.from({ length: Math.ceil(w / 200) + 2 }, (_, i) => {
          const x = -100 + i * 200;
          return `Q${x + 100},${GROUND_Y - 45 + (i % 2) * 20} ${x + 200},${GROUND_Y - 30}`;
        }).join(" ") + ` L${w + 300},1000 Z`,
      fill: "url(#gGround)",
    }, g);
    // тропинка
    el("path", {
      d: `M-100,${GROUND_Y + 14} L${w + 300},${GROUND_Y + 14} L${w + 300},${GROUND_Y - 8} L-100,${GROUND_Y - 8} Z`,
      fill: "#8a6a4a", opacity: 0.35,
    }, g);
    for (let x = -60; x < w; x += rand(20, 46)) {
      el("ellipse", { cx: x, cy: GROUND_Y + rand(-4, 10), rx: rand(4, 9), ry: rand(2, 4), fill: "#a98b68", opacity: 0.5 }, g);
    }
    // травинки
    for (let x = -80; x < w; x += rand(10, 22)) {
      const h = rand(16, 34);
      const y = GROUND_Y - rand(14, 26);
      const p = el("path", {
        d: `M${x - 3},${y} Q${x},${y - h} ${x + 2},${y - h} Q${x + 1},${y - h * 0.4} ${x + 3},${y} Z`,
        fill: R() < 0.5 ? "#5fb36a" : "#3e8f55",
      }, g);
      grass.push({ n: p, x, y, ph: rand(0, 6.28) });
    }
    // цветы
    const colors = ["#ff8fb1", "#ffd36b", "#b48cff", "#8ff3ff", "#ffffff"];
    for (let x = 40; x < w; x += rand(90, 200)) {
      const y = GROUND_Y - rand(18, 34);
      const c = colors[Math.floor(rand(0, colors.length))];
      el("path", { d: `M${x},${y + 22} Q${x - 4},${y + 10} ${x},${y}`, stroke: "#3e8f55", "stroke-width": 3, fill: "none" }, g);
      for (let a = 0; a < 5; a++) {
        const ang = (a / 5) * Math.PI * 2;
        el("circle", { cx: x + Math.cos(ang) * 6, cy: y + Math.sin(ang) * 6, r: 5, fill: c }, g);
      }
      el("circle", { cx: x, cy: y, r: 3.5, fill: "#ffb347" }, g);
    }
    // светящиеся грибочки
    for (let x = 300; x < w; x += rand(260, 420)) {
      const y = GROUND_Y - 20;
      const s = rand(0.8, 1.3);
      const mg = el("g", { transform: `translate(${x},${y}) scale(${s.toFixed(2)})` }, g);
      const glow = el("circle", { cx: 0, cy: -22, r: 60, fill: "url(#gMushGlow)" }, mg);
      el("path", { d: "M-7,0 Q-5,-18 -4,-22 L4,-22 Q5,-18 7,0 Z", fill: "#f2efe2" }, mg);
      el("path", { d: "M-26,-20 Q-24,-46 0,-48 Q24,-46 26,-20 Q0,-14 -26,-20 Z", fill: "#4fc9e8" }, mg);
      el("circle", { cx: -10, cy: -34, r: 4, fill: "#e8fdff" }, mg);
      el("circle", { cx: 8, cy: -38, r: 3, fill: "#e8fdff" }, mg);
      el("circle", { cx: 16, cy: -26, r: 2.5, fill: "#e8fdff" }, mg);
      mushrooms.push({ glow, ph: rand(0, 6.28) });
    }
  }

  // Передний план: тёмные стволы и папоротники (самый быстрый параллакс)
  const ferns = [];
  {
    const g = layers.front.g;
    const w = span(1.45);
    // не ставим стволы туда, где они закроют котёнка во время остановок
    const keepClear = [cameraX(0), cameraX(10), cameraX(DURATION)];
    const blocks = (x) => keepClear.some((c, i) => {
      const sx = x - c * 1.45;
      return sx > (i === 0 ? -400 : 300) && sx < 980;
    });
    for (let x = 200; x < w; x += rand(500, 900)) {
      if (blocks(x)) continue;
      const tw = rand(60, 90);
      el("path", {
        d: `M${x - tw},1020 Q${x - tw * 0.6},600 ${x - tw * 0.4},-40 L${x + tw * 0.4},-40 Q${x + tw * 0.6},600 ${x + tw},1020 Z`,
        fill: "#1d1424",
      }, g);
      el("path", {
        d: `M${x - tw * 0.2},200 Q${x - tw * 0.1},500 ${x - tw * 0.25},900`,
        stroke: "#2e2236", "stroke-width": 8, fill: "none",
      }, g);
    }
    for (let x = -100; x < w; x += rand(160, 280)) {
      const fg = el("g", {}, g);
      const n = 5;
      for (let i = 0; i < n; i++) {
        const ang = -150 + (i * 120) / (n - 1);
        const len = rand(110, 170);
        const rad = (ang * Math.PI) / 180;
        const ex = x + Math.cos(rad) * len;
        const ey = 1010 + Math.sin(rad) * len;
        el("path", {
          d: `M${x},1010 Q${(x + ex) / 2 + 20},${(1010 + ey) / 2 - 30} ${ex},${ey}`,
          stroke: "#12301f", "stroke-width": 18, fill: "none", "stroke-linecap": "round",
        }, fg);
      }
      ferns.push({ n: fg, x, ph: rand(0, 6.28) });
    }
  }

  // Светлячки
  const flies = [];
  for (let i = 0; i < 26; i++) {
    const g = el("g", {}, $("fireflies"));
    el("circle", { cx: 0, cy: 0, r: 16, fill: "url(#gGlow)" }, g);
    el("circle", { cx: 0, cy: 0, r: 2.6, fill: "#fffde0" }, g);
    flies.push({
      n: g, x: rand(0, 1700), y: rand(380, 900), ax: rand(30, 90), ay: rand(20, 60),
      fx: rand(0.15, 0.4), fy: rand(0.2, 0.5), ph: rand(0, 6.28), k: rand(0.4, 1.1),
    });
  }

  // Падающие листья
  const leafColors = ["#ff8a3d", "#ffb347", "#e8553f", "#ffd36b", "#d9772b", "#9ccf5a"];
  const leaves = [];
  for (let i = 0; i < 38; i++) {
    const size = rand(22, 44);
    const u = el("use", {
      href: "#leaf", width: size, height: size, x: -size / 2, y: -size / 2,
      fill: leafColors[Math.floor(rand(0, leafColors.length))],
    }, $("leaves"));
    leaves.push({
      n: u, x0: rand(0, 1800), y0: rand(-200, 1000), vy: rand(45, 95),
      amp: rand(25, 70), f: rand(0.4, 1.1), rot: rand(-140, 140), flip: rand(1.5, 4),
      ph: rand(0, 6.28), k: rand(0.3, 0.9),
    });
  }

  // ==========================================================
  //                     ССЫЛКИ НА ЧАСТИ КОТА
  // ==========================================================
  const K = {
    root: $("kitten"), body: $("kBody"), tail: $("kTail"), head: $("kHead"),
    legFN: $("legFN"), legFF: $("legFF"), legBN: $("legBN"), legBF: $("legBF"),
    earF: $("earFront"), earB: $("earBack"), eyeF: $("eyeFront"), eyeB: $("eyeBack"),
    pupils: document.querySelectorAll("#kHead .pupil, #kHead .shine"),
    mouthOpen: $("mouthOpen"), mouthClosed: $("mouthClosed"), shadow: $("kShadow"),
    bubble: $("bubble"), whiskers: $("whiskers"),
  };
  const HIPS = { legFN: [58, -62], legFF: [44, -64], legBN: [-40, -62], legBF: [-52, -64] };
  const HEAD_POS = [92, -128];
  const BF = { root: $("butterfly"), wings: $("bfWings") };

  // Моменты моргания (сек)
  const BLINKS = [1.8, 4.4, 6.9, 9.2, 9.5, 11.6, 14.1, 16.2, 18.0, 19.3];
  const BLINK_LEN = 0.2;
  function eyeOpen(t) {
    let s = 1;
    for (const b of BLINKS) {
      if (t >= b && t <= b + BLINK_LEN) {
        s = Math.min(s, 1 - 0.92 * Math.sin((Math.PI * (t - b)) / BLINK_LEN));
      }
    }
    return s;
  }

  // Положение бабочки (в экранных координатах)
  function butterflyPos(t, headX, headY) {
    const orbitX = headX + 70 + Math.cos(t * 1.9) * 85;
    const orbitY = headY - 110 + Math.sin(t * 3.1) * 35;
    if (t < 9) {
      const e = smooth(6.4, 9, t);
      return [lerp(1750, orbitX, e) + Math.sin(t * 3) * 30 * (1 - e), lerp(150, orbitY, e) + Math.sin(t * 5) * 40 * (1 - e)];
    }
    if (t < 12.4) return [orbitX, orbitY];
    const e = smooth(12.4, 14.6, t);
    return [lerp(orbitX, 1800, e), lerp(orbitY, -120, e) + Math.sin(t * 6) * 20];
  }

  // ==========================================================
  //                        КАДР
  // ==========================================================
  function render(t, ambient) {
    // t — время сюжета [0..20], ambient — время «жизни» леса (идёт всегда)
    const cam = cameraX(t);

    // параллакс
    for (const key in layers) {
      const L = layers[key];
      L.g.setAttribute("transform", `translate(${(-cam * L.k).toFixed(2)},0)`);
    }

    // небо и свет
    for (const s of stars) s.n.setAttribute("opacity", (0.35 + 0.65 * Math.abs(Math.sin(ambient * s.sp + s.ph))).toFixed(2));
    for (const r of rays) r.n.setAttribute("opacity", (0.22 + 0.18 * Math.sin(ambient * 0.8 + r.ph)).toFixed(2));
    $("sun").setAttribute("r", (330 + Math.sin(ambient * 0.7) * 12).toFixed(1));

    for (const m of mushrooms) m.glow.setAttribute("opacity", (0.55 + 0.45 * Math.sin(ambient * 2 + m.ph)).toFixed(2));
    for (const gr of grass) {
      const a = Math.sin(ambient * 2.2 + gr.ph + gr.x * 0.01) * 6;
      gr.n.setAttribute("transform", `rotate(${a.toFixed(1)} ${gr.x} ${gr.y})`);
    }
    for (const f of ferns) {
      f.n.setAttribute("transform", `rotate(${(Math.sin(ambient * 1.2 + f.ph) * 2.5).toFixed(2)} ${f.x} 1010)`);
    }
    document.querySelectorAll(".twinkle").forEach((b) => {
      b.setAttribute("opacity", (0.5 + 0.5 * Math.sin(ambient * 3 + +b.dataset.ph)).toFixed(2));
    });

    // светлячки
    for (const f of flies) {
      let x = f.x + Math.sin(ambient * f.fx + f.ph) * f.ax - cam * f.k * 0.5;
      x = ((x % 1800) + 1800) % 1800 - 100;
      const y = f.y + Math.sin(ambient * f.fy + f.ph * 2) * f.ay;
      f.n.setAttribute("transform", `translate(${x.toFixed(1)},${y.toFixed(1)})`);
      f.n.setAttribute("opacity", (0.3 + 0.7 * Math.abs(Math.sin(ambient * 1.7 + f.ph))).toFixed(2));
    }

    // листья
    for (const l of leaves) {
      let y = l.y0 + ambient * l.vy;
      y = ((y + 200) % 1300 + 1300) % 1300 - 200;
      let x = l.x0 + Math.sin(ambient * l.f + l.ph) * l.amp - cam * l.k + ambient * 12;
      x = ((x % 1900) + 1900) % 1900 - 150;
      const rot = ambient * l.rot + l.ph * 57;
      const sx = Math.cos(ambient * l.flip + l.ph);
      l.n.setAttribute("transform", `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${rot.toFixed(1)}) scale(${sx.toFixed(2)},1)`);
    }

    // ---------- котёнок ----------
    const w = walkWeight(t);
    const dist = distAt(t);
    const phase = (dist / STRIDE) * Math.PI * 2;
    const kx = kittenWorldX(t) - cam;
    const stand = 1 - w;
    const endPose = smooth(17.2, 18, t);

    const bob = -Math.abs(Math.sin(phase)) * 6 * w + Math.sin(ambient * 2.4) * 1.5 * stand;
    const tilt = Math.sin(phase * 2) * 1.2 * w;
    K.root.setAttribute("transform", `translate(${kx.toFixed(1)},${GROUND_Y})`);
    K.body.setAttribute("transform", `translate(0,${bob.toFixed(2)}) rotate(${tilt.toFixed(2)})`);
    K.shadow.setAttribute("rx", (100 - Math.abs(Math.sin(phase)) * 6 * w).toFixed(1));

    // лапы: диагональные пары двигаются вместе
    const A = 26 * w;
    const legs = [
      ["legFN", 0], ["legBF", 0], ["legFF", Math.PI], ["legBN", Math.PI],
    ];
    for (const [name, off] of legs) {
      const p = phase + off;
      const ang = -Math.sin(p) * A;
      const lift = Math.max(0, Math.cos(p)) * 9 * w;
      const [hx, hy] = HIPS[name];
      K[name].setAttribute("transform", `translate(${hx},${(hy - bob - lift).toFixed(2)}) rotate(${ang.toFixed(2)})`);
    }

    // хвост
    const tailA = Math.sin(ambient * (w > 0.5 ? 4 : 2.2)) * (w > 0.5 ? 8 : 14) + endPose * Math.sin(ambient * 5) * 6;
    K.tail.setAttribute("transform", `rotate(${tailA.toFixed(2)} -60 -92)`);

    // бабочка и взгляд
    const headScreenX = kx + HEAD_POS[0];
    const headScreenY = GROUND_Y + HEAD_POS[1] + bob;
    let lookX = 1, lookY = 0, headA = Math.sin(phase) * 2 * w;
    const bfVis = win(t, 6.3, 7, 13.8, 14.6);
    if (bfVis > 0) {
      const [bx, by] = butterflyPos(t, headScreenX, headScreenY);
      const flap = 0.25 + 0.75 * Math.abs(Math.sin(ambient * 16));
      BF.root.setAttribute("opacity", bfVis.toFixed(2));
      BF.root.setAttribute("transform", `translate(${bx.toFixed(1)},${by.toFixed(1)}) rotate(${(Math.sin(ambient * 2) * 15).toFixed(1)})`);
      BF.wings.setAttribute("transform", `scale(${flap.toFixed(2)},1)`);
      const dx = bx - headScreenX, dy = by - headScreenY;
      const len = Math.hypot(dx, dy) || 1;
      lookX = dx / len; lookY = dy / len;
      const focus = win(t, 7.4, 8.4, 12.6, 13.6);
      const target = clamp((Math.atan2(dy, Math.abs(dx)) * 180) / Math.PI * 0.45, -28, 10) * (dx < 0 ? 0.6 : 1);
      headA = lerp(headA, target, focus);
    } else {
      BF.root.setAttribute("opacity", 0);
    }
    // в конце — милый наклон головы
    headA = lerp(headA, -10 + Math.sin(ambient * 1.5) * 3, endPose);
    K.head.setAttribute("transform", `translate(${HEAD_POS[0]},${HEAD_POS[1]}) rotate(${headA.toFixed(2)} -20 30)`);

    // зрачки следят
    const px = clamp(lookX * 3, -3, 3), py = clamp(lookY * 3, -3, 3);
    K.pupils.forEach((p) => p.setAttribute("transform", `translate(${px.toFixed(2)},${py.toFixed(2)})`));

    // моргание
    const s = eyeOpen(t).toFixed(3);
    K.eyeF.setAttribute("transform", `translate(32,-4) scale(1,${s}) translate(-32,4)`);
    K.eyeB.setAttribute("transform", `translate(-4,-4) scale(1,${s}) translate(4,4)`);

    // уши подёргиваются
    const twitch = (Math.max(0, Math.sin(ambient * 1.3)) ** 12) * 12;
    K.earF.setAttribute("transform", `rotate(${(twitch).toFixed(2)} 30 -40)`);
    K.earB.setAttribute("transform", `rotate(${(-twitch * 0.6 + Math.sin(phase) * 2 * w).toFixed(2)} -25 -40)`);
    K.whiskers.setAttribute("transform", `rotate(${(Math.sin(ambient * 3) * 1.5).toFixed(2)} 30 22)`);

    // «Мяу!»
    const meow = win(t, 17.9, 18.2, 19.3, 19.7);
    K.mouthOpen.setAttribute("opacity", meow.toFixed(2));
    K.mouthClosed.setAttribute("opacity", (1 - meow).toFixed(2));
    K.bubble.setAttribute("opacity", meow.toFixed(2));
    K.bubble.setAttribute("transform", `translate(0,${((1 - meow) * 20).toFixed(1)}) scale(${(0.85 + 0.15 * meow).toFixed(3)})`);

    // титры и затемнение
    $("fade").setAttribute("opacity", (1 - smooth(0, 1.2, t)).toFixed(3));
    $("title").setAttribute("opacity", win(t, 0.6, 1.4, 3.4, 4.4).toFixed(3));
    $("title").setAttribute("transform", `translate(0,${(-smooth(0.6, 4.4, t) * 30).toFixed(1)})`);
    $("theEnd").setAttribute("opacity", smooth(18.8, 19.8, t).toFixed(3));
  }

  // ==========================================================
  //                 ПЛЕЕР: старт, пауза, повтор
  // ==========================================================
  const ui = {
    play: $("btnPlay"), replay: $("btnReplay"), full: $("btnFull"),
    fill: $("progressFill"), bar: $("progress"), time: $("time"),
    end: $("endOverlay"), replayBig: $("replayBig"), controls: $("controls"),
    sound: $("btnSound"), hint: $("soundHint"),
  };
  const music = window.KittenMusic;

  let storyT = 0;        // время сюжета
  let ambientT = 0;      // время для «живого» фона
  let playing = true;
  let last = null;
  let finished = false;
  let soundOn = false;     // музыка включена
  let userMuted = false;   // пользователь сам выключил звук

  const fmt = (s) => `0:${String(Math.floor(s)).padStart(2, "0")}`;

  function frame(now) {
    if (last === null) last = now;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (playing) {
      ambientT += dt;
      if (!finished) {
        // со звуком время берём из аудиочасов — картинка и музыка идут точно вместе
        if (soundOn && music.isRunning()) storyT = Math.max(storyT, music.storyNow());
        else storyT += dt;
        if (storyT >= DURATION) {
          storyT = DURATION;
          finished = true;
          ui.end.classList.remove("hidden");
          showControls();
        }
      }
    }
    render(storyT, ambientT);
    ui.fill.style.width = `${(storyT / DURATION) * 100}%`;
    ui.time.textContent = `${fmt(storyT)} / ${fmt(DURATION)}`;
    requestAnimationFrame(frame);
  }

  function setPlaying(v) {
    playing = v;
    ui.play.textContent = v ? "❚❚" : "▶";
    ui.play.setAttribute("aria-label", v ? "Пауза" : "Играть");
    if (soundOn) { if (v) music.resume(); else music.pause(); }
    showControls();
  }

  // ---------- Звук ----------
  function updateSoundUI() {
    ui.sound.textContent = soundOn ? "🔊" : "🔇";
    ui.sound.setAttribute("aria-label", soundOn ? "Выключить музыку" : "Включить музыку");
    ui.hint.classList.toggle("hidden", soundOn || userMuted);
  }
  function enableSound() {
    if (!music) return;
    music.unlock().then((ok) => {
      if (!ok || soundOn) return;
      soundOn = true;
      userMuted = false;
      if (!finished) music.startFrom(storyT); else music.stop();
      if (!playing) music.pause();
      updateSoundUI();
    });
  }
  function disableSound() {
    soundOn = false;
    userMuted = true;
    if (music) { music.stop(); music.pause(); }
    updateSoundUI();
  }
  ui.sound.addEventListener("click", (e) => {
    e.stopPropagation();
    if (soundOn) disableSound(); else enableSound();
  });
  // Браузеры разрешают звук только после касания — включаем музыку при первом же тапе
  let consumeTap = false;
  function firstGesture(e) {
    if (soundOn || userMuted) return;
    const onButton = e.target && e.target.closest && e.target.closest("button, #controls");
    if (!onButton) consumeTap = true;   // первый тап по сцене — только включает звук
    enableSound();
  }
  document.addEventListener("click", firstGesture, true);
  document.addEventListener("keydown", (e) => { if (e.code !== "Space") firstGesture(e); }, true);

  function replay() {
    storyT = 0;
    ambientT = 0;
    finished = false;
    ui.end.classList.add("hidden");
    if (soundOn) music.startFrom(0);
    setPlaying(true);
  }

  ui.play.addEventListener("click", (e) => {
    e.stopPropagation();
    if (finished) replay(); else setPlaying(!playing);
  });
  ui.replay.addEventListener("click", (e) => { e.stopPropagation(); replay(); });
  ui.replayBig.addEventListener("click", (e) => { e.stopPropagation(); replay(); });

  ui.bar.addEventListener("click", (e) => {
    e.stopPropagation();
    const r = ui.bar.getBoundingClientRect();
    storyT = clamp((e.clientX - r.left) / r.width, 0, 1) * DURATION;
    finished = storyT >= DURATION;
    ui.end.classList.toggle("hidden", !finished);
    if (soundOn) {
      if (finished) music.stop(); else music.startFrom(storyT);
      if (!playing) music.pause();
    }
  });

  // Полноэкранный режим — на планшете смотрится лучше всего
  ui.full.addEventListener("click", async (e) => {
    e.stopPropagation();
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen({ navigationUI: "hide" });
        if (screen.orientation && screen.orientation.lock) {
          screen.orientation.lock("landscape").catch(() => {});
        }
      } else {
        await document.exitFullscreen();
      }
    } catch (_) { /* браузер не разрешил — ничего страшного */ }
  });

  ui.controls.addEventListener("click", (e) => e.stopPropagation());

  // Перемотка для отладки: index.html?t=9 — начать с 9-й секунды
  const startAt = parseFloat(new URLSearchParams(location.search).get("t"));
  if (startAt > 0) { storyT = Math.min(startAt, DURATION - 0.01); ambientT = storyT; }

  // Тап по сцене — пауза/продолжение
  $("stage").addEventListener("click", () => {
    if (consumeTap) { consumeTap = false; return; }
    if (finished) { showControls(); return; }
    setPlaying(!playing);
  });

  // Клавиатура: пробел — пауза, R — повтор, F — полный экран
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      if (!soundOn && !userMuted) enableSound();
      finished ? replay() : setPlaying(!playing);
    }
    else if (e.key === "m" || e.key === "M" || e.key === "ь" || e.key === "Ь") ui.sound.click();
    else if (e.key === "r" || e.key === "R" || e.key === "к" || e.key === "К") replay();
    else if (e.key === "f" || e.key === "F" || e.key === "а" || e.key === "А") ui.full.click();
  });

  // Панель управления прячется, когда её не трогают
  let hideTimer = null;
  function showControls() {
    ui.controls.classList.remove("idle");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (playing && !finished) ui.controls.classList.add("idle");
    }, 2500);
  }
  ["pointermove", "pointerdown"].forEach((ev) => document.addEventListener(ev, showControls, { passive: true }));

  // Свернули вкладку — ставим на паузу
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && playing && !finished) setPlaying(false);
    last = null;
  });

  // В портретной ориентации показываем сцену целиком
  const svg = $("scene");
  function fitOrientation() {
    const portrait = window.innerHeight > window.innerWidth;
    svg.setAttribute("preserveAspectRatio", portrait ? "xMidYMid meet" : "xMidYMax slice");
  }
  window.addEventListener("resize", fitOrientation);
  fitOrientation();

  // Старт автоматически (после загрузки шрифта, но не дольше 1.5 c ожидания)
  updateSoundUI();
  render(storyT, ambientT);
  const start = () => { showControls(); requestAnimationFrame(frame); };
  if (document.fonts && document.fonts.ready) {
    Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]).then(start);
  } else {
    start();
  }
})();
