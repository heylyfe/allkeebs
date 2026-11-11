// Lighting tab: the profile gallery, the colour and speed controls, and every option from
// the board's own VIA menus.

import {
  evaluateViaCondition,
  viaNumberToBytes,
  viaValueToNumber,
} from "@openmouse/keyboard-protocol/via";
import { store } from "../../devices.js";
import {
  FX,
  GROUPS,
  PRESETS,
  hsv,
  matchEffect,
  presetWords,
  rgbToHsv,
  toHex,
} from "../../effects.js";
import { rankByMeaning } from "../../search.js";
import { KeyboardView } from "../../render.js";
import { $, $$, esc, icons, toast } from "../dom.js";
import { layoutFor } from "../layout-choice.js";
import { markDirty, views } from "../loop.js";
import { dropPending, setPending } from "../pending.js";
import {
  PROFILE_FIELDS,
  currentProfile,
  profiles,
  profilesById,
  saveProfiles,
  state,
} from "../state.js";

function lightingSnapshot() {
  if (!state.lightSnap)
    state.lightSnap = {
      id: state.profileId,
      data: JSON.stringify(profiles.map((p) => PROFILE_FIELDS.map((f) => p[f]))),
    };
}

function restoreLighting() {
  const s = state.lightSnap;
  if (!s) return;
  state.profileId = s.id;
  const d = JSON.parse(s.data);
  profiles.forEach((p, i) => PROFILE_FIELDS.forEach((f, j) => (p[f] = d[i][j])));
  saveProfiles();
  store.set("profile", state.profileId);
  state.lightSnap = null;
}

function hardwareEffectFor(kb, p) {
  const L = kb.lighting;
  if (!L?.effects) return null;
  if (p.fw) {
    const f = L.effects.find((e) => e.name === p.fw);
    if (f) return f;
  }
  return matchEffect(p, L.effects);
}

function queueLighting() {
  const kb = state.cur,
    p = currentProfile();
  state.off = false;
  setPending(
    "light",
    `Lighting: ${p.name}`,
    async () => {
      await kb.lighting.apply({ ...p }, hardwareEffectFor(kb, p));
    },
    restoreLighting,
  );
}

const PROFILES_PER_PAGE = 24;

// The group filter, then the search ranked by meaning ("calm sea", "spooky", "hacker").
function profileList() {
  const inGroup = profiles.filter((p) => state.lg === "all" || p.group === state.lg);
  return rankByMeaning(inGroup, state.lq, presetWords, (p) => p.name);
}

let miniObs = null;

export function tabLighting(el, kb) {
  const lighting = kb.lighting;
  if (!lighting) {
    const why = kb.notes[0] || "Its driver doesn’t change lighting yet.";
    el.innerHTML = `<div class="empty"><b>No lighting control for this keyboard</b>${esc(why)}</div>`;
    return;
  }
  const groupButtons = GROUPS.map(
    ([id, label]) =>
      `<button data-lg="${id}" class="${state.lg === id ? "on" : ""}">${label}</button>`,
  ).join("");
  const hasBoardMenus = lighting.kind === "via" && !lighting.guessed;

  el.innerHTML = `
    <div class="grid2">
      <div class="panel">
        <div class="panel-head">
          <div>
            <h2>Profiles</h2>
            <p class="sub">
              ${profiles.length} profiles in ${GROUPS.length - 1} groups. Previews are simulated;
              your keyboard plays its closest built-in effect
            </p>
          </div>
        </div>
        <div class="lfilter">
          <div class="caps scroll" id="lGroups">${groupButtons}</div>
          <div class="search">
            ${icons.search}
            <input class="inp" id="lQ" placeholder="Search" value="${esc(state.lq)}">
          </div>
        </div>
        <div class="pgrid" id="pgrid"></div>
        <div class="more" id="pMore"></div>
      </div>
      <div class="panel tune" id="tune"></div>
    </div>
    ${hasBoardMenus ? `<div class="panel" id="board" style="margin-top:16px"></div>` : ""}`;
  $$("[data-lg]", el).forEach(
    (b) =>
      (b.onclick = () => {
        state.lg = b.dataset.lg;
        $$("[data-lg]", el).forEach((x) => x.classList.toggle("on", x === b));
        fillProfiles(true);
      }),
  );
  $("#lQ").oninput = (e) => {
    state.lq = e.target.value;
    fillProfiles(true);
  };
  fillProfiles(false);
  renderTune();
  if ($("#board")) renderBoard();
}

function profileCard(p) {
  // Only show the effect name when the profile name doesn't already say it.
  const effect = FX[p.fx].name;
  const saysEffect = p.name.toLowerCase().includes(effect.toLowerCase());
  return `
    <button class="pcard ${p.id === state.profileId ? "on" : ""}" data-pid="${p.id}">
      <canvas></canvas>
      <div><b>${esc(p.name)}</b>${saysEffect ? "" : `<span>${esc(effect)}</span>`}</div>
    </button>`;
}

function fillProfiles(reset) {
  const grid = $("#pgrid");
  if (!grid) return;
  const layout = layoutFor(state.cur),
    list = profileList();
  const pages = Math.max(1, Math.ceil(list.length / PROFILES_PER_PAGE));
  if (reset) state.lpage = 0;
  state.lpage = Math.min(Math.max(0, state.lpage || 0), pages - 1);
  const first = state.lpage * PROFILES_PER_PAGE,
    shown = list.slice(first, first + PROFILES_PER_PAGE);

  views.splice(1);
  if (miniObs) miniObs.disconnect();
  miniObs = new IntersectionObserver((ents) => {
    for (const e of ents) {
      const v = views.find((x) => x.el === e.target);
      if (!v) continue;
      v.hidden = !e.isIntersecting;
      if (e.isIntersecting) v.drawn = false; // sized and on screen now: draw its still frame
    }
    markDirty();
  });
  grid.innerHTML = shown.length
    ? shown.map(profileCard).join("")
    : `<div class="empty" style="grid-column:1/-1">
        <b>No profile matches</b>Try another word or group
      </div>`;
  $$(".pcard", grid).forEach((b) => {
    const profile = profilesById.get(b.dataset.pid),
      view = new KeyboardView($("canvas", b), { mini: true });
    view.setLayout(layout);
    const v = {
      view,
      el: b,
      kind: "lit",
      mini: true,
      live: profile.id === state.profileId,
      profile: () => profile,
      simKey: () => "mini:" + profile.id,
    };
    views.push(v);
    miniObs.observe(b);
    // Cards hold a still frame and play while hovered, or while they're the chosen profile.
    b.onmouseenter = () => (v.live = true);
    b.onmouseleave = () => (v.live = profile.id === state.profileId);
    b.onclick = () => {
      lightingSnapshot();
      state.profileId = profile.id;
      store.set("profile", profile.id);
      $$(".pcard", grid).forEach((x) => x.classList.toggle("on", x === b));
      for (const other of views) if (other.mini) other.live = other === v;
      renderTune();
      queueLighting();
      markDirty();
    };
  });

  const more = $("#pMore");
  if (pages > 1) {
    more.innerHTML = `
      <button class="btn sm" id="pPrev" ${state.lpage === 0 ? "disabled" : ""}>Previous</button>
      <span class="sub">Page ${state.lpage + 1} of ${pages} · ${list.length} profiles</span>
      <button class="btn sm" id="pNext" ${state.lpage === pages - 1 ? "disabled" : ""}>Next</button>`;
    const turn = (by) => {
      state.lpage += by;
      fillProfiles(false);
      $("#pgrid")?.scrollIntoView({ block: "nearest" });
    };
    $("#pPrev").onclick = () => turn(-1);
    $("#pNext").onclick = () => turn(1);
  } else {
    more.innerHTML = list.length > 1 ? `<span class="sub">${list.length} profiles</span>` : "";
  }
  markDirty();
}

function setFill(r) {
  r.style.setProperty("--v", ((r.value - r.min) / (r.max - r.min)) * 100 + "%");
}

// Quick picks under the colour heading: [hue, saturation]. The last one is white.
const SWATCHES = [
  [0, 85],
  [24, 90],
  [45, 90],
  [140, 70],
  [175, 80],
  [205, 85],
  [230, 75],
  [265, 70],
  [320, 80],
  [0, 0],
];

function slider(label, field, value, { max = 100, unit = "%", cls = "" } = {}) {
  return `
    <div class="slider-head"><span>${label}</span><output>${Math.round(value)}${unit}</output></div>
    <input type="range" class="${cls}" min="0" max="${max}" value="${value}" data-f="${field}">`;
}

function effectPicker(p, effects) {
  const closest = matchEffect(p, effects)?.name || "–";
  const options = effects
    .map((e) => `<option ${p.fw === e.name ? "selected" : ""}>${esc(e.name)}</option>`)
    .join("");
  return `
    <label class="field">
      <span>Keyboard effect</span>
      <select class="inp" id="tFx">
        <option value="">Closest match: ${esc(closest)}</option>
        ${options}
      </select>
    </label>`;
}

function colourPicker(p) {
  const swatches = SWATCHES.map(([h, s]) => {
    const title = s ? `Hue ${h}` : "White";
    const bg = toHex(hsv(h, s / 100, 0.95));
    return `<button data-h="${h}" data-s="${s}" title="${title}" style="background:${bg}"></button>`;
  }).join("");
  return `
    <div class="field">
      <span>Colour</span>
      <div class="swatches">
        ${swatches}
        <input type="color" id="tColor" value="${toHex(hsv(p.h, p.s / 100, 1))}" aria-label="Pick a colour">
      </div>
      ${slider("Hue", "h", p.h, { max: 359, unit: "°", cls: "hue" })}
      ${slider("Saturation", "s", p.s)}
    </div>`;
}

function renderTune() {
  const el = $("#tune");
  if (!el) return;
  const kb = state.cur,
    lighting = kb.lighting,
    p = currentProfile(),
    fw = hardwareEffectFor(kb, p);
  const has = lighting.has;
  const onKeyboard = fw ? `, ${esc(fw.name)} on the keyboard` : "";

  el.innerHTML = `
    <h2>${esc(p.name)}</h2>
    <p class="sub">${esc(FX[p.fx].name)} in the preview${onKeyboard}</p>
    ${has.effect && lighting.effects ? effectPicker(p, lighting.effects) : ""}
    ${has.color ? colourPicker(p) : ""}
    ${has.brightness ? slider("Brightness", "br", p.br) : ""}
    ${has.speed ? slider("Speed", "speed", p.speed) : ""}
    ${lighting.note ? `<p class="sub">${esc(lighting.note)}</p>` : ""}
    <div class="btns">
      <button class="btn sm" id="tOff">${icons.power}Lights off</button>
      ${lighting.handBack ? `<button class="btn sm" id="tBack">Hand back</button>` : ""}
      <button class="btn ghost sm" id="tReset">${icons.reset}Reset profile</button>
    </div>`;
  $$("input[type=range]", el).forEach((r) => {
    setFill(r);
    r.oninput = () => {
      lightingSnapshot();
      const f = r.dataset.f;
      p[f] = +r.value;
      saveProfiles();
      setFill(r);
      r.previousElementSibling.querySelector("output").textContent =
        r.value + (f === "h" ? "°" : "%");
      if (f === "h" || f === "s") $("#tColor").value = toHex(hsv(p.h, p.s / 100, 1));
      queueLighting();
      markDirty();
    };
  });
  const fx = $("#tFx");
  if (fx)
    fx.onchange = () => {
      lightingSnapshot();
      p.fw = fx.value || null;
      saveProfiles();
      queueLighting();
      renderTune();
    };
  $$(".swatches [data-h]", el).forEach(
    (b) =>
      (b.onclick = () => {
        lightingSnapshot();
        p.h = +b.dataset.h;
        p.s = +b.dataset.s;
        saveProfiles();
        queueLighting();
        renderTune();
        markDirty();
      }),
  );
  const c = $("#tColor");
  if (c)
    c.oninput = () => {
      lightingSnapshot();
      const v = c.value;
      const [h, s] = rgbToHsv(
        parseInt(v.slice(1, 3), 16) / 255,
        parseInt(v.slice(3, 5), 16) / 255,
        parseInt(v.slice(5, 7), 16) / 255,
      );
      p.h = Math.round(h);
      p.s = Math.round(s * 100);
      saveProfiles();
      queueLighting();
      renderTune();
      markDirty();
    };
  $("#tOff").onclick = async () => {
    state.off = true;
    dropPending("light");
    markDirty();
    try {
      await lighting.off();
      toast("Lights off. Pick a profile and apply to turn them back on");
    } catch (e) {
      toast("Couldn’t turn the lights off. " + e.message, "bad");
    }
  };
  const hb = $("#tBack");
  if (hb)
    hb.onclick = async () => {
      try {
        await lighting.handBack();
        toast("The keyboard is showing its own saved lighting again");
      } catch (e) {
        toast(e.message, "bad");
      }
    };
  $("#tReset").onclick = () => {
    lightingSnapshot();
    const d = PRESETS.find((x) => x.id === p.id);
    Object.assign(p, { h: d.h, s: d.s, br: d.br, speed: d.speed, fw: null });
    saveProfiles();
    queueLighting();
    renderTune();
    markDirty();
  };
}

// One VIA menu item as a form control. `k` identifies the item, `v` is its current value.
function boardControl(c, k, v, raw) {
  switch (c.type) {
    case "range":
      return `
        <span style="display:flex;align-items:center;gap:12px;min-width:220px">
          <input type="range" min="${c.min}" max="${c.max}" value="${v ?? c.min}" data-k="${k}" style="margin:0">
          <output class="mono num" style="min-width:32px">${v ?? "–"}</output>
        </span>`;
    case "toggle":
      return `
        <label class="switch">
          <input type="checkbox" data-k="${k}" ${v === c.on ? "checked" : ""}><i></i>
        </label>`;
    case "dropdown": {
      const options = c.options
        .map((o) => {
          const selected = o.value === v ? "selected" : "";
          return `<option value="${o.value}" ${selected}>${esc(o.label)}</option>`;
        })
        .join("");
      return `<select class="inp" data-k="${k}" style="width:220px">${options}</select>`;
    }
    case "color": {
      const [hue, sat] = raw || [0, 0];
      const hex = toHex(hsv((hue / 255) * 360, sat / 255, 1));
      return `<input type="color" data-k="${k}" value="${hex}">`;
    }
    case "button":
      return `<button class="btn sm" data-k="${k}">Run</button>`;
    default:
      return "";
  }
}

async function renderBoard() {
  const el = $("#board"),
    kb = state.cur,
    lighting = kb.lighting;
  if (!el) return;
  if (!state.viaValues) {
    el.innerHTML = `<h2>Board settings</h2><p class="sub">Reading the values from the keyboard</p>`;
    try {
      state.viaValues = await lighting.read();
    } catch {
      state.viaValues = {};
    }
    if (!$("#board")) return;
  }
  const V = state.viaValues,
    num = (it) => (V[it.ids.join(":")] ? viaValueToNumber(V[it.ids.join(":")]) : undefined);
  const lookup = (token) => {
    const it = lighting.items.find(
      (x) =>
        x.token === token || `{${x.token}}` === token || x.token === token.replace(/[{}]/g, ""),
    );
    return it ? num(it) : undefined;
  };
  const shown = (it) => !it.showIf || evaluateViaCondition(it.showIf, lookup);
  let html = `<h2>Board settings</h2>
    <p class="sub">Every lighting and board option this keyboard’s VIA definition lists</p>`;
  for (const m of lighting.menus)
    for (const s of m.sections) {
      const items = s.items.filter(shown);
      if (!items.length) continue;
      html += `<div class="rows" style="margin-top:8px">`;
      if (s.label) {
        html += `
          <div class="row">
            <span style="color:var(--text-1);font-weight:500">${esc(s.label)}</span><span></span>
          </div>`;
      }
      for (const it of items) {
        const k = it.ids.join(":");
        const control = boardControl(it.control, k, num(it), V[k]);
        html += `<div class="row"><span>${esc(it.label)}</span><span>${control}</span></div>`;
      }
      html += `</div>`;
    }
  el.innerHTML = html;
  const itemOf = (k) => lighting.items.find((x) => x.ids.join(":") === k);
  $$("[data-k]", el).forEach((inp) => {
    const it = itemOf(inp.dataset.k),
      c = it.control,
      k = inp.dataset.k;
    const queue = (bytes, label) => {
      const before = state.viaValues[k];
      state.viaValues[k] = bytes;
      setPending(
        "via:" + k,
        label,
        () => lighting.setItem(it, bytes),
        () => {
          state.viaValues[k] = before;
        },
      );
    };
    if (c.type === "range") {
      setFill(inp);
      inp.oninput = () => {
        setFill(inp);
        inp.nextElementSibling.textContent = inp.value;
        queue(viaNumberToBytes(+inp.value, it.bytes), it.label);
      };
      inp.onchange = () => renderBoard();
    } else if (c.type === "toggle")
      inp.onchange = () => {
        queue(viaNumberToBytes(inp.checked ? c.on : c.off, it.bytes), it.label);
        renderBoard();
      };
    else if (c.type === "dropdown")
      inp.onchange = () => {
        queue(viaNumberToBytes(+inp.value, it.bytes), it.label);
        renderBoard();
      };
    else if (c.type === "color")
      inp.oninput = () => {
        const v = inp.value;
        const [h, s] = rgbToHsv(
          parseInt(v.slice(1, 3), 16) / 255,
          parseInt(v.slice(3, 5), 16) / 255,
          parseInt(v.slice(5, 7), 16) / 255,
        );
        queue([Math.round((h / 360) * 255) & 255, Math.round(s * 255)], it.label);
      };
    else if (c.type === "button")
      inp.onclick = () => queue(viaNumberToBytes(c.value, it.bytes), it.label);
  });
}
