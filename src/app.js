// allkeebs: keyboard lighting, keymaps and macros in the browser over WebHID.
// This file just starts the app; the pieces live in ui/.

import "./styles.css";
import { distinctHidHandles, grantedKeyboards, hidSupport, onHidEvent } from "./devices.js";
import { drawAscii } from "./ui/ascii.js";
import { adopt } from "./ui/connect.js";
import { toast } from "./ui/dom.js";
import { loop, markDirty } from "./ui/loop.js";
import { renderPending } from "./ui/pending.js";
import { ROUTES, applyTheme, go, render, renderSide, shell } from "./ui/shell.js";
import { state } from "./ui/state.js";

function boot() {
  const h = location.hash.slice(1);
  state.route = ROUTES.includes(h) && h !== "device" ? h : "keyboards";
  shell();
  render();
  requestAnimationFrame(loop);
  window.addEventListener("resize", () => {
    drawAscii();
    markDirty();
  });
  matchMedia("(prefers-color-scheme: light)").addEventListener?.(
    "change",
    () => state.prefs.theme === "system" && applyTheme(),
  );
  if (hidSupport() === "ok") {
    onHidEvent("disconnect", (device) => {
      const kb = state.devices.find((d) => d.device === device);
      if (!kb) return;
      state.devices = state.devices.filter((d) => d !== kb);
      state.pending = state.pending.filter((p) => p.dev !== kb);
      toast(`${kb.name} was unplugged`);
      if (state.cur === kb) {
        state.cur = null;
        go("keyboards");
      } else renderSide();
      renderPending();
    });
    onHidEvent("connect", (device) => adopt(device, false));
    grantedKeyboards()
      .then(async (list) => {
        for (const d of distinctHidHandles(list)) await adopt(d, false);
        if (!list.length) render();
      })
      .catch(() => {});
  }
}

boot();
