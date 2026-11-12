// Keymap tab: click a key on the drawing, pick what it should do.

import { loadKeymapLabels } from "../connect.js";
import { $, $$, esc, icons, toast } from "../dom.js";
import { markDirty } from "../loop.js";
import { hero } from "./device.js";
import { dropPending, setPending } from "../pending.js";
import { state } from "../state.js";

export function keymapState(i) {
  const keymapEdit = state.keymapEdit,
    kb = state.cur;
  if (!keymapEdit || !keymapEdit.layers) return null;
  const key = `${keymapEdit.layer}:${i}`,
    code = keymapEdit.edits.has(key)
      ? keymapEdit.edits.get(key)
      : keymapEdit.layers[keymapEdit.layer]?.[i];
  const d = code == null ? { label: "" } : kb.keymap.describe(code);
  return {
    label: code === 0 ? "" : d.label,
    sub: null,
    selected: keymapEdit.sel === i,
    changed: keymapEdit.edits.has(key),
  };
}

export async function tabKeymap(el, kb) {
  if (!state.keymapEdit || state.keymapEdit.adapter !== kb)
    state.keymapEdit = {
      adapter: kb,
      layers: null,
      layer: 0,
      sel: null,
      group: "letters",
      q: "",
      edits: new Map(),
      error: null,
    };
  const keymapEdit = state.keymapEdit;
  const layerButtons = Array.from({ length: kb.keymap.layers }, (_, l) => {
    const on = l === keymapEdit.layer ? "on" : "";
    return `<button data-layer="${l}" class="${on}">${l}</button>`;
  }).join("");

  el.innerHTML = `
    <div class="grid2">
      <div class="panel">
        <div class="panel-head">
          <div>
            <h2>Layer</h2>
            <p class="sub">Click a key on the keyboard above, then pick what it should do</p>
          </div>
        </div>
        <div class="caps" id="kmLayers">${layerButtons}</div>
        <p class="sub" style="margin:12px 0 0">
          Layer 0 is what you type normally. The others switch on with Fn or a layer key.
        </p>
      </div>
      <div class="panel" id="kmKey"></div>
    </div>`;
  $$("[data-layer]", el).forEach(
    (b) =>
      (b.onclick = () => {
        keymapEdit.layer = +b.dataset.layer;
        $$("[data-layer]", el).forEach((x) => x.classList.toggle("on", x === b));
        renderKeymapPanel();
        markDirty();
      }),
  );
  renderKeymapPanel();
  if (!keymapEdit.layers) {
    try {
      const layers = kb.keymapCache && !kb.demo ? kb.keymapCache : await kb.keymap.read();
      if (!layers?.length) throw new Error("The keyboard returned an empty keymap");
      keymapEdit.layers = layers;
    } catch (e) {
      toast("Couldn’t read the keymap. " + e.message, "bad");
      keymapEdit.error = e?.message || "Unknown error";
    }
    renderKeymapPanel();
    markDirty();
  }
}

export function renderKeymapPanel() {
  const el = $("#kmKey");
  if (!el) return;
  const keymapEdit = state.keymapEdit,
    kb = state.cur,
    layout = hero.layout;
  if (keymapEdit.error) {
    el.innerHTML = `<h2>Key</h2><p class="sub">Couldn’t read the keymap: ${esc(keymapEdit.error)}</p><button class="btn sm" id="kmRetry">Retry</button>`;
    $("#kmRetry").onclick = () => {
      keymapEdit.error = null;
      tabKeymap($("#tab"), kb);
    };
    return;
  }
  if (!keymapEdit.layers) {
    el.innerHTML = `<h2>Key</h2><p class="sub">Reading the keymap from the keyboard</p>`;
    return;
  }
  if (keymapEdit.sel == null || !layout.keys[keymapEdit.sel]) {
    el.innerHTML = `<h2>Key</h2>
      <p class="sub">No key selected</p>
      <div class="empty">Click any key on the keyboard above</div>`;
    return;
  }
  const k = layout.keys[keymapEdit.sel],
    key = `${keymapEdit.layer}:${keymapEdit.sel}`,
    cur = keymapEdit.edits.has(key)
      ? keymapEdit.edits.get(key)
      : keymapEdit.layers[keymapEdit.layer]?.[keymapEdit.sel],
    d = kb.keymap.describe(cur);
  const groups = kb.keymap.picker.filter((g) => g.keycodes.length);
  if (!groups.some((g) => g.id === keymapEdit.group)) keymapEdit.group = groups[0]?.id;
  const q = keymapEdit.q.trim().toLowerCase();
  const list = q
    ? groups
        .flatMap((g) => g.keycodes)
        .filter((c) => {
          const x = kb.keymap.describe(c);
          return (x.label + " " + x.title).toLowerCase().includes(q);
        })
        .slice(0, 160)
    : groups.find((g) => g.id === keymapEdit.group)?.keycodes || [];
  const NAMES = {
    letters: "Letters",
    numbers: "Numbers",
    symbols: "Symbols",
    function: "Function",
    navigation: "Navigation",
    keypad: "Keypad",
    modifiers: "Modifiers",
    media: "Media",
    special: "Special",
    layers: "Layers",
    macros: "Macros",
    lighting: "Lighting",
    custom: "Board",
  };
  // Show the matrix position next to the title when we know it; it helps when a key misbehaves.
  const position =
    k.mrow != null
      ? `<span class="mono" style="color:var(--text-3)">${k.mrow},${k.mcol}</span>`
      : "";
  const undo = keymapEdit.edits.has(key)
    ? `<button class="btn ghost sm" id="kmUndo">${icons.reset}Undo</button>`
    : "";
  const groupTabs = groups
    .map((g) => {
      const on = g.id === keymapEdit.group ? "on" : "";
      return `<button data-g="${g.id}" class="${on}">${NAMES[g.id] || g.id}</button>`;
    })
    .join("");
  const keys = list
    .map((c) => {
      const x = kb.keymap.describe(c);
      const on = c === cur ? "cur" : "";
      return `<button data-code="${c}" title="${esc(x.title)}" class="${on}">${esc(x.label)}</button>`;
    })
    .join("");

  el.innerHTML = `
    <div class="panel-head">
      <div>
        <h2>Key ${position}</h2>
        <p class="sub">
          Layer ${keymapEdit.layer} · now
          <span class="kbd" title="${esc(d.title)}">${esc(d.label || "none")}</span>
        </p>
      </div>
      ${undo}
    </div>
    <div class="search" style="margin:0 0 12px;max-width:none">
      ${icons.search}
      <input class="inp" id="kmQ" placeholder="Search" value="${esc(keymapEdit.q)}">
    </div>
    ${q ? "" : `<div class="picker-tabs">${groupTabs}</div>`}
    <div class="kgrid">${keys || `<span class="sub">Nothing matches</span>`}</div>`;
  const qi = $("#kmQ");
  qi.oninput = () => {
    keymapEdit.q = qi.value;
    const pos = qi.selectionStart;
    renderKeymapPanel();
    const n = $("#kmQ");
    n.focus();
    n.setSelectionRange(pos, pos);
  };
  $$("[data-g]", el).forEach(
    (b) =>
      (b.onclick = () => {
        keymapEdit.group = b.dataset.g;
        renderKeymapPanel();
      }),
  );
  const u = $("#kmUndo");
  if (u)
    u.onclick = () => {
      keymapEdit.edits.delete(key);
      queueKeymap();
      renderKeymapPanel();
      markDirty();
    };
  $$("[data-code]", el).forEach(
    (b) =>
      (b.onclick = () => {
        const code = +b.dataset.code;
        if (code === keymapEdit.layers[keymapEdit.layer]?.[keymapEdit.sel])
          keymapEdit.edits.delete(key);
        else keymapEdit.edits.set(key, code);
        queueKeymap();
        renderKeymapPanel();
        markDirty();
      }),
  );
}

function queueKeymap() {
  const keymapEdit = state.keymapEdit,
    kb = state.cur;
  if (!keymapEdit.edits.size) {
    dropPending("km");
    return;
  }
  setPending(
    "km",
    `${keymapEdit.edits.size} ${keymapEdit.edits.size === 1 ? "key" : "keys"}`,
    async () => {
      for (const [key, code] of [...keymapEdit.edits]) {
        const [l, i] = key.split(":").map(Number);
        const got = await kb.keymap.set(l, i, code);
        keymapEdit.layers[l][i] = got ?? code;
        keymapEdit.edits.delete(key);
      }
      if (keymapEdit.layers[0]) loadKeymapLabels(kb);
    },
    () => {
      keymapEdit.edits.clear();
    },
  );
}
