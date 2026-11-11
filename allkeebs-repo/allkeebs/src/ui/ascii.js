// The faint ASCII texture in the top-right corner. Ported from OpenMouse's shared/ascii.ts,
// drawn in our accent colour.

import { $, clamp } from "./dom.js";

function lattice(x, y) {
  let h = (Math.imul(x | 0, 0x9e3779b1) ^ Math.imul(y | 0, 0x85ebca77)) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h = (h ^ (h >>> 12)) >>> 0;
  h = Math.imul(h, 0x297a2d39) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return (h & 0xffff) / 65535;
}

const smooth = (t) => t * t * (3 - 2 * t),
  lerp = (a, b, t) => a + (b - a) * t;

function vnoise(x, y) {
  const xf = Math.floor(x),
    yf = Math.floor(y),
    fx = smooth(x - xf),
    fy = smooth(y - yf);
  return lerp(
    lerp(lattice(xf, yf), lattice(xf + 1, yf), fx),
    lerp(lattice(xf, yf + 1), lattice(xf + 1, yf + 1), fx),
    fy,
  );
}

const SEED = [Math.random() * 997 * 1.37, Math.random() * 991 * 0.73];

let asciiCols = 0;

export function drawAscii() {
  const el = $(".ascii");
  if (!el) return;
  const cols = clamp(Math.trunc((window.innerWidth * 0.42) / 6.6), 24, 104);
  if (cols === asciiCols) return;
  asciiCols = cols;
  const rows = 40,
    ramp = " .:-=+*#%@",
    gridRows = Math.max(2, Math.round((14 * rows) / (cols * 0.43))),
    ox = 1.02 * cols,
    oy = -0.04 * rows,
    radius = 0.62 * cols * 0.43;
  let html = "";
  for (let y = 0; y < rows; y++) {
    let line = "";
    for (let x = 0; x < cols; x++) {
      const d = Math.hypot((x - ox) * 0.43, y - oy) / radius,
        glow = Math.pow(Math.max(1 - d, 0), 1.1);
      const n = vnoise((x / cols) * 14 + SEED[0], (y / rows) * gridRows + SEED[1]),
        jit = (lattice(x + 7919, y - 104729) - 0.5) * 0.06;
      line +=
        ramp[
          clamp(Math.floor((glow * (0.6 + 0.4 * n) + jit) * ramp.length * 1.35), 0, ramp.length - 1)
        ];
    }
    const pos = (y + 0.5) / rows,
      s = clamp((1 - pos) / 0.45, 0, 1),
      kb = 0.24 * s * s * (3 - 2 * s);
    html += `<div style="--a:${kb.toFixed(3)}">${line.trimEnd() || " "}</div>`;
  }
  el.innerHTML = html;
}
