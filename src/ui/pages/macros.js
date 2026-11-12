// Macros tab: edit steps by hand or record them from the keyboard you're typing on.

import { VIA_DELAY_PROTOCOL, VIA_FROM_EVENT, store } from "../../devices.js";
import { $, $$, clamp, esc, icons, toast } from "../dom.js";
import { renderTab } from "./device.js";
import { macroPanels } from "../extensions.js";
import { setPending } from "../pending.js";
import { state } from "../state.js";

function basicKeyOptions(kb) {
  const groups = kb.macros.picker;
  const NAMES = {
    letters: "Letters",
    numbers: "Numbers",
    symbols: "Symbols",
    function: "Function",
    navigation: "Navigation",
    keypad: "Keypad",
    modifiers: "Modifiers",
    media: "Media",
  };
  const describe = kb.macros.describe;
  // Macros can only send basic HID keycodes, so anything above 0xff is left out.
  return groups
    .filter((g) => NAMES[g.id])
    .map((g) => {
      const options = g.keycodes
        .filter((c) => c <= 0xff)
        .map((c) => `<option value="${c}">${esc(describe(c).label)}</option>`)
        .join("");
      return `<optgroup label="${NAMES[g.id]}">${options}</optgroup>`;
    })
    .join("");
}

const STEP_LABELS = {
  text: "Type",
  tap: "Press",
  down: "Hold",
  up: "Release",
  delay: "Wait (ms)",
  raw: "Raw",
};

// A one-line summary of a macro for the slot list, e.g. “hello” hold Ctrl C release Ctrl
function summarise(acts, describe) {
  return acts
    .map((x) => {
      if (x.type === "text") return `“${x.text}”`;
      if (x.type === "delay") return `${x.ms} ms`;
      if (x.type === "raw") return "raw";
      const verb = x.type === "down" ? "hold " : x.type === "up" ? "release " : "";
      return verb + describe(x.keycode).label;
    })
    .join(" ");
}

function slotButton(acts, i, macroEdit, describe) {
  const name = macroEdit.names[i] || `Macro ${i}`;
  return `
    <button class="mitem ${i === macroEdit.sel ? "on" : ""}" data-m="${i}">
      <span class="kbd">M${i}</span>
      <span><em>${esc(name)}</em><small>${esc(summarise(acts, describe)) || "Empty"}</small></span>
    </button>`;
}

function stepRow(x, i, keyOptions) {
  let field;
  if (x.type === "text") {
    field = `<input class="inp" data-i="${i}" data-f="text" value="${esc(x.text)}" placeholder="Text to type">`;
  } else if (x.type === "delay") {
    field = `
      <input class="inp num" type="number" min="0" max="9999" step="10"
        data-i="${i}" data-f="ms" value="${x.ms}" style="max-width:120px">`;
  } else if (x.type === "raw") {
    const hex = x.bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ");
    field = `<span class="mono">${hex}</span>`;
  } else {
    field = `<select class="inp" data-i="${i}" data-f="keycode">${keyOptions}</select>`;
  }
  return `
    <div class="step">
      <span>${STEP_LABELS[x.type]}</span>
      ${field}
      <span class="ctl">
        <button class="icon-btn" data-mv="${i}:-1" aria-label="Move up">${icons.up}</button>
        <button class="icon-btn" data-mv="${i}:1" aria-label="Move down">${icons.down}</button>
        <button class="icon-btn" data-del="${i}" aria-label="Remove">${icons.x}</button>
      </span>
    </div>`;
}

export async function tabMacros(el, kb) {
  if (!state.macroEdit || state.macroEdit.adapter !== kb || !state.macroEdit.list) {
    state.macroEdit = {
      adapter: kb,
      list: null,
      saved: null,
      sel: 0,
      names: store.get("macronames." + kb.key, {}),
    };
    el.innerHTML = `<div class="panel">
        <h2>Macros</h2>
        <p class="sub">Reading the macros stored on the keyboard</p>
      </div>`;
    try {
      const list = await kb.macros.read();
      state.macroEdit.list = list.map((m) => m.map((x) => ({ ...x })));
      state.macroEdit.saved = JSON.stringify(list);
    } catch (e) {
      el.innerHTML = `<div class="empty"><b>Couldn’t read the macros</b>${esc(e.message)}</div>`;
      return;
    }
    if (state.tab !== "macros") return;
  }
  const macroEdit = state.macroEdit,
    m = macroEdit.list[macroEdit.sel] || [],
    used = macroEdit.list.reduce((n, acts) => n + kb.macros.encode(acts).length + 1, 0),
    size = kb.macros.size;
  const delays = (kb.macros.proto || 0) >= VIA_DELAY_PROTOCOL,
    opts = basicKeyOptions(kb);
  const describe = kb.macros.describe;
  const sel = macroEdit.sel;
  const slots = macroEdit.list.map((acts, i) => slotButton(acts, i, macroEdit, describe)).join("");
  const memoryUsed = Math.min(100, (used / Math.max(1, size)) * 100);
  const extra = { kb, slot: sel, steps: m, name: macroEdit.names[sel] || `Macro ${sel}` };
  const steps = m.length
    ? m.map((x, i) => stepRow(x, i, opts)).join("")
    : `<div class="empty">No steps. Press Record and type a shortcut, or add steps below</div>`;
  const recordPauses = delays
    ? `<label class="switch" style="gap:10px">
        <span>Record pauses</span>
        <input type="checkbox" id="mDelays" ${store.get("recDelays", true) ? "checked" : ""}><i></i>
      </label>`
    : "";

  el.innerHTML = `
    <div class="mgrid">
      <div class="panel">
        <h2>Slots</h2>
        <p class="sub">${macroEdit.list.length} on the keyboard</p>
        <div class="mlist">${slots}</div>
        <div style="margin-top:16px">
          <div class="slider-head"><span>Memory</span><output>${used} / ${size} B</output></div>
          <div class="bar ${used > size ? "over" : ""}"><i style="width:${memoryUsed}%"></i></div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head">
          <input class="inp" id="mName" value="${esc(macroEdit.names[sel] || "")}" placeholder="Macro ${sel}"
            style="max-width:280px;font-size:15px;font-weight:500">
          <span class="kbd">M${sel}</span>
        </div>
        <div class="btns" style="margin-bottom:12px;align-items:center">
          <button class="btn sm" id="mRec">${icons.rec}Record</button>
          ${recordPauses}
          <button class="btn ghost sm" id="mClear" style="margin-left:auto">${icons.trash}Clear</button>
        </div>
        <div class="steps">${steps}</div>
        <div class="add-row">
          <span class="sub" style="margin:0">Add</span>
          <button class="btn sm" data-add="text">Text</button>
          <button class="btn sm" data-add="tap">Key press</button>
          <button class="btn sm" data-add="down">Hold</button>
          <button class="btn sm" data-add="up">Release</button>
          ${delays ? `<button class="btn sm" data-add="delay">Wait</button>` : ""}
        </div>
        <p class="sub" style="margin:16px 0 0">
          Text is typed as if the computer uses a US layout. On AZERTY or other layouts, use key
          presses. Only plain ASCII characters can be typed${delays ? "" : ". This firmware doesn’t support waits"}.
          To run a macro, put M${sel} on a key in the Keymap tab.
        </p>
        ${macroPanels.map((p) => p.html(extra)).join("")}
      </div>
    </div>`;
  $$("select[data-f=keycode]", el).forEach((s) => (s.value = String(m[+s.dataset.i].keycode)));
  const changed = () => {
    setPending(
      "macros",
      "Macros",
      async () => {
        await kb.macros.write(macroEdit.list);
        macroEdit.saved = JSON.stringify(macroEdit.list);
      },
      () => {
        macroEdit.list = JSON.parse(macroEdit.saved);
      },
    );
  };
  $$("[data-m]", el).forEach(
    (b) =>
      (b.onclick = () => {
        stopRecording();
        macroEdit.sel = +b.dataset.m;
        renderTab();
      }),
  );
  $("#mName").oninput = (e) => {
    macroEdit.names[macroEdit.sel] = e.target.value;
    store.set("macronames." + kb.key, macroEdit.names);
    $(`[data-m="${macroEdit.sel}"] em`).textContent = e.target.value || "Macro " + macroEdit.sel;
  };
  $$("[data-f]", el).forEach(
    (inp) =>
      (inp.oninput = inp.onchange =
        () => {
          const x = m[+inp.dataset.i],
            f = inp.dataset.f;
          if (f === "text") {
            const clean = inp.value.replace(/[^\x20-\x7e]/g, "");
            if (clean !== inp.value) {
              inp.value = clean;
              toast(
                "Accents and symbols outside plain ASCII can’t be typed by a keyboard macro",
                "bad",
              );
            }
            x.text = clean;
          } else if (f === "ms") x.ms = clamp(parseInt(inp.value, 10) || 0, 0, 9999);
          else x.keycode = +inp.value;
          changed();
        }),
  );
  $$("[data-mv]", el).forEach(
    (b) =>
      (b.onclick = () => {
        const [i, d] = b.dataset.mv.split(":").map(Number),
          j = i + d;
        if (j < 0 || j >= m.length) return;
        [m[i], m[j]] = [m[j], m[i]];
        changed();
        renderTab();
      }),
  );
  $$("[data-del]", el).forEach(
    (b) =>
      (b.onclick = () => {
        m.splice(+b.dataset.del, 1);
        changed();
        renderTab();
      }),
  );
  $$("[data-add]", el).forEach(
    (b) =>
      (b.onclick = () => {
        const t = b.dataset.add;
        m.push(
          t === "text"
            ? { type: "text", text: "" }
            : t === "delay"
              ? { type: "delay", ms: 100 }
              : { type: t, keycode: t === "tap" ? 4 : 0xe0 },
        );
        macroEdit.list[macroEdit.sel] = m;
        changed();
        renderTab();
      }),
  );
  $("#mClear").onclick = () => {
    macroEdit.list[macroEdit.sel] = [];
    changed();
    renderTab();
  };
  const dl = $("#mDelays");
  if (dl) dl.onchange = () => store.set("recDelays", dl.checked);
  $("#mRec").onclick = () => (recording ? stopRecording() : startRecording());
  for (const p of macroPanels) p.bind(el, extra);
}

export let recording = null;

function startRecording() {
  const macroEdit = state.macroEdit;
  macroEdit.list[macroEdit.sel] = [];
  recording = { last: 0 };
  renderTab();
  const b = $("#mRec");
  if (b) {
    b.classList.add("rec-on");
    b.innerHTML = `${icons.stop}Stop`;
  }
  toast("Recording. Type the shortcut, then press Stop");
}

export function stopRecording() {
  if (!recording) return;
  recording = null;
  const macroEdit = state.macroEdit;
  if (!macroEdit) return;
  const A = macroEdit.list[macroEdit.sel],
    out = [];
  for (let i = 0; i < A.length; i++) {
    const x = A[i],
      y = A[i + 1],
      z = A[i + 2];
    if (x.type === "down" && y?.type === "up" && y.keycode === x.keycode) {
      out.push({ type: "tap", keycode: x.keycode });
      i++;
      continue;
    }
    if (
      x.type === "down" &&
      y?.type === "delay" &&
      y.ms < 250 &&
      z?.type === "up" &&
      z.keycode === x.keycode
    ) {
      out.push({ type: "tap", keycode: x.keycode });
      i += 2;
      continue;
    }
    out.push(x);
  }
  while (out.length && out[out.length - 1].type === "delay") out.pop();
  macroEdit.list[macroEdit.sel] = out;
  setPending(
    "macros",
    "Macros",
    async () => {
      await state.macroEdit.adapter.macros.write(state.macroEdit.list);
      state.macroEdit.saved = JSON.stringify(state.macroEdit.list);
    },
    () => {
      state.macroEdit.list = JSON.parse(state.macroEdit.saved);
    },
  );
  if (state.tab === "macros") renderTab();
}

export function recordKey(e, down) {
  e.preventDefault();
  e.stopPropagation();
  if (down && e.repeat) return;
  const code = VIA_FROM_EVENT(e.code);
  if (code == null || code > 0xff) return;
  const macroEdit = state.macroEdit,
    A = macroEdit.list[macroEdit.sel],
    now = performance.now(),
    delays =
      (macroEdit.adapter.macros.proto || 0) >= VIA_DELAY_PROTOCOL && store.get("recDelays", true);
  if (delays && recording.last && A.length) {
    const gap = Math.round(now - recording.last);
    if (gap > 40) A.push({ type: "delay", ms: Math.min(gap, 9999) });
  }
  recording.last = now;
  A.push({ type: down ? "down" : "up", keycode: code });
  clearTimeout(recordKey.t);
  recordKey.t = setTimeout(() => {
    if (recording && state.tab === "macros") {
      renderTab();
      const b = $("#mRec");
      if (b) {
        b.classList.add("rec-on");
        b.innerHTML = `${icons.stop}Stop`;
      }
    }
  }, 60);
}
