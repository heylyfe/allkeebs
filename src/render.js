// Draws a keyboard on a canvas: case, keycaps, legends, and either LED light or key states.
import { keyAtPoint, keyRectangles } from "./layouts.js";

const PAD = 0.45;

function roundRect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

const newCanvas = () => document.createElement("canvas");
let ACCENT = [125, 147, 255];

function withKey(ctx, key, u, draw) {
  const rx = key.rx || 0,
    ry = key.ry || 0;
  ctx.save();
  ctx.translate((PAD + rx) * u, (PAD + ry) * u);
  if (key.r) ctx.rotate((key.r * Math.PI) / 180);
  const rects = keyRectangles(key).map((r) => ({
    x: (r.x - rx) * u,
    y: (r.y - ry) * u,
    w: r.w * u,
    h: r.h * u,
  }));
  draw(rects, rectBounds(rects));
  ctx.restore();
}

function rectBounds(rects) {
  return {
    x: Math.min(...rects.map((r) => r.x)),
    y: Math.min(...rects.map((r) => r.y)),
    w: Math.max(...rects.map((r) => r.x + r.w)) - Math.min(...rects.map((r) => r.x)),
    h: Math.max(...rects.map((r) => r.y + r.h)) - Math.min(...rects.map((r) => r.y)),
  };
}

function insetRects(rects, left, top = left, right = left, bottom = top) {
  return rects
    .map((r) => ({ x: r.x + left, y: r.y + top, w: r.w - left - right, h: r.h - top - bottom }))
    .filter((r) => r.w > 0 && r.h > 0);
}

function boundarySegments(rects) {
  const edges = rects.flatMap((r, i) => [
    { x1: r.x, y1: r.y, x2: r.x + r.w, y2: r.y, i },
    { x1: r.x + r.w, y1: r.y, x2: r.x + r.w, y2: r.y + r.h, i },
    { x1: r.x + r.w, y1: r.y + r.h, x2: r.x, y2: r.y + r.h, i },
    { x1: r.x, y1: r.y + r.h, x2: r.x, y2: r.y, i },
  ]);
  const out = [];
  for (const edge of edges) {
    const horizontal = edge.y1 === edge.y2,
      start = horizontal ? Math.min(edge.x1, edge.x2) : Math.min(edge.y1, edge.y2),
      end = horizontal ? Math.max(edge.x1, edge.x2) : Math.max(edge.y1, edge.y2),
      cuts = [start, end];
    for (let j = 0; j < rects.length; j++) {
      if (j === edge.i) continue;
      const r = rects[j];
      for (const v of horizontal ? [r.x, r.x + r.w] : [r.y, r.y + r.h])
        if (v > start && v < end) cuts.push(v);
    }
    cuts.sort((a, b) => a - b);
    for (let j = 0; j < cuts.length - 1; j++) {
      const a = cuts[j],
        b = cuts[j + 1],
        mid = (a + b) / 2,
        mx = horizontal ? mid : edge.x1,
        my = horizontal ? edge.y1 : mid,
        covered = rects.some(
          (r, k) =>
            k !== edge.i &&
            mx >= r.x - 1e-9 &&
            mx <= r.x + r.w + 1e-9 &&
            my >= r.y - 1e-9 &&
            my <= r.y + r.h + 1e-9,
        );
      if (covered) continue;
      out.push(horizontal ? [a, edge.y1, b, edge.y1] : [edge.x1, a, edge.x1, b]);
    }
  }
  return out;
}

function strokeBoundary(ctx, rects) {
  ctx.beginPath();
  for (const [x1, y1, x2, y2] of boundarySegments(rects)) {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

function fillRects(ctx, rects, radius, fillStyle) {
  ctx.fillStyle = fillStyle;
  for (const r of rects) {
    roundRect(ctx, r.x, r.y, r.w, r.h, radius);
    ctx.fill();
  }
}

/** Re-read the accent after a theme change; drawing uses the cached value. */
export function refreshAccent() {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue("--accent-rgb")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (v.length >= 3 && v.every((n) => !Number.isNaN(n))) ACCENT = v.slice(0, 3);
}

const accentRgb = () => ACCENT;

export class KeyboardView {
  constructor(canvas, { handleKey, mini = false } = {}) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.mini = mini;
    this.handleKey = handleKey;
    this.caseL = newCanvas();
    this.capsL = newCanvas();
    this.g1 = newCanvas();
    this.g2 = newCanvas();
    this.layout = null;
    this.size = { u: 0 };
    if (handleKey)
      canvas.addEventListener("pointerdown", (e) => {
        const i = this.hit(e);
        if (i >= 0) handleKey(i, e);
      });
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas.parentElement || canvas);
  }
  setLayout(layout) {
    if (this.layout === layout) return;
    this.layout = layout;
    this.resize();
  }
  hit(e) {
    const r = this.cv.getBoundingClientRect(),
      u = this.size.u;
    if (!u || !this.layout) return -1;
    const x = (e.clientX - r.left) / u - PAD,
      y = (e.clientY - r.top) / u - PAD;
    return keyAtPoint(this.layout, x, y);
  }
  resize() {
    const layout = this.layout;
    if (!layout) return;
    const cw = this.cv.clientWidth || this.cv.parentElement?.clientWidth || 0;
    if (!cw) return;
    const TW = layout.W + PAD * 2,
      TH = layout.H + PAD * 2,
      u = cw / TW,
      ch = u * TH,
      dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cv.style.height = ch + "px";
    this.cv.width = Math.round(cw * dpr);
    this.cv.height = Math.round(ch * dpr);
    for (const c of [this.caseL, this.capsL]) {
      c.width = this.cv.width;
      c.height = this.cv.height;
    }
    this.g1.width = Math.max(8, Math.round(cw / 5));
    this.g1.height = Math.max(4, Math.round(ch / 5));
    this.g2.width = Math.max(4, Math.round(cw / 14));
    this.g2.height = Math.max(2, Math.round(ch / 14));
    this.size = { u, cw, ch, dpr };
    let c = this.caseL.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    const m = u * 0.1,
      rad = u * (this.mini ? 0.25 : 0.38);
    if (!this.mini) {
      c.save();
      c.shadowColor = "rgba(0,0,0,.55)";
      c.shadowBlur = u * 0.8;
      c.shadowOffsetY = u * 0.25;
    }
    let gr = c.createLinearGradient(0, 0, 0, ch);
    gr.addColorStop(0, "#23272f");
    gr.addColorStop(1, "#14171c");
    roundRect(c, m, m, cw - 2 * m, ch - 2 * m, rad);
    c.fillStyle = gr;
    c.fill();
    if (!this.mini) c.restore();
    roundRect(c, m, m, cw - 2 * m, ch - 2 * m, rad);
    c.strokeStyle = "rgba(255,255,255,.08)";
    c.lineWidth = 1;
    c.stroke();
    roundRect(c, u * 0.3, u * 0.3, cw - u * 0.6, ch - u * 0.6, u * 0.14);
    c.fillStyle = "#050607";
    c.fill();
    c = this.capsL.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    for (const k of layout.keys) {
      withKey(c, k, u, (raw, box) => {
        const g = u * (this.mini ? 0.07 : 0.055),
          outer = insetRects(raw, g),
          bounds = rectBounds(outer);
        gr = c.createLinearGradient(bounds.x, bounds.y, bounds.x, bounds.y + bounds.h);
        gr.addColorStop(0, "#2c3139");
        gr.addColorStop(1, "#16191e");
        fillRects(c, outer, u * 0.11, gr);
        if (this.mini) return;
        c.strokeStyle = "rgba(0,0,0,.55)";
        c.lineWidth = 1;
        strokeBoundary(c, outer);
        const ti = u * 0.1,
          inner = insetRects(outer, ti, ti * 0.45, ti, ti * 1.75),
          innerBounds = rectBounds(inner);
        gr = c.createLinearGradient(
          innerBounds.x,
          innerBounds.y,
          innerBounds.x,
          innerBounds.y + innerBounds.h,
        );
        gr.addColorStop(0, "#383e49");
        gr.addColorStop(1, "#292e37");
        fillRects(c, inner, u * 0.08, gr);
        c.strokeStyle = "rgba(255,255,255,.05)";
        strokeBoundary(c, inner);
      });
    }
  }
  /**
   * cols: Float32Array of LED colours or null for an unlit board.
   * state(i) -> { on, tested, selected, changed, label, sub } for key overlays.
   */
  draw(cols, state) {
    const layout = this.layout,
      { u, cw, ch, dpr } = this.size;
    if (!layout || !u) return;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    ctx.drawImage(this.caseL, 0, 0);
    if (cols) {
      for (const [gc, sc] of [
        [this.g1, 5],
        [this.g2, 14],
      ]) {
        const c = gc.getContext("2d");
        c.setTransform(1 / sc, 0, 0, 1 / sc, 0, 0);
        c.fillStyle = "#000";
        c.fillRect(0, 0, cw, ch);
        for (const k of layout.keys) {
          const j = k.i * 3,
            color = `rgb(${(cols[j] * 255) | 0},${(cols[j + 1] * 255) | 0},${(cols[j + 2] * 255) | 0})`;
          withKey(c, k, u, (raw) => {
            c.fillStyle = color;
            for (const r of insetRects(raw, u * 0.04)) c.fillRect(r.x, r.y, r.w, r.h);
          });
        }
      }
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      roundRect(ctx, u * 0.3, u * 0.3, cw - u * 0.6, ch - u * 0.6, u * 0.14);
      ctx.clip();
      ctx.globalCompositeOperation = "lighter";
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(this.g1, 0, 0, cw, ch);
      if (!this.mini) ctx.drawImage(this.g1, 0, 0, cw, ch);
      ctx.drawImage(this.g2, 0, 0, cw, ch);
      ctx.globalAlpha = 0.7;
      ctx.drawImage(this.g2, 0, 0, cw, ch);
      ctx.restore();
    }
    ctx.globalAlpha = cols ? (this.mini ? 0.55 : 0.86) : 1;
    ctx.drawImage(this.capsL, 0, 0);
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const A = state ? accentRgb() : null,
      family = "DM Sans, system-ui, sans-serif";
    for (const k of layout.keys) {
      const status = state ? state(k.i) : null;
      let r = 0,
        g = 0,
        b = 0,
        L = 0;
      if (cols) {
        const j = k.i * 3;
        r = cols[j];
        g = cols[j + 1];
        b = cols[j + 2];
        L = Math.max(r, g, b);
      }
      if (cols && L > 0.02) {
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = `rgba(${(r * 255) | 0},${(g * 255) | 0},${(b * 255) | 0},${this.mini ? 0.5 : 0.16})`;
        withKey(ctx, k, u, (rects) => fillRects(ctx, rects, u * 0.11, ctx.fillStyle));
        ctx.globalCompositeOperation = "source-over";
      }
      if (status) {
        const [ar, ag, ab] = A;
        if (status.tested && !status.on) {
          ctx.fillStyle = `rgba(${ar},${ag},${ab},.16)`;
          withKey(ctx, k, u, (rects) => fillRects(ctx, rects, u * 0.11, ctx.fillStyle));
        }
        if (status.on) {
          ctx.fillStyle = `rgba(${ar},${ag},${ab},.85)`;
          withKey(ctx, k, u, (rects) => fillRects(ctx, rects, u * 0.11, ctx.fillStyle));
        }
        if (status.changed) {
          ctx.fillStyle = `rgba(${ar},${ag},${ab},.22)`;
          withKey(ctx, k, u, (rects) => fillRects(ctx, rects, u * 0.11, ctx.fillStyle));
        }
        if (status.selected) {
          ctx.strokeStyle = `rgb(${ar},${ag},${ab})`;
          ctx.lineWidth = 2;
          withKey(ctx, k, u, (rects) => strokeBoundary(ctx, insetRects(rects, -1)));
        }
        if (status.dim) {
          ctx.fillStyle = "rgba(0,0,0,.45)";
          withKey(ctx, k, u, (rects) => fillRects(ctx, rects, u * 0.11, ctx.fillStyle));
        }
      }
      if (this.mini) continue;
      const label = status && status.label != null ? status.label : k.label,
        sub = status && status.label != null ? status.sub : k.sub;
      if (!label && !sub) continue;
      withKey(ctx, k, u, (rects, box) => {
        const x = box.x,
          y = box.y,
          w = box.w,
          h = box.h;
        if (status && status.on) ctx.fillStyle = "#0a1030";
        else if (cols) {
          // Legends start grey and take on the key's colour as it gets brighter.
          const tint = (grey, c) => Math.round(grey + (120 + c * 135 - grey) * L);
          ctx.fillStyle = `rgb(${tint(98, r)},${tint(104, g)},${tint(116, b)})`;
        } else ctx.fillStyle = status && status.changed ? "#eef0f2" : "#a3aab4";
        if (cols && L > 0.15) {
          ctx.shadowColor = `rgba(${(r * 255) | 0},${(g * 255) | 0},${(b * 255) | 0},${0.9 * L})`;
          ctx.shadowBlur = u * 0.2;
        } else ctx.shadowBlur = 0;
        const fit = (text, size) => {
          ctx.font = `500 ${size}px ${family}`;
          const mw = w - u * 0.18;
          const tw = ctx.measureText(text).width;
          if (tw > mw) ctx.font = `500 ${Math.max(6, (size * mw) / tw)}px ${family}`;
        };
        if (sub) {
          fit(sub, u * 0.19);
          ctx.fillText(sub, x + w / 2, y + h * 0.3);
          fit(label, u * 0.23);
          ctx.fillText(label, x + w / 2, y + h * 0.62);
        } else {
          fit(label, label.length > 1 ? (label.length > 4 ? u * 0.18 : u * 0.21) : u * 0.28);
          ctx.fillText(label, x + w / 2, y + Math.min(h, u) * 0.46 + (h - Math.min(h, u)) / 2);
        }
      });
    }
    ctx.restore();
  }
}
