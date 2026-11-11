// Lighting simulation. Each effect returns [r, g, b] in 0..1 for one key.
// p = { h: degrees, s: 0..1, sp: speed multiplier }, st = per-preview state, layout = the keyboard being drawn.
export function hsv(h, s, v) {
  // Effects can overshoot a little at their edges; keep the result a real colour.
  s = Math.min(1, Math.max(0, s));
  v = Math.min(1, Math.max(0, v));
  h = (((h % 360) + 360) % 360) / 60;
  const i = Math.floor(h),
    f = h - i,
    p = v * (1 - s),
    q = v * (1 - s * f),
    t = v * (1 - s * (1 - f));
  switch (i) {
    case 0:
      return [v, t, p];
    case 1:
      return [q, v, p];
    case 2:
      return [p, v, t];
    case 3:
      return [p, q, v];
    case 4:
      return [t, p, v];
    default:
      return [v, p, q];
  }
}

export function rgbToHsv(r, g, b) {
  const mx = Math.max(r, g, b),
    mn = Math.min(r, g, b),
    d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, mx ? d / mx : 0, mx];
}

export const toHex = (c) =>
  "#" +
  c
    .map((x) =>
      Math.round(Math.min(1, Math.max(0, x)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");

/* Key presses feed the reactive effects. */
export const HITS = [];

let seq = 0;

export function addHit(layout, i, t) {
  const key = layout.keys[i];
  if (!key) return;
  HITS.push({ id: ++seq, i, x: key.cx, y: key.cy, t });
  while (HITS.length > 60) HITS.shift();
}

export function pruneHits(t) {
  while (HITS.length && t - HITS[0].t > 3.2) HITS.shift();
}

function consume(st, fn) {
  const last = st.last || 0;
  for (const h of HITS) if (h.id > last) fn(h);
  st.last = seq;
}

const RAD_TO_DEG = 180 / Math.PI;

const rnd = (i, s) => {
  const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const ensure = (st, n, mk) => st[n] || (st[n] = mk());

const spawn = (dt, rate, fn) => {
  let n = dt * rate;
  while (n > 0) {
    if (Math.random() < n) fn();
    n -= 1;
  }
};

export const FX = {
  solid: { name: "Solid", color: (k, t, p) => hsv(p.h, p.s, 1) },
  breathe: {
    name: "Breathing",
    color: (k, t, p) =>
      hsv(p.h, p.s, 0.06 + 0.94 * Math.pow(0.5 - 0.5 * Math.cos(t * p.sp * 1.5), 1.7)),
  },
  wave: { name: "Rainbow wave", color: (k, t, p) => hsv(p.h + k.nx * 360 - t * 80 * p.sp, p.s, 1) },
  chevron: {
    name: "Chevron",
    color: (k, t, p) =>
      hsv(p.h + (k.nx + Math.abs(k.ny - 0.5) * 0.75) * 320 - t * 90 * p.sp, p.s, 1),
  },
  spiral: {
    name: "Spiral",
    color: (k, t, p) => hsv(p.h + k.ang * RAD_TO_DEG + k.dist * 55 - t * 110 * p.sp, p.s, 1),
  },
  pinwheel: {
    name: "Pinwheel",
    color: (k, t, p) => hsv(p.h + k.ang * RAD_TO_DEG * 2 - t * 120 * p.sp, p.s, 1),
  },
  ripple: { name: "Ripple", color: (k, t, p) => hsv(p.h + k.dist * 48 + t * 110 * p.sp, p.s, 1) },
  cycle: { name: "Colour cycle", color: (k, t, p) => hsv(p.h + t * 45 * p.sp, p.s, 1) },
  gradient: {
    name: "Gradient",
    color: (k, t, p) => hsv(p.h + k.ny * 95 + k.nx * 25 + Math.sin(t * 0.7 * p.sp) * 12, p.s, 1),
  },
  aurora: {
    name: "Aurora",
    color: (k, t, p) => {
      const w =
        Math.sin(k.nx * 7 - t * 1.5 * p.sp) + 0.6 * Math.sin(k.ny * 4 + k.nx * 3 + t * 1.1 * p.sp);
      return hsv(
        p.h + w * 30,
        p.s,
        0.35 + 0.65 * (0.5 + 0.5 * Math.sin(k.nx * 5.5 + t * p.sp * 1.3 + k.ny * 2.5)),
      );
    },
  },
  pendulum: {
    name: "Pendulum",
    color: (k, t, p) => hsv(p.h + Math.sin(t * 1.4 * p.sp) * (k.nx * 2 - 1) * 80, p.s, 1),
  },
  beacon: {
    name: "Lighthouse",
    color: (k, t, p) => {
      const c = Math.cos(k.ang - t * 1.7 * p.sp);
      return hsv(
        p.h + (c > 0 ? 0 : 28),
        p.s * (1 - 0.35 * Math.pow(Math.abs(c), 8)),
        0.1 + 0.9 * Math.pow(Math.abs(c), 4),
      );
    },
  },
  raindrops: {
    name: "Raindrops",
    step(st, t, dt, p, layout) {
      const N = layout.keys.length,
        v = ensure(st, "v", () => new Float32Array(N)),
        hu = ensure(st, "hu", () => new Float32Array(N));
      const f = Math.exp(-dt * 1.2 * p.sp);
      for (let i = 0; i < N; i++) v[i] *= f;
      spawn(dt, 0.16 * N * p.sp, () => {
        const i = (Math.random() * N) | 0;
        v[i] = 1;
        hu[i] = p.h + (Math.random() * 2 - 1) * 45;
      });
    },
    color(k, t, p, st) {
      const v = st.v[k.i],
        b = hsv(p.h, p.s, 0.13),
        c = hsv(st.hu[k.i], p.s, v);
      return [Math.max(b[0], c[0]), Math.max(b[1], c[1]), Math.max(b[2], c[2])];
    },
  },
  jelly: {
    name: "Jellybean",
    step(st, t, dt, p, layout) {
      const N = layout.keys.length,
        v = ensure(st, "v", () => new Float32Array(N)),
        hu = ensure(st, "hu", () => new Float32Array(N)),
        sa = ensure(st, "sa", () => new Float32Array(N));
      const f = Math.exp(-dt * 0.9 * p.sp);
      for (let i = 0; i < N; i++) v[i] *= f;
      spawn(dt, 0.2 * N * p.sp, () => {
        const i = (Math.random() * N) | 0;
        v[i] = 1;
        hu[i] = Math.random() * 360;
        sa[i] = 0.55 + Math.random() * 0.45;
      });
    },
    color: (k, t, p, st) => hsv(st.hu[k.i], st.sa[k.i] * p.s, 0.03 + 0.97 * st.v[k.i]),
  },
  matrix: {
    name: "Digital rain",
    step(st, t, dt, p, layout) {
      const n = Math.ceil(layout.W) + 1;
      const cols = ensure(st, "cols", () =>
        Array.from({ length: n * 2 }, () => ({
          y: -Math.random() * 12,
          v: 2 + Math.random() * 3.5,
        })),
      );
      for (const c of cols) {
        c.y += c.v * dt * p.sp;
        if (c.y > layout.H + 5) {
          c.y = -Math.random() * 5;
          c.v = 2 + Math.random() * 3.5;
        }
      }
      st.n = n;
    },
    color(k, t, p, st) {
      const ci = Math.min(st.n - 1, Math.floor(k.cx));
      let best = 0,
        head = false;
      for (const c of [st.cols[ci], st.cols[ci + st.n]]) {
        const d = c.y - k.cy;
        if (d < -0.5 || d > 4.2) continue;
        if (d < 0.5) {
          head = true;
          best = 1;
        } else best = Math.max(best, Math.pow(1 - (d - 0.5) / 3.7, 1.6));
      }
      return head ? hsv(p.h, p.s * 0.2, 1) : hsv(p.h, p.s, 0.035 + 0.965 * best);
    },
  },
  pixel: {
    name: "Pixel storm",
    step(st, t, dt, p, layout) {
      const N = layout.keys.length,
        hu = ensure(st, "hu", () => Float32Array.from({ length: N }, () => Math.random() * 360)),
        on = ensure(st, "on", () =>
          Float32Array.from({ length: N }, () => (Math.random() < 0.5 ? 1 : 0)),
        ),
        cv = ensure(st, "cv", () => new Float32Array(N));
      spawn(dt, 0.25 * N * p.sp, () => {
        const i = (Math.random() * N) | 0;
        hu[i] = Math.random() * 360;
        on[i] = Math.random() < 0.7 ? 1 : 0;
      });
      const kb = Math.min(1, dt * 7);
      for (let i = 0; i < N; i++) cv[i] += (on[i] - cv[i]) * kb;
    },
    color: (k, t, p, st) => hsv(st.hu[k.i], p.s, 0.02 + 0.98 * st.cv[k.i]),
  },
  heat: {
    name: "Typing heatmap",
    step(st, t, dt, p, layout) {
      const N = layout.keys.length,
        h = ensure(st, "h", () => new Float32Array(N));
      consume(st, (hit) => {
        for (const k of layout.keys) {
          const d = Math.hypot(k.cx - hit.x, k.cy - hit.y);
          if (d < 0.1) h[k.i] += 0.3;
          else if (d < 1.7) h[k.i] += 0.09 * (1.7 - d);
        }
      });
      const dec = dt * 0.07 * p.sp;
      for (let i = 0; i < N; i++) h[i] = Math.min(1, Math.max(0, h[i] - dec));
    },
    color(k, t, p, st) {
      const x = st.h[k.i];
      return x < 0.01
        ? hsv(230, 1, 0.05)
        : hsv(230 - 230 * x, 1, 0.25 + 0.75 * Math.min(1, x * 1.5));
    },
  },
  reactive: {
    name: "Reactive glow",
    color(k, t, p) {
      let m = 0;
      for (const h of HITS) {
        const kb = t - h.t;
        if (kb < 0 || kb > 3) continue;
        const d = Math.hypot(k.cx - h.x, k.cy - h.y),
          r = 0.6 + kb * 2.4 * p.sp;
        if (d > r) continue;
        m = Math.max(m, Math.exp(-kb * 1.4 * p.sp) * (1 - d / r));
      }
      return hsv(p.h + (1 - m) * 35, p.s, 0.05 + 0.95 * m);
    },
  },
  splash: {
    name: "Multi splash",
    color(k, t, p) {
      let r = 0,
        g = 0,
        b = 0;
      for (const h of HITS) {
        const kb = t - h.t;
        if (kb < 0 || kb > 2.6) continue;
        const rad = kb * 6.5 * p.sp,
          d = Math.hypot(k.cx - h.x, k.cy - h.y),
          ring = Math.max(0, 1 - Math.abs(d - rad) / 1.15) * (1 - kb / 2.6);
        if (ring > 0) {
          const c = hsv(p.h + kb * 160 + d * 12, p.s, ring);
          r += c[0];
          g += c[1];
          b += c[2];
        }
      }
      return [Math.min(1, r + 0.025), Math.min(1, g + 0.025), Math.min(1, b + 0.025)];
    },
  },
  starlight: {
    name: "Starlight",
    color(k, t, p) {
      const r1 = rnd(k.i, 1),
        r2 = rnd(k.i, 2),
        tw = Math.pow(Math.max(0, Math.sin(t * p.sp * (0.6 + r1 * 1.4) + r2 * 40)), 14);
      const b = hsv(p.h, p.s, 0.1),
        c = hsv(p.h, p.s * 0.35, tw);
      return [Math.max(b[0], c[0]), Math.max(b[1], c[1]), Math.max(b[2], c[2])];
    },
  },
  glitter: {
    name: "Glitter",
    color(k, t, p) {
      const r1 = rnd(k.i, 3),
        r2 = rnd(k.i, 4),
        tw = Math.pow(Math.max(0, Math.sin(t * p.sp * (1.5 + r1 * 3) + r2 * 50)), 20);
      return tw > 0.05
        ? hsv(p.h + (r2 - 0.5) * 50, p.s * (1 - tw * 0.7), 0.35 + 0.65 * tw)
        : hsv(p.h + (r1 - 0.5) * 30, p.s, 0.3);
    },
  },
  fire: {
    name: "Fire",
    color(k, t, p) {
      const f =
        0.5 +
        0.5 * Math.sin(t * p.sp * 6 + k.i * 1.7) * Math.sin(t * p.sp * 4.3 + k.i * 0.9 + k.cx);
      const v = Math.min(1, Math.max(0, k.ny * 1.25 - 0.25 + f * 0.4));
      return hsv(p.h + 42 * v, p.s * (1 - 0.35 * Math.pow(v, 5)), 0.04 + 0.96 * v);
    },
  },
  ocean: {
    name: "Tide",
    color(k, t, p) {
      const w =
        Math.sin(k.nx * 6 - t * p.sp * 1.2 + Math.sin(k.ny * 3 + t * 0.7)) * 0.35 +
        Math.sin(k.ny * 8 + t * p.sp) * 0.2;
      return hsv(p.h + 25 * Math.sin(k.nx * 3 + t * 0.5 * p.sp), p.s, 0.45 + w);
    },
  },
  snake: {
    name: "Snake",
    step(st, t, dt, p, layout) {
      if (!st.order) {
        const ks = [...layout.keys].sort((a, b) => a.row - b.row || a.x - b.x),
          rows = {};
        ks.forEach((k) => (rows[k.row] ||= []).push(k));
        const seq = [];
        Object.keys(rows)
          .sort((a, b) => a - b)
          .forEach((r, j) => seq.push(...(j % 2 ? rows[r].reverse() : rows[r])));
        st.order = new Float32Array(layout.keys.length);
        seq.forEach((k, j) => (st.order[k.i] = j));
      }
    },
    color(k, t, p, st, layout) {
      const n = layout.keys.length,
        d = (((t * p.sp * 14) % n) - st.order[k.i] + n) % n;
      return d < 12 ? hsv(p.h + d * 4, p.s, 1 - d / 12) : hsv(p.h, p.s, 0.04);
    },
  },
  scanner: {
    name: "Scanner",
    color(k, t, p, st, layout) {
      const c = (Math.sin(t * p.sp * 1.6) * 0.5 + 0.5) * layout.W,
        v = Math.max(0.04, Math.pow(Math.max(0, 1 - Math.abs(k.cx - c) / 2.4), 2));
      return hsv(p.h, p.s, v);
    },
  },
  comet: {
    name: "Comet",
    color(k, t, p) {
      const s = k.nx * 0.8 + k.ny * 0.4,
        head = ((t * p.sp * 0.35) % 1) * 1.7 - 0.25,
        d = head - s;
      return d >= 0 && d < 0.35
        ? hsv(p.h + d * 60, p.s * (0.4 + d * 1.7), 1 - d / 0.35)
        : hsv(p.h, p.s, 0.03);
    },
  },
  radar: {
    name: "Radar",
    color(k, t, p) {
      const kb = (t * p.sp * 1.8) % (Math.PI * 2),
        diff = (((kb - (k.ang + Math.PI)) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      return hsv(p.h, p.s, 0.04 + 0.96 * Math.exp(-diff * 1.5));
    },
  },
  plasma: {
    name: "Plasma",
    color(k, t, p) {
      const v =
        Math.sin(k.nx * 10 + t * p.sp) +
        Math.sin(k.ny * 8 + t * p.sp * 1.3) +
        Math.sin((k.nx + k.ny) * 7 + t * p.sp * 0.7);
      return hsv(p.h + v * 22, p.s, 0.55 + 0.45 * Math.sin(v));
    },
  },
  heartbeat: {
    name: "Heartbeat",
    color(k, t, p) {
      const ph = ((t * p.sp * 0.9) % 1.4) - k.dist * 0.015,
        b = Math.exp(-(ph * ph) / 0.002) + 0.6 * Math.exp(-((ph - 0.22) ** 2) / 0.002);
      return hsv(p.h, p.s, 0.08 + 0.92 * Math.min(1, b));
    },
  },
  sunrise: {
    name: "Sunrise",
    color(k, t, p) {
      return hsv(
        p.h + (1 - k.ny) * 32,
        p.s * (0.7 + 0.3 * k.ny),
        Math.min(1, Math.max(0.08, 1.2 - k.ny * 0.9 + 0.12 * Math.sin(t * p.sp * 0.5))),
      );
    },
  },
  bands: {
    name: "Bands",
    color(k, t, p) {
      const v = 0.5 + 0.5 * Math.sin(k.cy * 1.7 + t * p.sp * 3);
      return hsv(p.h + v * 18, p.s, 0.15 + 0.85 * v);
    },
  },
  twotone: {
    name: "Split",
    color(k, t, p) {
      const edge = 0.5 + 0.3 * Math.sin(t * p.sp * 0.6),
        m = Math.min(1, Math.max(0, (k.nx - edge) * 8 + 0.5));
      return hsv(p.h + 160 * m, p.s, 1);
    },
  },
  lava: {
    name: "Lava",
    color(k, t, p) {
      const v =
        0.5 +
        0.5 * Math.sin(k.cx * 0.9 + Math.sin(k.cy * 0.8 + t * p.sp * 0.4) * 2 + t * p.sp * 0.3);
      return hsv(p.h + v * 35, p.s, 0.25 + 0.75 * v);
    },
  },
  zigzag: {
    name: "Zigzag",
    color(k, t, p) {
      const x = (((k.nx * 4 + k.ny * 1.5 - t * p.sp * 0.6) % 1) + 1) % 1,
        v = Math.abs(x - 0.5) * 2;
      return hsv(p.h + v * 40, p.s, 0.15 + 0.85 * v);
    },
  },
  candle: {
    name: "Candlelight",
    color(k, t, p) {
      return hsv(
        p.h + 6 * Math.sin(t * p.sp + k.i),
        p.s,
        0.72 + 0.16 * Math.sin(t * p.sp * 3 + k.i) + 0.1 * Math.sin(t * p.sp * 7.3 + k.i * 2.1),
      );
    },
  },
  cross: {
    name: "Crosshair",
    color(k, t, p) {
      let m = 0;
      for (const h of HITS) {
        const kb = t - h.t;
        if (kb < 0 || kb > 2.5) continue;
        const dx = Math.abs(k.cx - h.x),
          dy = Math.abs(k.cy - h.y),
          f = Math.exp(-kb * 1.7 * p.sp);
        let v = 0;
        if (dy < 0.5) v = Math.max(0, 1 - dx / (1.5 + kb * 16 * p.sp));
        if (dx < 0.6) v = Math.max(v, 1 - dy / (1 + kb * 8 * p.sp));
        m = Math.max(m, v * f);
      }
      return hsv(p.h + (1 - m) * 25, p.s, 0.04 + 0.96 * m);
    },
  },
  sonar: {
    name: "Sonar",
    color(k, t, p) {
      // Rings every five keys, so a small board never sits dark between pings.
      const gap = 5,
        phase = (((k.dist - t * p.sp * 3) % gap) + gap) % gap,
        d = Math.min(phase, gap - phase);
      return hsv(p.h, p.s, 0.05 + 0.95 * Math.exp(-d * d * 1.4));
    },
  },
  spotlight: {
    name: "Spotlight",
    color(k, t, p) {
      // A soft circle drifting over the board on a slow figure of eight.
      const x = 0.5 + 0.42 * Math.sin(t * p.sp * 0.7),
        y = 0.5 + 0.4 * Math.sin(t * p.sp * 1.3),
        d = Math.hypot((k.nx - x) * 3.2, k.ny - y);
      return hsv(p.h, p.s * (0.6 + 0.4 * d), 0.04 + 0.96 * Math.exp(-d * d * 9));
    },
  },
  fireflies: {
    name: "Fireflies",
    color(k, t, p) {
      const r1 = rnd(k.i, 5),
        r2 = rnd(k.i, 6),
        glow = Math.pow(Math.max(0, Math.sin(t * p.sp * (0.35 + r1 * 0.5) + r2 * 60)), 24);
      return hsv(p.h + (r1 - 0.5) * 24, p.s, 0.03 + 0.97 * glow);
    },
  },
  lightning: {
    name: "Lightning",
    color(k, t, p) {
      // A dim sky, then every so often a double flash that strikes somewhere along the board.
      const phase = t * p.sp * 0.35,
        strike = Math.floor(phase),
        f = phase - strike,
        x = rnd(strike, 7),
        flash = Math.exp(-f * 40) + 0.7 * Math.exp(-Math.abs(f - 0.08) * 60),
        v = Math.min(1, flash * Math.exp(-Math.abs(k.nx - x) * 3.5)),
        cloud = 0.12 + 0.1 * Math.sin(k.nx * 5 + k.ny * 2 + t * p.sp * 0.6);
      return hsv(p.h, p.s * (1 - v * 0.8), cloud + (1 - cloud) * v);
    },
  },
  confetti: {
    name: "Confetti",
    color(k, t, p) {
      const beat = t * p.sp * 1.6 + rnd(k.i, 8) * 3,
        n = Math.floor(beat);
      return hsv(p.h + rnd(k.i * 13 + n, 9) * 360, p.s, 1 - (beat - n) * 0.75);
    },
  },
  rows: { name: "Row rainbow", color: (k, t, p) => hsv(p.h + k.ny * 300 + t * 25 * p.sp, p.s, 1) },
  sine: {
    name: "Sine wave",
    color(k, t, p) {
      const y = 0.5 + 0.36 * Math.sin(k.nx * Math.PI * 2.4 + t * p.sp * 2),
        d = k.ny - y;
      return hsv(p.h + d * 60, p.s, 0.05 + 0.95 * Math.exp(-d * d * 45));
    },
  },
  helix: {
    name: "Helix",
    color(k, t, p) {
      const a = k.nx * Math.PI * 2.4 + t * p.sp * 2,
        d1 = k.ny - (0.5 + 0.36 * Math.sin(a)),
        d2 = k.ny - (0.5 - 0.36 * Math.sin(a)),
        v1 = Math.exp(-d1 * d1 * 50),
        v2 = Math.exp(-d2 * d2 * 50);
      return hsv(v1 >= v2 ? p.h : p.h + 160, p.s, 0.05 + 0.95 * Math.max(v1, v2));
    },
  },
  checker: {
    name: "Checkers",
    color(k, t, p) {
      const odd = (Math.round(k.cx) + Math.round(k.cy)) % 2,
        v = 0.5 + 0.5 * Math.sin(t * p.sp * 2.2);
      return hsv(p.h, p.s, 0.08 + 0.92 * (odd ? v : 1 - v));
    },
  },
  wipe: {
    name: "Colour wipe",
    color(k, t, p) {
      // Each pass paints the board left to right in the next colour round the wheel.
      const pass = t * p.sp * 0.45,
        n = Math.floor(pass),
        edge = pass - n,
        painted = k.nx < edge;
      return hsv(p.h + (painted ? n : n - 1) * 55, p.s, painted && edge - k.nx < 0.04 ? 1 : 0.85);
    },
  },
  neon: {
    name: "Neon flicker",
    color(k, t, p) {
      // Steady like a neon sign, with the odd stutter in one section at a time.
      const section = Math.floor(k.cx / 4),
        tick = Math.floor(t * p.sp * 7),
        off = rnd(tick + section * 31, 11) < 0.05;
      return hsv(p.h, p.s, off ? 0.18 : 0.88 + 0.08 * Math.sin(t * 50 + section));
    },
  },
  rainbowbreathe: {
    name: "Rainbow breathing",
    color: (k, t, p) =>
      hsv(
        p.h + t * 30 * p.sp,
        p.s,
        0.06 + 0.94 * Math.pow(0.5 - 0.5 * Math.cos(t * p.sp * 1.5), 1.7),
      ),
  },
  trail: {
    name: "Typing trails",
    color(k, t, p) {
      // Keys you press stay lit and slowly cool down the colour wheel.
      let best = 0,
        age = 0;
      for (const h of HITS) {
        if (h.i !== k.i) continue;
        const a = t - h.t;
        if (a < 0 || a > 3) continue;
        const v = Math.exp(-a * 0.9 * p.sp);
        if (v > best) {
          best = v;
          age = a;
        }
      }
      return hsv(p.h + age * 50, p.s, 0.04 + 0.96 * best);
    },
  },
};

// What each effect is closest to on keyboards with their own short effect list, and its group in the gallery.
export const FX_HW = {
  solid: ["static", "solidcolor", "solid", "static", "alwayson"],
  breathe: ["breathing", "breathing", "breath", "breathingsingle"],
  gradient: ["static", "gradientupdown", "gradient"],
  sunrise: ["static", "gradientupdown", "gradient"],
  candle: ["breathing", "breathing", "huebreathing"],
  twotone: ["static", "gradientleftright", "gradient"],
  wave: ["wave", "cycleleftright", "rainbowwave", "wave", "spectrum", "lrsurf"],
  chevron: ["wave", "rainbowmovingchevron", "chevron", "msurf"],
  spiral: ["wave", "cyclespiral", "spiral", "rotate"],
  pinwheel: ["wave", "cyclepinwheel", "pinwheel", "rainbowpinwheels"],
  ripple: ["wave", "cycleoutin", "ripple", "rippling", "cycleoutindual"],
  cycle: ["cycle", "cycleall", "spectralcycle", "colorcycle", "cycling", "spectrum"],
  jelly: ["cycle", "jellybeanraindrops", "jellybean", "colorfulfountain"],
  pixel: ["cycle", "pixelrain", "pixelflow", "pixelfractal", "randfountatin"],
  aurora: ["wave", "huewave", "aurora"],
  pendulum: ["wave", "huependulum", "pendulum"],
  ocean: ["wave", "huewave", "wave"],
  bands: ["wave", "cycleupdown", "bandval", "wave"],
  plasma: ["wave", "pixelfractal", "huewave"],
  zigzag: ["wave", "rainbowmovingchevron", "chevron"],
  lava: ["breathing", "huebreathing", "huewave"],
  raindrops: ["breathing", "raindrops", "raindrop"],
  starlight: ["breathing", "raindrops", "twinkle", "starlight"],
  glitter: ["cycle", "jellybeanraindrops", "raindrops", "twinkle"],
  matrix: ["breathing", "digitalrain", "matrix"],
  snake: ["wave", "snake", "cycleleftright"],
  scanner: ["wave", "knight", "scanner", "laser", "cycleleftright"],
  comet: ["wave", "cycleleftright", "wave"],
  radar: ["wave", "cyclepinwheel", "pinwheel", "rotate"],
  beacon: ["wave", "dualbeacon", "rainbowbeacon", "beacon", "laser"],
  heartbeat: ["breathing", "breathing"],
  fire: ["breathing", "typingheatmap", "fire", "breathing"],
  heat: ["reactive", "typingheatmap", "heatmap"],
  reactive: [
    "reactive",
    "solidreactivewide",
    "solidreactivesimple",
    "solidreactive",
    "reactive",
    "magnetic",
  ],
  splash: ["reactive", "multisplash", "splash", "solidmultisplash"],
  cross: ["reactive", "solidreactivemulticross", "solidreactivecross", "crosssurf", "cross"],
  sonar: ["reactive", "solidreactivenexus", "cycleoutin", "ripple"],
  spotlight: ["breathing", "dualbeacon", "beacon", "breathing"],
  fireflies: ["breathing", "starlight", "twinkle", "raindrops"],
  lightning: ["breathing", "starlightdual", "starlight", "raindrops"],
  confetti: ["cycle", "jellybeanraindrops", "pixelrain", "colorfulfountain"],
  rows: ["wave", "cycleupdown", "rainbowwave", "gradientupdown"],
  sine: ["wave", "huewave", "wave"],
  helix: ["wave", "huewave", "rainbowmovingchevron"],
  checker: ["breathing", "bandval", "breathing"],
  wipe: ["wave", "cycleleftright", "wave"],
  neon: ["static", "solidcolor", "static"],
  rainbowbreathe: ["breathing", "huebreathing", "breathing"],
  trail: ["reactive", "solidreactivesimple", "solidreactive", "reactive"],
};

export const GROUPS = [
  ["all", "All"],
  ["calm", "Calm"],
  ["rainbow", "Rainbow"],
  ["waves", "Waves"],
  ["sparkle", "Sparkle"],
  ["motion", "Motion"],
  ["reactive", "Reacts to typing"],
];

const GROUP_OF = {
  solid: "calm",
  breathe: "calm",
  gradient: "calm",
  sunrise: "calm",
  candle: "calm",
  twotone: "calm",
  wave: "rainbow",
  chevron: "rainbow",
  spiral: "rainbow",
  pinwheel: "rainbow",
  ripple: "rainbow",
  cycle: "rainbow",
  jelly: "rainbow",
  pixel: "rainbow",
  aurora: "waves",
  pendulum: "waves",
  ocean: "waves",
  bands: "waves",
  plasma: "waves",
  zigzag: "waves",
  lava: "waves",
  raindrops: "sparkle",
  starlight: "sparkle",
  glitter: "sparkle",
  matrix: "sparkle",
  snake: "motion",
  scanner: "motion",
  comet: "motion",
  radar: "motion",
  beacon: "motion",
  heartbeat: "motion",
  fire: "motion",
  heat: "reactive",
  reactive: "reactive",
  splash: "reactive",
  cross: "reactive",
  neon: "calm",
  rows: "rainbow",
  confetti: "rainbow",
  rainbowbreathe: "rainbow",
  sine: "waves",
  helix: "waves",
  fireflies: "sparkle",
  lightning: "sparkle",
  sonar: "motion",
  spotlight: "motion",
  checker: "motion",
  wipe: "motion",
  trail: "reactive",
};

// The first twenty are the original hand-tuned set; the rest are every effect in every colour.
const ORIGINAL = [
  ["monsoon", "Monsoon", "raindrops", 205, 85, 45],
  ["glacier", "Glacier", "solid", 192, 55, 50],
  ["tidal", "Tidal breath", "breathe", 172, 90, 35],
  ["spectrum", "Spectrum", "wave", 0, 100, 40],
  ["chevron", "Neon chevron", "chevron", 280, 100, 45],
  ["vortex", "Vortex", "spiral", 200, 100, 45],
  ["pinwheel", "Pinwheel", "pinwheel", 0, 100, 40],
  ["ripple", "Ripple", "ripple", 150, 100, 40],
  ["prism", "Prism cycle", "cycle", 0, 100, 35],
  ["sunset", "Sunset", "gradient", 322, 95, 30],
  ["jelly", "Jellybean", "jelly", 0, 100, 45],
  ["matrix", "Matrix", "matrix", 128, 95, 45],
  ["aurora", "Aurora", "aurora", 150, 85, 35],
  ["pendulum", "Pendulum", "pendulum", 285, 90, 40],
  ["lighthouse", "Lighthouse", "beacon", 36, 95, 40],
  ["pixel", "Pixel storm", "pixel", 0, 100, 45],
  ["heat", "Heatmap", "heat", 0, 100, 40],
  ["ghost", "Ghost keys", "reactive", 265, 80, 45],
  ["splash", "Splash", "splash", 195, 100, 45],
  ["crosshair", "Crosshair", "cross", 352, 95, 45],
];

const COLOURS = [
  ["Crimson", 352, 85],
  ["Ember", 18, 90],
  ["Amber", 38, 95],
  ["Lemon", 55, 80],
  ["Lime", 90, 80],
  ["Jade", 145, 75],
  ["Mint", 160, 50],
  ["Teal", 175, 85],
  ["Ice", 195, 40],
  ["Sky", 205, 80],
  ["Cobalt", 228, 80],
  ["Indigo", 250, 70],
  ["Violet", 270, 70],
  ["Orchid", 295, 60],
  ["Rose", 330, 70],
  ["Sakura", 340, 35],
  ["White", 0, 0],
  ["Coral", 10, 70],
  ["Peach", 25, 45],
  ["Gold", 46, 85],
  ["Olive", 70, 70],
  ["Forest", 130, 85],
  ["Aqua", 185, 60],
  ["Navy", 225, 95],
  ["Lavender", 265, 35],
  ["Magenta", 305, 90],
  ["Ruby", 345, 95],
];

// Fire, candlelight, sunrise and lava only look right in these.
const WARM = [
  "Crimson",
  "Ember",
  "Amber",
  "Rose",
  "Violet",
  "Cobalt",
  "Jade",
  "Coral",
  "Gold",
  "Ruby",
];

const NOUN = {
  solid: "glow",
  breathe: "breath",
  gradient: "gradient",
  sunrise: "sunrise",
  candle: "candlelight",
  twotone: "split",
  aurora: "aurora",
  pendulum: "pendulum",
  ocean: "tide",
  bands: "bands",
  plasma: "plasma",
  zigzag: "zigzag",
  lava: "lava",
  raindrops: "rain",
  starlight: "stars",
  glitter: "glitter",
  matrix: "code rain",
  snake: "snake",
  scanner: "scanner",
  comet: "comet",
  radar: "radar",
  beacon: "lighthouse",
  heartbeat: "heartbeat",
  fire: "fire",
  reactive: "ghost keys",
  splash: "splash",
  cross: "crosshair",
  sonar: "sonar",
  spotlight: "spotlight",
  fireflies: "fireflies",
  lightning: "storm",
  sine: "sine wave",
  helix: "helix",
  checker: "checkers",
  wipe: "wipe",
  neon: "neon",
  trail: "trails",
};

const RAINBOW = {
  wave: "Spectrum",
  chevron: "Chevron",
  spiral: "Vortex",
  pinwheel: "Pinwheel",
  ripple: "Ripple",
  cycle: "Prism",
  jelly: "Jellybean",
  pixel: "Pixel storm",
  confetti: "Confetti",
  rows: "Row rainbow",
  rainbowbreathe: "Rainbow breath",
};

// Hand-tuned scenes: an effect, a hue, saturation and speed that suit a name.
const THEMES = [
  ["cyberpunk", "Cyberpunk", "chevron", 300, 100, 55],
  ["vaporwave", "Vaporwave", "gradient", 290, 70, 20],
  ["synthwave", "Synthwave", "sunrise", 320, 90, 25],
  ["deep-sea", "Deep sea", "ocean", 210, 95, 25],
  ["northern-lights", "Northern lights", "aurora", 140, 80, 20],
  ["campfire", "Campfire", "fire", 8, 95, 55],
  ["thunderstorm", "Thunderstorm", "lightning", 225, 60, 55],
  ["summer-night", "Summer night", "fireflies", 70, 85, 35],
  ["submarine", "Submarine", "sonar", 150, 90, 35],
  ["stage-light", "Stage light", "spotlight", 40, 30, 35],
  ["dna", "DNA", "helix", 190, 90, 40],
  ["oscilloscope", "Oscilloscope", "sine", 120, 100, 50],
  ["arcade", "Arcade", "checker", 285, 100, 45],
  ["party", "Party", "confetti", 0, 100, 60],
  ["paint-roller", "Paint roller", "wipe", 0, 90, 40],
  ["diner-sign", "Diner sign", "neon", 340, 95, 40],
  ["typewriter", "Typewriter", "trail", 35, 70, 35],
  ["mood-ring", "Mood ring", "rainbowbreathe", 0, 85, 25],
  ["sakura-season", "Sakura season", "starlight", 335, 40, 30],
  ["matrix-reloaded", "Matrix reloaded", "matrix", 120, 100, 70],
  ["volcano", "Volcano", "lava", 10, 100, 40],
  ["glacier-drift", "Glacier drift", "plasma", 190, 45, 20],
  ["heartbeat-red", "Racing heart", "heartbeat", 350, 95, 70],
  ["radar-sweep", "Radar sweep", "radar", 120, 95, 40],
];

function build() {
  const out = ORIGINAL.map(([id, name, fx, h, s, speed]) => ({
    id,
    name,
    fx,
    h,
    s,
    br: 90,
    speed,
    group: GROUP_OF[fx],
    original: true,
  }));
  for (const [id, name, fx, h, sat, speed] of THEMES)
    out.push({ id, name, fx, h, s: sat, br: 90, speed, group: GROUP_OF[fx], original: true });
  for (const [fx, base] of Object.entries(RAINBOW))
    for (const [pre, s, speed] of [
      ["Slow", 100, 15],
      ["Fast", 100, 85],
      ["Pastel", 45, 40],
      ["Deep", 100, 30],
    ])
      out.push({
        id: `${fx}.${pre.toLowerCase()}`,
        name: `${pre} ${base.toLowerCase()}`,
        fx,
        h: 0,
        s,
        br: 90,
        speed,
        group: "rainbow",
      });
  for (const [fx, noun] of Object.entries(NOUN))
    for (const [cname, h, s] of COLOURS) {
      if (["fire", "candle", "sunrise", "lava"].includes(fx) && !WARM.includes(cname)) continue;
      out.push({
        id: `${fx}.${cname.toLowerCase()}`,
        name: `${cname} ${noun}`,
        fx,
        h,
        s,
        br: 90,
        speed: 45,
        group: GROUP_OF[fx],
      });
    }
  return out;
}

export const PRESETS = build();

export const params = (profile) => ({
  h: profile.h,
  s: profile.s / 100,
  sp: 0.25 + (profile.speed / 100) * 2.75,
});

/** Writes the colours of one frame into out (Float32Array, 3 per key). */
export function frameColors(profile, st, t, dt, layout, out) {
  if (st.layout !== layout) {
    for (const key of Object.keys(st)) delete st[key];
    st.layout = layout;
  }
  const E = FX[profile.fx],
    p = params(profile),
    br = profile.br / 100;
  if (E.step) E.step(st, t, dt, p, layout);
  for (let i = 0; i < layout.keys.length; i++) {
    const c = E.color(layout.keys[i], t, p, st, layout),
      j = i * 3;
    out[j] = c[0] * br;
    out[j + 1] = c[1] * br;
    out[j + 2] = c[2] * br;
  }
  return out;
}

export const norm = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** The keyboard's own effect that best matches a profile. */
export function matchEffect(profile, effects) {
  if (!effects || !effects.length) return null;
  const [cat, ...names] = FX_HW[profile.fx] || ["static"];
  for (const m of names) {
    const f = effects.find((e) => norm(e.name) === m);
    if (f) return f;
  }
  for (const m of names) {
    const f = effects.find((e) => norm(e.name).includes(m));
    if (f) return f;
  }
  const fallback =
    {
      static: ["static", "solid"],
      breathing: ["breath"],
      wave: ["wave", "surf", "swirl", "cycleleftright"],
      cycle: ["cycle", "spectrum", "rainbow"],
      reactive: ["reactive", "ripple"],
    }[cat] || [];
  for (const m of fallback) {
    const f = effects.find((e) => norm(e.name).includes(m));
    if (f) return f;
  }
  return effects.find((e) => !/off|none/i.test(e.name)) || effects[0];
}
