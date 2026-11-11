// Key test, both as a tab and as its own page. Works with any keyboard because it only needs
// browser key events; VIA boards can also be read straight from the switch matrix.

import { store } from "../../devices.js";
import { addHit } from "../../effects.js";
import { PRESET_IDS, presetLayout } from "../../layouts.js";
import { KeyboardView } from "../../render.js";
import { $, $$, esc, icons, log, toast } from "../dom.js";
import { layoutFor } from "../layout-choice.js";
import { markDirty, noteRealKey, views } from "../loop.js";
import { hero } from "./device.js";
import { recordKey, recording } from "./macros.js";
import { state } from "../state.js";

export function resetKeyTest() {
  state.keyTest = {
    down: new Set(),
    mdown: new Set(),
    tested: new Set(),
    events: [],
    count: 0,
    chatter: 0,
    lastUp: {},
    outside: new Set(),
    last: null,
  };
}

resetKeyTest();

export function keyTestState(i) {
  const test = state.keyTest;
  return { on: test.down.has(i) || test.mdown.has(i), tested: test.tested.has(i) };
}

function keyTestMarkup(withMatrix) {
  const matrixSwitch = `
    <label class="switch" style="margin-top:16px">
      <span>Read the switch matrix from the board. Catches Fn and keys your computer never sees</span>
      <input type="checkbox" id="ktMatrix"><i></i>
    </label>`;
  return `
    <div class="grid2">
      <div class="panel">
        <div class="panel-head">
          <div>
            <h2>Key test</h2>
            <p class="sub">Press every key. Keys turn solid while held and stay tinted once tested</p>
          </div>
          <button class="btn ghost sm" id="ktReset">${icons.reset}Start over</button>
        </div>
        <div class="figs" id="ktFigs"></div>
        ${withMatrix ? matrixSwitch : ""}
        <div id="ktOutside"></div>
      </div>
      <div class="panel">
        <h2>Events</h2>
        <p class="sub">Newest first. Chatter is a second press within 30 ms of a release</p>
        <div class="log" id="ktLog"></div>
      </div>
    </div>`;
}

const LOG_LINES = 14;

function logLine(e) {
  return `
    <div class="${e.warn ? "warn" : ""}">
      <span class="dim">${e.dt}</span>
      <span>${e.type}</span>
      <span>${esc(e.code)}${e.warn ? "  chatter" : ""}</span>
    </div>`;
}

function renderKeyTestStats() {
  const test = state.keyTest,
    layout = state.route === "device" ? hero?.layout : keyTestView?.layout;
  if (!layout || !$("#ktFigs")) return;
  const lastKey = test.last
    ? `<span class="kbd" style="height:28px;font-size:13px">${esc(test.last)}</span>`
    : "–";
  const chatterHint = test.chatter ? `<em>Check the switch that chattered</em>` : "";
  $("#ktFigs").innerHTML = `
    <div class="fig">
      <small>Keys tested</small><b>${test.tested.size}<i>of ${layout.keys.length}</i></b>
    </div>
    <div class="fig"><small>Presses</small><b>${test.count}</b></div>
    <div class="fig"><small>Chatter</small><b>${test.chatter}</b>${chatterHint}</div>
    <div class="fig"><small>Last key</small><b style="font-size:20px">${lastKey}</b></div>`;

  const events = test.events.slice(-LOG_LINES).reverse();
  $("#ktLog").innerHTML = events.length
    ? events.map(logLine).join("")
    : `<div><span class="dim">Waiting for a key</span></div>`;

  if (test.outside.size) {
    const keys = [...test.outside].map((c) => `<span class="kbd">${esc(c)}</span>`).join(" ");
    $("#ktOutside").innerHTML = `
      <p class="sub" style="margin:16px 0 0">
        Not on this layout: ${keys}. If that’s wrong, try another layout
      </p>`;
  } else {
    $("#ktOutside").innerHTML = "";
  }
}

function bindKeyTestControls() {
  $("#ktReset").onclick = () => {
    resetKeyTest();
    renderKeyTestStats();
    markDirty();
  };
  const m = $("#ktMatrix");
  if (m) m.onchange = () => (m.checked ? startMatrix() : stopMatrix());
  renderKeyTestStats();
}

export function tabKeyTest(el, kb) {
  el.innerHTML = keyTestMarkup(!!kb.matrix);
  bindKeyTestControls();
}

let keyTestView = null;

export function pageKeyTest(page) {
  const kb = state.cur;
  const useDev = !!kb;
  page.innerHTML = `
    <h1>Key test</h1>
    <p class="lede">
      Check that every key registers once and only once. This works with any keyboard, connected
      to allkeebs or not.
    </p>
    <div class="hero"><canvas id="ktCanvas"></canvas></div>
    <div class="layout-row" id="ktLayout"></div>
    <div id="ktBody" style="margin-top:24px"></div>`;
  keyTestView = new KeyboardView($("#ktCanvas"));
  const setL = () => {
    const layout =
      useDev && state.keytestLayout === "device"
        ? layoutFor(kb)
        : presetLayout(state.keytestLayout === "device" ? "100" : state.keytestLayout);
    keyTestView.setLayout(layout);
  };
  const row = () => {
    const picked = state.keytestLayout;
    const deviceButton = useDev
      ? `<button data-k="device" class="${picked === "device" ? "on accent" : ""}">${esc(kb.name)}</button>`
      : "";
    const presetButtons = PRESET_IDS.map(
      (id) => `<button data-k="${id}" class="${picked === id ? "on" : ""}">${id}%</button>`,
    ).join("");
    $("#ktLayout").innerHTML = `
      <span>Layout</span>
      <div class="caps">${deviceButton}${presetButtons}</div>`;
    $$("[data-k]", $("#ktLayout")).forEach(
      (b) =>
        (b.onclick = () => {
          state.keytestLayout = b.dataset.k;
          store.set("keytest.layout", state.keytestLayout);
          setL();
          row();
          resetKeyTest();
          renderKeyTestStats();
          markDirty();
        }),
    );
  };
  if (!useDev && state.keytestLayout === "device") state.keytestLayout = "100";
  setL();
  row();
  views.push({ view: keyTestView, kind: "plain", state: keyTestState });
  $("#ktBody").innerHTML = keyTestMarkup(false);
  bindKeyTestControls();
}

let matrixTimer = null;

function startMatrix() {
  const kb = state.cur;
  if (!kb?.matrix) return;
  stopMatrix();
  const tick = async () => {
    try {
      const on = await kb.matrix.read();
      for (const i of on)
        if (!state.keyTest.mdown.has(i)) {
          state.keyTest.tested.add(i);
          state.keyTest.count++;
          state.keyTest.last = hero.layout.keys[i]?.label || "Matrix key";
        }
      state.keyTest.mdown = on;
      markDirty();
      renderKeyTestStats();
    } catch (e) {
      log("Matrix: " + e.message);
      stopMatrix();
      toast("Stopped reading the matrix. " + e.message, "bad");
      return;
    }
    matrixTimer = setTimeout(tick, 40);
  };
  tick();
}

export function stopMatrix() {
  clearTimeout(matrixTimer);
  matrixTimer = null;
  if (state.keyTest) state.keyTest.mdown = new Set();
}

const inKeyTest = () =>
  state.route === "key-test" || (state.route === "device" && state.tab === "keytest");

function handleKey(e, down) {
  if (recording) return recordKey(e, down);
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && !inKeyTest()) return;
  const t = performance.now() / 1000,
    layout = state.route === "key-test" ? keyTestView?.layout : hero?.layout;
  if (inKeyTest()) {
    e.preventDefault();
    const test = state.keyTest,
      key = layout?.byCode[e.code],
      now = performance.now();
    const prev = test.events[test.events.length - 1],
      dt = prev ? `+${Math.min(9999, Math.round(now - prev.t))}` : "0";
    let warn = false;
    if (down) {
      if (e.repeat) return;
      test.count++;
      test.last = e.code;
      if (test.lastUp[e.code] && now - test.lastUp[e.code] < 30) {
        test.chatter++;
        warn = true;
      }
      if (key) {
        test.down.add(key.i);
        test.tested.add(key.i);
      } else test.outside.add(e.code);
    } else {
      test.lastUp[e.code] = now;
      if (key) test.down.delete(key.i);
    }
    test.events.push({
      t: now,
      dt: dt + " ms",
      type: down ? "down" : "up",
      code: e.code || e.key,
      warn,
    });
    if (test.events.length > 300) test.events.shift();
    renderKeyTestStats();
    markDirty();
    return;
  }
  if (down && !e.repeat && layout) {
    const key = layout.byCode[e.code];
    if (key) {
      addHit(layout, key.i, t);
      noteRealKey(t);
    }
  }
}

window.addEventListener("keydown", (e) => handleKey(e, true), true);

window.addEventListener("keyup", (e) => handleKey(e, false), true);

window.addEventListener("blur", () => {
  if (state.keyTest) state.keyTest.down.clear();
  markDirty();
});
