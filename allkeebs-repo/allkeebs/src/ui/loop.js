// One requestAnimationFrame loop draws every keyboard on screen.
// Previews are throttled, and with reduced motion we only redraw when something changed.

import { addHit, frameColors, pruneHits } from "../effects.js";
import { state } from "./state.js";

export const views = [];

// { view, kind: "lit"|"plain", profile?, simKey?, state?, layout() }
const simState = {};

const simStateFor = (k) => simState[k] || (simState[k] = {});

let dirty = true;

export const markDirty = () => {
  dirty = true;
};

let lastT = performance.now() / 1000,
  lastReal = -99,
  demoNext = 0,
  demoPos = 0,
  lastSlow = 0;

const DEMO_TEXT = "the quick brown fox jumps over the lazy dog ";

// Real key presses pause the demo typing for a few seconds.
export function noteRealKey(t) {
  lastReal = t;
}

function demoTick(t, layout) {
  if (!state.prefs.demoTyping || state.prefs.reduced || t - lastReal < 3 || t < demoNext || !layout)
    return;
  const ch = DEMO_TEXT[demoPos++ % DEMO_TEXT.length],
    key = ch === " " ? layout.byCode.Space : layout.byCode["Key" + ch.toUpperCase()];
  if (key) addHit(layout, key.i, t);
  demoNext =
    t + 0.07 + Math.random() * 0.16 + (ch === " " ? 0.18 : 0) + (Math.random() < 0.04 ? 0.7 : 0);
}

export function loop(ms) {
  const t = ms / 1000,
    dt = Math.min(0.1, t - lastT);
  lastT = t;
  pruneHits(t);
  const animate = !state.prefs.reduced;
  const lit = views.find((v) => v.kind === "lit" && !v.mini);
  if (lit) demoTick(t, lit.view.layout);
  const slow = t - lastSlow > 0.05;
  if (animate || dirty) {
    for (const v of views) {
      if (!v.view.layout || v.hidden) continue;
      if (v.mini && !slow && !dirty) continue;
      if (v.kind === "lit") {
        const layout = v.view.layout,
          out =
            v.buf && v.buf.length === layout.keys.length * 3
              ? v.buf
              : (v.buf = new Float32Array(layout.keys.length * 3));
        if (state.off && !v.mini) out.fill(0);
        else
          frameColors(
            v.profile(),
            simStateFor(v.simKey()),
            animate ? t : 1.5,
            v.mini ? Math.min(0.2, t - (v.lt || t)) : dt,
            layout,
            out,
          );
        v.lt = t;
        v.view.draw(out, null);
      } else v.view.draw(null, v.state);
    }
    if (slow) lastSlow = t;
    dirty = false;
  }
  requestAnimationFrame(loop);
}
