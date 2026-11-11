// The app frame (sidebar, theme switch) and the router that swaps pages.

import { refreshAccent } from "../render.js";
import { drawAscii } from "./ascii.js";
import { openDevice } from "./connect.js";
import { $, $$, LOGO, VERSION, esc, icons } from "./dom.js";
import { markDirty, views } from "./loop.js";
import { pageAbout } from "./pages/about.js";
import { pageDevice } from "./pages/device.js";
import { pageHome } from "./pages/home.js";
import { pageKeyTest, stopMatrix } from "./pages/keytest.js";
import { stopRecording } from "./pages/macros.js";
import { pagePrefs } from "./pages/preferences.js";
import { pageSupported } from "./pages/supported.js";
import { renderPending } from "./pending.js";
import { savePrefs, state } from "./state.js";

function resolvedTheme() {
  return state.prefs.theme === "system"
    ? matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark"
    : state.prefs.theme;
}

export function applyTheme() {
  document.documentElement.dataset.theme = resolvedTheme();
  refreshAccent();
  document.documentElement.classList.toggle("reduced", !!state.prefs.reduced);
  const b = $("#themeBtn");
  if (b) {
    const dark = resolvedTheme() === "dark";
    b.innerHTML = `${dark ? icons.sun : icons.moon}<span>${dark ? "Light mode" : "Dark mode"}</span>`;
    b.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
  }
  markDirty();
}

export function shell() {
  document.body.innerHTML = `
    <div class="shell">
      <aside class="side">
        <div class="brand">${LOGO}<b>allkeebs</b><span class="ver mono">${VERSION}</span></div>
        <nav class="nav">
          <button data-go="keyboards">${icons.keyboard}<span>Keyboards</span></button>
          <button data-go="key-test">${icons.test}<span>Key test</span></button>
          <button data-go="supported">${icons.list}<span>Supported keyboards</span></button>
        </nav>
        <div class="side-label">Your keyboards</div>
        <div id="sideDevices"></div>
        <div class="side-foot">
          <button data-go="preferences">${icons.prefs}<span>Preferences</span></button>
          <button data-go="about">${icons.about}<span>About and credits</span></button>
          <button class="theme-btn" id="themeBtn"></button>
        </div>
      </aside>
      <main class="main">
        <div class="ascii" aria-hidden="true"></div>
        <div class="page" id="page"></div>
      </main>
    </div>
    <div class="pending" id="pending" hidden></div>
    <div class="toasts" id="toasts" aria-live="polite"></div>`;
  $("#themeBtn").onclick = () => {
    state.prefs.theme = resolvedTheme() === "dark" ? "light" : "dark";
    savePrefs();
    applyTheme();
    if (state.route === "preferences") render();
  };
  applyTheme();
  drawAscii();
}

function sideDevice(kb) {
  const on = state.route === "device" && state.cur === kb ? "on" : "";
  return `
    <button class="side-dev ${on}" data-dev="${kb.id}">
      <i class="dot ${kb.demo ? "demo" : ""}"></i>
      <span><em>${esc(kb.name)}</em><small>${esc(kb.demo ? "Simulated" : kb.connection)}</small></span>
    </button>`;
}

export function renderSide() {
  // A keyboard's own page counts as being under "Keyboards".
  const section = state.route === "device" ? "keyboards" : state.route;
  $$(".side [data-go]").forEach((link) => link.classList.toggle("on", link.dataset.go === section));

  const el = $("#sideDevices");
  el.innerHTML = state.devices.length
    ? state.devices.map(sideDevice).join("")
    : `<div class="side-empty">None connected</div>`;
  $$("[data-dev]", el).forEach(
    (b) => (b.onclick = () => openDevice(state.devices.find((d) => d.id === b.dataset.dev))),
  );
}

export const ROUTES = ["keyboards", "device", "key-test", "supported", "preferences", "about"];

// Routing runs on state. The address bar follows when the page is allowed to change it,
// but nothing depends on that, because some viewers (the claude.ai preview among them)
// swallow in-page # links.
export function go(route) {
  state.route = route;
  try {
    if (location.hash !== "#" + route) history.replaceState(null, "", "#" + route);
  } catch {
    /* sandboxed */
  }
  render();
}

window.addEventListener("hashchange", () => {
  const r = location.hash.slice(1);
  if (ROUTES.includes(r) && r !== state.route) {
    state.route = r;
    render();
  }
});

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-go]");
  if (!t) return;
  e.preventDefault();
  go(t.dataset.go);
});

export function render() {
  let r = state.route || "keyboards";
  if (!ROUTES.includes(r)) r = "keyboards";
  if (r === "device" && !state.cur) r = "keyboards";
  state.route = r;
  stopRecording();
  views.length = 0;
  stopMatrix();
  const page = $("#page");
  page.style.animation = "none";
  void page.offsetWidth;
  page.style.animation = "";
  ({
    keyboards: pageHome,
    device: pageDevice,
    "key-test": pageKeyTest,
    supported: pageSupported,
    preferences: pagePrefs,
    about: pageAbout,
  })[r](page);
  renderSide();
  renderPending();
  window.scrollTo(0, 0);
}
