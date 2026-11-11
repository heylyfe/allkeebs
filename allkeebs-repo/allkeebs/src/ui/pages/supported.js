// Supported keyboards: the built-in database search plus each driver's model list.

import { ARBITER_PRODUCTS } from "@openmouse/keyboard-protocol/arbiter";
import { KEYCHRON_HE_PRODUCTS } from "@openmouse/keyboard-protocol/keychron";
import { LOGITECH_KEYBOARD_PRODUCTS } from "@openmouse/keyboard-protocol/logitech";
import { RAZER_KEYBOARD_PRODUCTS } from "@openmouse/keyboard-protocol/razer";
import { STEELSERIES_KEYBOARD_PRODUCTS } from "@openmouse/keyboard-protocol/steelseries";
import { WOOTING_PRODUCTS } from "@openmouse/keyboard-protocol/wooting";
import { hex4 } from "../../devices.js";
import { keyboardDb } from "../../kbdb.js";
import { $, $$, esc, icons } from "../dom.js";
import { state } from "../state.js";

const MAX_DB_HITS = 40;

// USB ids are shown without the 0x prefix, as in Device Manager.
const usbId = (vid, pid) => `${hex4(vid).slice(2)}:${hex4(pid).slice(2)}`;

function dbRow(e) {
  const maker = e.maker ? ` <span class="sub">· ${esc(e.maker)}</span>` : "";
  return `
    <div class="cat-row">
      <span>${esc(e.name)}${maker}</span>
      <span class="mono">${usbId(e.vid, e.pid)}</span>
      <span class="st">${e.via ? "VIA" : "Layout only"} · ${e.keyCount} keys</span>
    </div>`;
}

function modelRow([name, vid, pids, tested]) {
  const more = pids.length > 1 ? ` +${pids.length - 1}` : "";
  return `
    <div class="cat-row">
      <span>${esc(name)}</span>
      <span class="mono">${usbId(vid, pids[0])}${more}</span>
      <span class="st ${tested ? "ok" : ""}">${tested ? "Tested" : "Recognised"}</span>
    </div>`;
}

export function pageSupported(page) {
  const merge = (items) => {
    const m = new Map();
    for (const [n, vid, pid, ok] of items) {
      const k = n + ":" + vid;
      if (m.has(k)) {
        m.get(k)[2].push(pid);
        m.get(k)[3] ||= ok;
      } else m.set(k, [n, vid, [pid], ok]);
    }
    return [...m.values()];
  };
  const cats = [
    [
      "Keychron Hall effect",
      Object.entries(KEYCHRON_HE_PRODUCTS).map(([pid, p]) => [p.name, 0x3434, +pid, false]),
    ],
    [
      "Wooting",
      Object.entries(WOOTING_PRODUCTS).map(([pid, p]) => [p.name, 0x31e3, +pid, p.verified]),
    ],
    ["Razer", [...RAZER_KEYBOARD_PRODUCTS].map(([pid, p]) => [p.name, 0x1532, pid, p.verified])],
    [
      "Logitech",
      [...LOGITECH_KEYBOARD_PRODUCTS].map(([pid, p]) => [p.name, 0x046d, pid, p.verified]),
    ],
    [
      "SteelSeries",
      [...STEELSERIES_KEYBOARD_PRODUCTS].map(([pid, p]) => [p.name, 0x1038, pid, p.verified]),
    ],
    ["Arbiter Studio", ARBITER_PRODUCTS.map((p) => [p.name, p.vendorId, p.productId, p.verified])],
    ["Wuque Studio", [["BABAO60 HE", 0x1ca6, 0x1b10, true]]],
    ["Kochi", [["Hummingbird 68, Windows and Mac mode only", 0x1ca2, 0x0901, true]]],
  ].map(([n, items]) => [n, merge(items)]);
  const open = state.supOpen || (state.supOpen = new Set());
  page.innerHTML = `
    <h1>Supported keyboards</h1>
    <p class="lede">
      When a keyboard connects, allkeebs looks up its USB id in a database built into this page,
      so it knows the model and layout without you importing anything. The drivers from the
      OpenMouse project then decide what can be changed.
    </p>
    <div class="search">
      ${icons.search}
      <input class="inp" id="supQ" placeholder="Search keyboards or makers" value="${esc(state.supQ || "")}">
    </div>
    <div class="panel">
      <div class="panel-head">
        <div>
          <h2>Keyboard database</h2>
          <p class="sub" id="dbSub">Unpacking</p>
        </div>
      </div>
      <div id="dbList"></div>
    </div>
    <div class="panel">
      <h2>Any VIA, Vial or QMK keyboard</h2>
      <p class="sub" style="margin:0">
        Lighting, keymap and macros work on any board running VIA, Vial, or QMK with VIA turned
        on, from any brand. Vial boards send their own layout, so they work even when they aren’t
        in the database. Wired mode only.
      </p>
    </div>
    <div id="supList"></div>
    <p class="sub" style="margin-top:24px">
      Recognised means the driver knows the model and speaks its protocol. Tested means someone
      has checked it on real hardware. Keyboards that only work with their maker’s app, like most
      Corsair, HyperX and ASUS boards, still get identified, a layout and the key test, but their
      lighting can’t be changed here.
    </p>`;
  let DB = null;
  const drawDb = () => {
    if (!DB) return;
    const q = (state.supQ || "").trim();
    const total = DB.count.toLocaleString("en-GB");
    const withVia = DB.viaCount.toLocaleString("en-GB");
    $("#dbSub").textContent =
      `${total} keyboards with a known layout, ${withVia} of them with a VIA definition. ` +
      "From the-via/keyboards, Vial and qmk_firmware";

    const list = $("#dbList");
    if (!q) {
      list.innerHTML = `<p class="sub" style="margin:0">Search above to look a keyboard up</p>`;
      return;
    }
    const hits = DB.search(q, MAX_DB_HITS);
    if (!hits.length) {
      list.innerHTML = `
        <p class="sub" style="margin:0">
          Nothing in the database matches “${esc(q)}”. It can still work if it runs Vial, or you
          can load its VIA file
        </p>`;
      return;
    }
    list.innerHTML = hits.map(dbRow).join("");
    if (hits.length === MAX_DB_HITS) {
      list.innerHTML += `
        <p class="sub" style="margin:12px 0 0">
          First ${MAX_DB_HITS} matches. Type more to narrow it down
        </p>`;
    }
  };
  keyboardDb()
    .then((db) => {
      DB = db;
      drawDb();
    })
    .catch(() => {
      $("#dbSub").textContent = "This browser can’t unpack the database";
    });
  const draw = () => {
    const q = (state.supQ || "").toLowerCase();
    $("#supList").innerHTML = cats
      .map(([name, items]) => {
        const list = items.filter(
          ([n]) => !q || n.toLowerCase().includes(q) || name.toLowerCase().includes(q),
        );
        if (!list.length) return "";
        const all = open.has(name) || q,
          shown = all ? list : list.slice(0, 6);
        const showAll = all
          ? ""
          : `<button class="linkish" data-more="${esc(name)}" style="margin-top:12px">
              Show all ${list.length}
            </button>`;
        return `
          <div class="panel">
            <div class="panel-head">
              <div>
                <h2>${esc(name)}</h2>
                <p class="sub">${list.length} ${list.length === 1 ? "model" : "models"}</p>
              </div>
            </div>
            ${shown.map(modelRow).join("")}
            ${list.length > 6 ? showAll : ""}
          </div>`;
      })
      .join("");
    $$("[data-more]").forEach(
      (b) =>
        (b.onclick = () => {
          open.add(b.dataset.more);
          draw();
        }),
    );
  };
  $("#supQ").oninput = (e) => {
    state.supQ = e.target.value;
    draw();
    drawDb();
  };
  draw();
}
