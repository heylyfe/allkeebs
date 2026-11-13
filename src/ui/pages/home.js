// Home page: connected keyboards and the "add a keyboard" card.

import { hidSupport } from "../../devices.js";
import { sizeClass } from "../../layouts.js";
import { KeyboardView } from "../../render.js";
import { connect, demo, openDevice, removeDevice } from "../connect.js";
import { $, $$, esc, icons, onDesktop } from "../dom.js";
import { layoutFor } from "../layout-choice.js";
import { views } from "../loop.js";
import { currentProfile, state } from "../state.js";

const NO_HID = {
  missing:
    "This browser can’t reach USB keyboards. Open allkeebs in Chrome or Edge on a computer to " +
    "connect one. The demo board works anywhere.",
  blocked:
    "This preview window blocks USB access. Download the allkeebs file and open it in Chrome or " +
    "Edge to connect a keyboard. The demo board works here.",
};

function addKeyboardCard() {
  const support = hidSupport();
  const notice =
    support === "ok"
      ? ""
      : `<div class="notice">${icons.alert}<span>${NO_HID[support] || NO_HID.blocked}</span></div>`;
  const first = !state.devices.length;
  const hasDemo = state.devices.some((d) => d.demo);
  return `
    <div class="dev add ${first ? "big" : ""}">
      <h3>Add a keyboard</h3>
      <p>
        Plug it in with a cable, then ${onDesktop() ? "click Connect keyboard and tick it in the list" : "pick it from the list Chrome shows"}. allkeebs recognises it
        from a database of more than 4,500 keyboards. Lighting, keymap and macros work on VIA,
        Vial and QMK boards from any brand. Keychron Hall effect boards get keymaps, and Razer,
        Logitech, SteelSeries and Arbiter models get lighting.
        <button class="linkish" data-go="supported">See what’s supported</button>
      </p>
      ${notice}
      <div class="btns">
        <button class="btn ${first ? "primary" : ""} lg" id="addBtn">${icons.plug}Connect keyboard</button>
        ${hasDemo ? "" : `<button class="btn ghost lg" id="demoBtn">Try the demo board</button>`}
      </div>
    </div>`;
}

function keyboardCard(kb) {
  const layout = layoutFor(kb);
  const layoutName = layout.exact ? `${sizeClass(layout)} · exact layout` : layout.name;
  return `
    <div class="dev">
      <canvas data-c="${kb.id}"></canvas>
      <div>
        <h3>${esc(kb.name)}</h3>
        <div class="meta-line">
          <span class="${kb.demo ? "" : "ok"}">${kb.demo ? "Simulated" : "Connected"}</span>
          <span>${esc(kb.brand)}</span>
          <span>${esc(layoutName)}</span>
        </div>
      </div>
      <div class="btns">
        <button class="btn sm" data-open="${kb.id}">Open</button>
        <button class="btn ghost sm" data-rm="${kb.id}">${kb.demo ? "Remove" : "Disconnect"}</button>
      </div>
    </div>`;
}

export function pageHome(page) {
  page.innerHTML = `
    <h1>Keyboards</h1>
    <p class="lede">
      Change lighting, keymaps and macros on the keyboards plugged into this computer. ${
        onDesktop()
          ? "Everything runs in this app, on this computer, so nothing leaves your machine."
          : "Everything runs in this browser tab over WebHID, so there’s nothing to install and nothing leaves your machine."
      }
    </p>
    <div class="shelf ${state.devices.length ? "" : "solo"}">
      ${state.devices.map(keyboardCard).join("")}
      ${addKeyboardCard()}
    </div>`;
  $("#addBtn").onclick = () => connect(false);
  const db = $("#demoBtn");
  if (db) db.onclick = demo;
  $$("[data-open]").forEach(
    (b) => (b.onclick = () => openDevice(state.devices.find((d) => d.id === b.dataset.open))),
  );
  $$("[data-rm]").forEach(
    (b) => (b.onclick = () => removeDevice(state.devices.find((d) => d.id === b.dataset.rm))),
  );
  for (const a of state.devices) {
    const view = new KeyboardView($(`[data-c="${a.id}"]`), { mini: true });
    view.setLayout(layoutFor(a));
    views.push({
      view,
      kind: "lit",
      mini: true,
      profile: currentProfile,
      simKey: () => "home:" + a.id,
    });
  }
}
