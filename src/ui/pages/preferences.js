// Preferences: theme, motion, backup and the activity log.

import { $, $$, VERSION, activityLog, esc, icons, sandboxed, toast } from "../dom.js";
import { applyTheme, render } from "../shell.js";
import { reloadStoredState, savePrefs, state } from "../state.js";

const THEMES = [
  ["dark", "Dark"],
  ["light", "Light"],
  ["system", "Match system"],
];

const toggle = (id, on) =>
  `<label class="switch"><input type="checkbox" id="${id}" ${on ? "checked" : ""}><i></i></label>`;

export function pagePrefs(page) {
  const themeButtons = THEMES.map(([value, label]) => {
    const on = state.prefs.theme === value ? "on" : "";
    return `<button data-th="${value}" class="${on}">${label}</button>`;
  }).join("");
  const recent = activityLog.slice(-40).reverse();
  const activity = recent.length
    ? recent.map((line) => `<div style="display:block">${esc(line)}</div>`).join("")
    : `<div style="display:block" class="dim">Nothing yet</div>`;

  page.innerHTML = `
    <h1>Preferences</h1>
    <p class="lede">Stored in this browser only.</p>
    <div class="panel" style="margin-top:24px">
      <h2>Appearance</h2>
      <div class="row">
        <span>Theme</span>
        <span><div class="caps">${themeButtons}</div></span>
      </div>
      <div class="row">
        <span>Reduce motion. Previews stop animating</span>
        <span>${toggle("pfReduced", state.prefs.reduced)}</span>
      </div>
      <div class="row">
        <span>Type a demo sentence in previews when you’re not typing</span>
        <span>${toggle("pfDemo", state.prefs.demoTyping)}</span>
      </div>
    </div>
    <div class="panel">
      <h2>Your data</h2>
      <p class="sub">Profiles, layout choices, macro names and VIA files you loaded</p>
      <div class="btns">
        <button class="btn sm" id="pfExport">${icons.download}Export backup</button>
        <label class="btn sm">
          ${icons.upload}Import backup
          <input type="file" accept=".json" id="pfImport" hidden>
        </label>
        <button class="btn ghost sm danger" id="pfReset">Reset allkeebs</button>
      </div>
    </div>
    <div class="panel">
      <h2>Activity</h2>
      <p class="sub">What allkeebs sent and received this session</p>
      <div class="log">${activity}</div>
    </div>
    <div class="panel">
      <h2>About</h2>
      <p class="sub">Version ${VERSION}. Credits, licences and privacy are on their own page</p>
      <div class="btns">
        <button class="btn sm" data-go="about">${icons.about}About and credits</button>
      </div>
    </div>`;
  $$("[data-th]").forEach(
    (b) =>
      (b.onclick = () => {
        state.prefs.theme = b.dataset.th;
        savePrefs();
        applyTheme();
        render();
      }),
  );
  $("#pfReduced").onchange = (e) => {
    state.prefs.reduced = e.target.checked;
    savePrefs();
    applyTheme();
  };
  $("#pfDemo").onchange = (e) => {
    state.prefs.demoTyping = e.target.checked;
    savePrefs();
  };
  $("#pfExport").onclick = () => {
    const data = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith("allkeebs.") && !k.startsWith("allkeebs.def.cache"))
          data[k] = localStorage.getItem(k);
      }
    } catch {
      /* ignore */
    }
    const text = JSON.stringify({ app: "allkeebs", version: 1, data }, null, 2);
    if (sandboxed) {
      navigator.clipboard
        .writeText(text)
        .then(() => toast("Backup copied. This preview can’t download files"))
        .catch(() => toast("Couldn’t copy the backup", "bad"));
      return;
    }
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    link.download = "allkeebs-backup.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  };
  const refreshStoredState = () => {
    reloadStoredState();
    applyTheme();
    render();
  };
  $("#pfImport").onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    let entries;
    try {
      const d = JSON.parse(await f.text());
      if (d.app !== "allkeebs" || !d.data || typeof d.data !== "object" || Array.isArray(d.data))
        throw 0;
      entries = Object.entries(d.data);
      if (entries.some(([k, v]) => !k.startsWith("allkeebs.") || typeof v !== "string")) throw 0;
    } catch {
      toast("That isn’t an allkeebs backup", "bad");
      return;
    }
    const previous = new Map();
    try {
      for (const [k, v] of entries) {
        previous.set(k, localStorage.getItem(k));
        localStorage.setItem(k, v);
      }
    } catch {
      for (const [k, v] of previous) {
        try {
          v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v);
        } catch {
          /* best effort */
        }
      }
      toast("Couldn’t restore the backup", "bad");
      return;
    }
    refreshStoredState();
    toast("Backup restored");
  };
  $("#pfReset").onclick = () => {
    const keep = {};
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k.startsWith("allkeebs.")) {
          keep[k] = localStorage.getItem(k);
          localStorage.removeItem(k);
        }
      }
    } catch {
      /* ignore */
    }
    refreshStoredState();
    toast("allkeebs is reset", "", {
      label: "Undo",
      fn: () => {
        for (const [k, v] of Object.entries(keep)) localStorage.setItem(k, v);
        refreshStoredState();
      },
    });
  };
}
