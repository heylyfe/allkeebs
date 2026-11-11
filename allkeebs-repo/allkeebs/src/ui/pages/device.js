// A keyboard's page: header, the big keyboard drawing, the layout picker and the tabs.

import { store } from "../../devices.js";
import { addHit } from "../../effects.js";
import { PRESET_IDS, sizeClass } from "../../layouts.js";
import { KeyboardView } from "../../render.js";
import { removeDevice } from "../connect.js";
import { $, $$, esc, icons } from "../dom.js";
import { autoLayout, heroLayout, overrideOf } from "../layout-choice.js";
import { markDirty, noteRealKey, views } from "../loop.js";
import { keymapState, renderKeymapPanel, tabKeymap } from "./keymap.js";
import { keyTestState, resetKeyTest, stopMatrix, tabKeyTest } from "./keytest.js";
import { tabLighting } from "./lighting.js";
import { stopRecording, tabMacros } from "./macros.js";
import { tabOverview } from "./overview.js";
import { currentProfile, state } from "../state.js";

function tabsFor(kb) {
  const t = [["overview", "Overview"]];
  if (kb.lighting) t.push(["lighting", "Lighting"]);
  if (kb.keymap) t.push(["keymap", "Keymap"]);
  if (kb.macros) t.push(["macros", "Macros"]);
  t.push(["keytest", "Key test"]);
  return t;
}

export function pageDevice(page) {
  const kb = state.cur;
  const tabs = tabsFor(kb);
  if (!tabs.some(([id]) => id === state.tab)) state.tab = "overview";
  const connection = kb.demo ? "Simulated, nothing is sent anywhere" : esc(kb.connection);
  const tabButtons = tabs
    .map(([id, label]) => {
      const on = state.tab === id ? "on" : "";
      return `<button role="tab" data-tab="${id}" class="${on}">${label}</button>`;
    })
    .join("");

  page.innerHTML = `
    <div class="crumb">
      <button class="linkish crumb-link" data-go="keyboards">Keyboards</button> / ${esc(kb.name)}
    </div>
    <div class="head-row">
      <div>
        <h1>${esc(kb.name)}</h1>
        <div class="meta-line">
          <span class="${kb.demo ? "" : "ok"}">${icons.plug}${connection}</span>
          <span>${esc(kb.brand)} driver</span>
          ${kb.proto ? `<span>VIA protocol ${kb.proto}</span>` : ""}
        </div>
      </div>
      <button class="btn sm" id="discBtn">${icons.unplug}${kb.demo ? "Remove" : "Disconnect"}</button>
    </div>
    <div class="hero"><canvas id="hero"></canvas></div>
    <div class="layout-row" id="layoutRow"></div>
    <div class="tabs" role="tablist">${tabButtons}</div>
    <div id="tab"></div>`;
  $("#discBtn").onclick = () => removeDevice(kb);
  $$("[data-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        state.tab = b.dataset.tab;
        stopRecording();
        stopMatrix();
        $$("[data-tab]").forEach((x) => x.classList.toggle("on", x === b));
        mountHero();
        renderLayoutRow();
        renderTab();
      }),
  );
  mountHero();
  renderLayoutRow();
  renderTab();
}

export let hero = null;

function mountHero() {
  views.length = 0;
  const cv = $("#hero");
  hero = new KeyboardView(cv, { handleKey: heroKey });
  hero.setLayout(heroLayout());
  cv.classList.toggle("clickable", true);
  const kind = state.tab === "keymap" || state.tab === "keytest" ? "plain" : "lit";
  views.push({
    view: hero,
    kind,
    profile: currentProfile,
    simKey: () => "hero",
    state: kind === "plain" ? (state.tab === "keymap" ? keymapState : keyTestState) : null,
  });
  markDirty();
}

function heroKey(i, e) {
  const t = performance.now() / 1000;
  if (state.tab === "keymap") {
    if (state.keymapEdit) {
      state.keymapEdit.sel = i;
      renderKeymapPanel();
      markDirty();
    }
    return;
  }
  if (state.tab === "keytest") return;
  addHit(hero.layout, i, t);
  noteRealKey(t);
}

function renderLayoutRow() {
  const el = $("#layoutRow");
  if (!el) return;
  const kb = state.cur,
    o = overrideOf(kb),
    auto = autoLayout(kb);
  const keymapNote =
    state.tab === "keymap" && kb.exactLayout && o !== "auto"
      ? " Keymap editing always uses the exact layout."
      : "";
  const presets = PRESET_IDS.map(
    (id) => `<button data-l="${id}" class="${o === id ? "on" : ""}">${id}%</button>`,
  ).join("");

  let why;
  if (o !== "auto") {
    why = `Set by you. Auto would pick ${esc(auto.exact ? "the exact layout" : auto.layout.name)}`;
  } else if (auto.why) {
    const picked = auto.exact ? `${sizeClass(auto.layout)} exact` : auto.layout.name;
    why = `Auto picked <b>${esc(picked)}</b> from ${esc(auto.why)}`;
  } else {
    why = "Couldn’t tell the size, so this shows 100%. Pick yours";
  }

  el.innerHTML = `
    <span>Layout</span>
    <div class="caps" role="radiogroup" aria-label="Layout">
      <button data-l="auto" class="${o === "auto" ? "on accent" : ""}">Auto</button>${presets}
    </div>
    <span class="why">${why}.${keymapNote}</span>`;
  $$("[data-l]", el).forEach(
    (b) =>
      (b.onclick = () => {
        store.set("layout." + kb.key, b.dataset.l);
        hero.setLayout(heroLayout());
        renderLayoutRow();
        resetKeyTest();
        markDirty();
        if (state.tab === "lighting") renderTab();
        if (kb.demo && state.tab === "keymap") {
          state.keymapEdit = null;
          renderTab();
        }
      }),
  );
}

export function refreshCurrentTab() {
  if (state.route === "device" && state.cur) {
    if (hero) hero.setLayout(heroLayout());
    renderTab();
    markDirty();
  }
}

export function renderTab() {
  const el = $("#tab");
  if (!el) return;
  views.splice(1);
  ({
    overview: tabOverview,
    lighting: tabLighting,
    keymap: tabKeymap,
    macros: tabMacros,
    keytest: tabKeyTest,
  })[state.tab](el, state.cur);
}
