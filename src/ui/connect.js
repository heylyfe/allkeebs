// Asking the browser for keyboards, opening them and keeping the list of connected ones.

import {
  EVENT_FROM_VIA as eventCodeFor,
  distinctHidHandles,
  demoAdapter,
  hidSupport,
  openKeyboard,
  pickKeyboards,
} from "../devices.js";
import { log, toast } from "./dom.js";
import { layoutFor } from "./layout-choice.js";
import { markDirty } from "./loop.js";
import { refreshCurrentTab } from "./pages/device.js";
import { go, render, renderSide } from "./shell.js";
import { state } from "./state.js";

export async function connect(any) {
  const hs = hidSupport();
  if (hs !== "ok") {
    toast(
      hs === "missing"
        ? "This browser can’t reach USB keyboards. Open allkeebs in Chrome or Edge on a computer"
        : "This preview window blocks USB access. Download allkeebs and open the file in Chrome or Edge",
      "bad",
    );
    return;
  }
  let list;
  try {
    list = await pickKeyboards(any);
  } catch (e) {
    log("Picker: " + e.message);
    return;
  }
  for (const d of distinctHidHandles(list)) await adopt(d, true);
}

export async function adopt(device, announce) {
  if (state.devices.some((kb) => kb.device === device)) return;
  try {
    const kb = await openKeyboard(device, log);
    if (
      state.devices.some(
        (other) =>
          other.vid === device.vendorId &&
          other.pid === device.productId &&
          other.device?.productName === device.productName,
      )
    )
      kb.notes.push(
        "Another WebHID entry has the same reported identity. The browser does not expose a serial number or physical-device path here, so these entries may be separate identical keyboards or interfaces of one keyboard.",
      );
    state.devices.push(kb);
    if (announce)
      toast(
        kb.identified
          ? `${kb.name} recognised. Its layout and key test are ready`
          : `${kb.name} connected through the ${kb.brand} driver`,
      );
    if (announce) openDevice(kb);
    else if (state.route === "keyboards") render();
    else renderSide();
    loadKeymapLabels(kb);
  } catch (e) {
    log(`Open failed for ${device.productName}: ${e.message}`);
    if (announce)
      toast(
        /open/i.test(e.message)
          ? `Couldn’t open ${device.productName || "the device"}. Close VIA or the vendor app and try again`
          : e.message,
        "bad",
      );
  }
}

export function openDevice(kb) {
  if (!kb) return;
  if (state.cur !== kb) {
    state.cur = kb;
    state.tab = "overview";
    state.keymapEdit = null;
    state.macroEdit = null;
    state.viaValues = null;
  }
  go("device");
}

export async function removeDevice(kb) {
  state.pending = state.pending.filter((p) => p.dev !== kb);
  await kb.close();
  state.devices = state.devices.filter((d) => d !== kb);
  if (state.cur === kb) {
    state.cur = null;
    go("keyboards");
  } else renderSide();
}

export function demo() {
  let kb = state.devices.find((d) => d.demo);
  if (!kb) {
    kb = demoAdapter(layoutFor);
    kb.layoutHint = "75";
    state.devices.push(kb);
  }
  openDevice(kb);
  loadKeymapLabels(kb);
}

export async function loadKeymapLabels(kb) {
  if (!kb.keymap || !kb.exactLayout) return;
  try {
    const layers = await kb.keymap.read();
    kb.keymapCache = layers;
    kb.exactLayout.keys.forEach((k, i) => {
      const code = layers[0][i];
      const d = kb.keymap.describe(code);
      k.label = code === 0 ? "" : d.label;
      k.code = eventCodeFor(code);
      k.sub = null;
    });
    kb.exactLayout.byCode = {};
    for (const k of kb.exactLayout.keys)
      if (k.code && !kb.exactLayout.byCode[k.code]) kb.exactLayout.byCode[k.code] = k;
    markDirty();
    if (state.cur === kb && state.route === "device") refreshCurrentTab();
  } catch (e) {
    log("Keymap read failed: " + e.message);
  }
}
