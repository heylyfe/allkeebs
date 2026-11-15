// Overview tab: what we read from the keyboard, what can be changed, and its VIA definition.

import { hex4, pickDatabaseBoard, store } from "../../devices.js";
import {
  definitionUsbId,
  parseDefinition,
  removeDefinition,
  saveDefinition,
} from "../../definitions.js";
import { loadKeymapLabels } from "../connect.js";
import { $, esc, icons, onDesktop, toast } from "../dom.js";
import { render } from "../shell.js";

const DEFINITION_SOURCES = {
  file: "your file",
  cache: "the saved copy",
  db: "the built-in keyboard database",
  vial: "the keyboard itself, which runs Vial",
  usevia: "usevia.app",
};

function lightingSummary(kb) {
  const lighting = kb.lighting;
  if (!lighting) return kb.notes[0] || "Not available for this keyboard";
  if (!lighting.effects) return "Solid colour";
  const guessed = lighting.guessed
    ? ", using the standard VIA set because this board has no definition"
    : "";
  return `${lighting.effects.length} effects on the keyboard${guessed}`;
}

function keymapSummary(kb) {
  if (kb.keymap) return `${kb.keymap.layers} layers, any key, any layer`;
  if (kb.family === "via") return "Needs this board’s VIA definition";
  return "Not available for this keyboard";
}

// Each row: [title, available?, detail]
function capabilities(kb) {
  return [
    ["Lighting", !!kb.lighting, lightingSummary(kb)],
    ["Keymap", !!kb.keymap, keymapSummary(kb)],
    [
      "Macros",
      !!kb.macros,
      kb.macros
        ? `${kb.macros.count} slots, ${kb.macros.size} bytes of memory`
        : "Not available for this keyboard",
    ],
    [
      "Switch matrix test",
      !!kb.matrix,
      kb.matrix
        ? "Reads every switch straight from the board, Fn included"
        : "Uses the keys your computer receives",
    ],
  ];
}

function capabilityRow([title, available, detail]) {
  return `
    <div class="cap-row">
      ${available ? icons.check : icons.minus}
      <div><b>${title}</b><small>${esc(detail)}</small></div>
    </div>`;
}

function definitionStatus(kb) {
  const def = kb.definition;
  if (def) {
    const from = DEFINITION_SOURCES[kb.definitionSource] || "usevia.app";
    return `${esc(def.name)}, ${def.matrix.rows} × ${def.matrix.cols} matrix, from ${from}`;
  }
  if (kb.definitionError === "offline") {
    return "Couldn’t reach usevia.app. Lighting uses the standard VIA set until the definition loads";
  }
  if (kb.definitionError === "badFile") {
    return "The saved definition couldn’t be read. Load the .json again, or forget it";
  }
  if (kb.family === "identified") {
    return (
      "This keyboard isn’t in the database, on the keyboard or on usevia.app yet. " +
      "If the maker publishes a VIA .json, loading it adds its exact layout here"
    );
  }
  return (
    "This board isn’t in the database, on the keyboard or on usevia.app yet. " +
    "If the maker publishes a VIA .json, loading it adds the exact layout and keymap"
  );
}

// When boards share a USB id, let the user say which one this is.
function boardPicker(kb) {
  const e = kb.dbEntry;
  if (kb.definitionSource !== "db" || !e?.others?.length) return "";
  const names = [e.name, ...e.others];
  const options = names
    .map((n) => `<option ${n === e.name ? "selected" : ""}>${esc(n)}</option>`)
    .join("");
  const why =
    e.matchedBy === "guess"
      ? "Several keyboards share this USB id and its name didn’t settle it. Pick yours for the right layout and lighting menus"
      : "Several keyboards share this USB id. If this isn’t yours, pick the right one";
  return `
    <label class="field" style="margin-top:16px">
      <span>Which keyboard is this?</span>
      <select class="inp" id="dbPick">${options}</select>
    </label>
    <p class="sub" style="margin:8px 0 0">${why}</p>`;
}

function definitionPanel(kb) {
  const secondary =
    kb.definitionSource === "file"
      ? `<button class="btn ghost sm" id="defForget">Forget my file</button>`
      : kb.family === "identified"
        ? ""
        : `<button class="btn ghost sm" id="defRetry">${icons.refresh}Check usevia.app again</button>`;
  const identifiedNote =
    kb.family === "identified"
      ? `<p class="sub">The layout from the definition is used here, in the key test and the layout view. Lighting and key remapping need a VIA-capable interface, which this keyboard doesn’t have.</p>`
      : "";
  return `
    <div class="panel">
      <h2>${icons.file}VIA definition</h2>
      <p class="sub">${definitionStatus(kb)}</p>
      ${identifiedNote}
      ${boardPicker(kb)}
      <div class="btns">
        <label class="btn sm">
          ${icons.upload}Load .json
          <input type="file" accept=".json,application/json" id="defFile" hidden>
        </label>
        <button class="btn ghost sm" id="defPaste">${icons.file}Paste JSON</button>
        ${secondary}
      </div>
      <div id="defPasteBox" hidden>
        <textarea class="inp mono" id="defPasteText" rows="10" spellcheck="false" placeholder="Paste the definition .json here…"></textarea>
        <div class="btns" style="margin-top:8px">
          <button class="btn sm" id="defPasteUse">Use this definition</button>
          <button class="btn ghost sm" id="defPasteCancel">Cancel</button>
        </div>
      </div>
      <p class="sub" style="margin-top:10px">The file stays ${onDesktop() ? "on this computer" : "in this browser"}.</p>
    </div>`;
}

export function tabOverview(el, kb) {
  const facts = kb.facts
    .map(
      ([label, value]) => `<div class="fig"><small>${esc(label)}</small><b>${esc(value)}</b></div>`,
    )
    .join("");
  const notes = kb.notes
    .slice(kb.lighting ? 0 : 1) // without lighting, the first note is already shown above
    .map((n) => `<div class="cap-row">${icons.info}<div><small>${esc(n)}</small></div></div>`)
    .join("");
  const identity = kb.identity
    .map(
      ([label, value]) =>
        `<div class="row"><span>${esc(label)}</span><span class="mono">${esc(value)}</span></div>`,
    )
    .join("");

  el.innerHTML = `
    <div class="grid2">
      <div class="col">
        <div class="panel">
          <h2>Current setup</h2>
          <p class="sub">Read from the keyboard when it connected</p>
          <div class="figs">${facts}</div>
        </div>
        <div class="panel">
          <h2>What allkeebs can change here</h2>
          <p class="sub">Only what this keyboard’s driver supports is shown</p>
          ${capabilities(kb).map(capabilityRow).join("")}
          ${notes}
        </div>
      </div>
      <div class="col">
        <div class="panel">
          <h2>Identity</h2>
          <div class="rows">${identity}</div>
        </div>
        ${kb.family === "via" || kb.family === "identified" ? definitionPanel(kb) : ""}
      </div>
    </div>`;
  const pick = $("#dbPick");
  if (pick)
    pick.onchange = async () => {
      await pickDatabaseBoard(kb, pick.value);
      await loadKeymapLabels(kb).catch(() => {});
      toast(`Using the layout and menus for ${pick.value}`);
      render();
    };
  const f = $("#defFile");
  if (f)
    f.onchange = () => {
      const file = f.files[0];
      if (!file) return;
      file.text().then((t) => loadDefinition(kb, t));
    };
  const paste = $("#defPaste");
  if (paste)
    paste.onclick = () => {
      $("#defPasteBox").hidden = false;
      $("#defPasteText").focus();
    };
  const pasteUse = $("#defPasteUse");
  if (pasteUse)
    pasteUse.onclick = () => {
      loadDefinition(kb, $("#defPasteText").value);
    };
  const pasteCancel = $("#defPasteCancel");
  if (pasteCancel)
    pasteCancel.onclick = () => {
      $("#defPasteBox").hidden = true;
      $("#defPasteText").value = "";
    };
  const r = $("#defRetry");
  if (r) r.onclick = () => reloadDefinition(kb);
  const fg = $("#defForget");
  if (fg)
    fg.onclick = () => {
      removeDefinition(kb.vid * 65536 + kb.pid);
      reloadDefinition(kb);
    };
}

async function loadDefinition(kb, text) {
  try {
    const def = parseDefinition(text);
    const theirs = definitionUsbId(def);
    if (theirs && (theirs.vid !== kb.vid || theirs.pid !== kb.pid)) {
      toast(
        `That file is for ${hex4(theirs.vid)}:${hex4(theirs.pid)}, not this keyboard (${hex4(kb.vid)}:${hex4(kb.pid)}). Loaded it anyway`,
        "bad",
      );
    }
    saveDefinition(text, { vid: kb.vid, pid: kb.pid });
    await kb.attachDefinition({ def, source: "file" });
    await loadKeymapLabels(kb);
    toast(`Loaded ${def.name}`);
    render();
  } catch (e) {
    toast(e.message, "bad");
  }
}

async function reloadDefinition(kb) {
  const { def, source, error } = await (async () => {
    try {
      const t = store.get("def.file." + (kb.vid * 65536 + kb.pid), null);
      if (t) return { def: parseDefinition(t), source: "file" };
    } catch {
      /* ignore */
    }
    if (kb.family === "identified") return { def: null, source: null, error: null };
    try {
      for (const v of ["v3", "v2"]) {
        const r = await fetch(
          `https://usevia.app/definitions/${v}/${kb.vid * 65536 + kb.pid}.json`,
        );
        if (r.ok) {
          try {
            return { def: parseDefinition(await r.text()), source: "usevia" };
          } catch {
            /* html */
          }
        }
      }
      return { def: null, error: "notFound" };
    } catch {
      return { def: null, error: "offline" };
    }
  })();
  await kb.attachDefinition({ def, source, error });
  await loadKeymapLabels(kb);
  render();
}
