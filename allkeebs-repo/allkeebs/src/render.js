// Draws a keyboard on a canvas: case, keycaps, legends, and either LED light or key states.
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
    const key = this.layout.keys.find(
      (k) => x >= k.x && x < k.x + k.w && y >= k.y && y < k.y + k.h,
    );
    return key ? key.i : -1;
  }
  rect(k) {
    const u = this.size.u,
      g = u * (this.mini ? 0.07 : 0.055);
    return [(PAD + k.x) * u + g, (PAD + k.y) * u + g, k.w * u - 2 * g, k.h * u - 2 * g];
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
      const [x, y, w, h] = this.rect(k);
      gr = c.createLinearGradient(0, y, 0, y + h);
      gr.addColorStop(0, "#2c3139");
      gr.addColorStop(1, "#16191e");
      roundRect(c, x, y, w, h, u * 0.11);
      c.fillStyle = gr;
      c.fill();
      if (this.mini) continue;
      c.strokeStyle = "rgba(0,0,0,.55)";
      c.lineWidth = 1;
      c.stroke();
      const ti = u * 0.1;
      gr = c.createLinearGradient(0, y, 0, y + h);
      gr.addColorStop(0, "#383e49");
      gr.addColorStop(1, "#292e37");
      roundRect(c, x + ti, y + ti * 0.45, w - ti * 2, h - ti * 1.75, u * 0.08);
      c.fillStyle = gr;
      c.fill();
      c.strokeStyle = "rgba(255,255,255,.05)";
      c.stroke();
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
            [x, y, w, h] = this.rect(k);
          c.fillStyle = `rgb(${(cols[j] * 255) | 0},${(cols[j + 1] * 255) | 0},${(cols[j + 2] * 255) | 0})`;
          c.fillRect(x + u * 0.04, y + u * 0.04, w - u * 0.08, h - u * 0.08);
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
      const [x, y, w, h] = this.rect(k);
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
        roundRect(ctx, x, y, w, h, u * 0.11);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
      }
      if (status) {
        const [ar, ag, ab] = A;
        if (status.tested && !status.on) {
          ctx.fillStyle = `rgba(${ar},${ag},${ab},.16)`;
          roundRect(ctx, x, y, w, h, u * 0.11);
          ctx.fill();
        }
        if (status.on) {
          ctx.fillStyle = `rgba(${ar},${ag},${ab},.85)`;
          roundRect(ctx, x, y, w, h, u * 0.11);
          ctx.fill();
        }
        if (status.changed) {
          ctx.fillStyle = `rgba(${ar},${ag},${ab},.22)`;
          roundRect(ctx, x, y, w, h, u * 0.11);
          ctx.fill();
        }
        if (status.selected) {
          ctx.strokeStyle = `rgb(${ar},${ag},${ab})`;
          ctx.lineWidth = 2;
          roundRect(ctx, x - 1, y - 1, w + 2, h + 2, u * 0.13);
          ctx.stroke();
        }
        if (status.dim) {
          ctx.fillStyle = "rgba(0,0,0,.45)";
          roundRect(ctx, x, y, w, h, u * 0.11);
          ctx.fill();
        }
      }
      if (this.mini) continue;
      const label = status && status.label != null ? status.label : k.label,
        sub = status && status.label != null ? status.sub : k.sub;
      if (!label && !sub) continue;
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
    }
    ctx.restore();
  }
}
