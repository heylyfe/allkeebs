// Changes wait in a bar at the bottom until you press Apply (the same idea as OpenMouse's
// pending-changes bar), so nothing is written to a keyboard by accident.

import { $, esc, log, toast } from "./dom.js";
import { refreshCurrentTab } from "./pages/device.js";
import { state } from "./state.js";

export function setPending(id, label, run, revert) {
  const i = state.pending.findIndex((p) => p.id === id);
  const item = { id, label, run, revert, dev: state.cur };
  if (i >= 0) state.pending[i] = { ...item, revert: state.pending[i].revert || revert };
  else state.pending.push(item);
  renderPending();
}

export function dropPending(id) {
  state.pending = state.pending.filter((p) => p.id !== id);
  renderPending();
}

export function renderPending() {
  const el = $("#pending");
  if (!el) return;
  if (!state.pending.length) {
    el.hidden = true;
    return;
  }
  const n = state.pending.length,
    dev = state.pending[0].dev;
  el.hidden = false;
  const what = state.pending.map((p) => p.label).join(", ");
  const where = dev?.name || "the keyboard";
  el.innerHTML = `
    <div class="what">
      <b>${n} ${n === 1 ? "change" : "changes"}</b> not on ${esc(where)} yet · ${esc(what)}
    </div>
    <div class="btns">
      <button class="btn ghost sm" id="pDiscard">Discard</button>
      <button class="btn primary sm" id="pApply">Apply</button>
    </div>`;
  $("#pDiscard").onclick = () => {
    for (const p of [...state.pending].reverse())
      try {
        p.revert?.();
      } catch {
        /* ignore */
      }
    state.pending = [];
    renderPending();
    refreshCurrentTab();
  };
  $("#pApply").onclick = applyPending;
}

async function applyPending() {
  const items = [...state.pending],
    btn = $("#pApply");
  btn.disabled = true;
  btn.textContent = "Applying";
  let ok = 0;
  for (const p of items) {
    try {
      await p.run();
      ok++;
      dropPending(p.id);
      log(`Applied ${p.label}`);
    } catch (e) {
      log(`Failed ${p.label}: ${e.message}`);
      toast(`${p.label} didn’t apply. ${e.message}`, "bad");
      break;
    }
  }
  if (state.lightSnap && !state.pending.some((p) => p.id === "light")) state.lightSnap = null;
  renderPending();
  if (ok === items.length)
    toast(
      items[0].dev?.demo
        ? "Applied to the demo board. Nothing left this browser"
        : `Saved to ${items[0].dev?.name || "the keyboard"}`,
    );
  refreshCurrentTab();
}
