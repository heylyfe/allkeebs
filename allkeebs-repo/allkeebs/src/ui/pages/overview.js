// Overview tab: what we read from the keyboard, what can be changed, and its VIA definition.

import { hex4, parseDefinitionText, store } from "../../devices.js";
import { loadKeymapLabels } from "../connect.js";
import { $, esc, icons, toast } from "../dom.js";
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
  return (
    "This board isn’t in the database, on the keyboard or on usevia.app yet. " +
    "If the maker publishes a VIA .json, loading it adds the exact layout and keymap"
  );
}

function definitionPanel(kb) {
  const secondary =
    kb.definitionSource === "file"
      ? `<button class="btn ghost sm" id="defForget">Forget my file</button>`
      : `<button class="btn ghost sm" id="defRetry">${icons.refresh}Check usevia.app again</button>`;
  return `
    <div class="panel">
      <h2>${icons.file}VIA definition</h2>
      <p class="sub">${definitionStatus(kb)}</p>
      <div class="btns">
        <label class="btn sm">
          ${icons.upload}Load .json
          <input type="file" accept=".json,application/json" id="defFile" hidden>
        </label>
        ${secondary}
      </div>
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
        ${kb.family === "via" ? definitionPanel(kb) : ""}
      </div>
    </div>`;
  const f = $("#defFile");
  if (f)
    f.onchange = () => {
      const file = f.files[0];
      if (!file) return;
      file.text().then((t) => loadDefinition(kb, t));
    };
  const r = $("#defRetry");
  if (r) r.onclick = () => reloadDefinition(kb);
  const fg = $("#defForget");
  if (fg)
    fg.onclick = () => {
      try {
        localStorage.removeItem("allkeebs.def.file." + (kb.vid * 65536 + kb.pid));
      } catch {
        /* ignore */
      }
      reloadDefinition(kb);
    };
}

async function loadDefinition(kb, text) {
  try {
    const def = parseDefinitionText(text);
    if (def.vendorId !== kb.vid || def.productId !== kb.pid) {
      const theirs = `${hex4(def.vendorId)}:${hex4(def.productId)}`;
      const ours = `${hex4(kb.vid)}:${hex4(kb.pid)}`;
      toast(`That file is for ${theirs}, not this keyboard (${ours}). Loaded it anyway`, "bad");
    }
    store.set("def.file." + (kb.vid * 65536 + kb.pid), text);
    await kb.attachDefinition({ def, source: "file" });
    await loadKeymapLabels(kb);
    toast(`Loaded ${def.name}`);
    render();
  } catch (e) {
    toast("That isn’t a VIA definition: " + e.message, "bad");
  }
}

async function reloadDefinition(kb) {
  const { def, source, error } = await (async () => {
    try {
      const t = store.get("def.file." + (kb.vid * 65536 + kb.pid), null);
      if (t) return { def: parseDefinitionText(t), source: "file" };
    } catch {
      /* ignore */
    }
    try {
      for (const v of ["v3", "v2"]) {
        const r = await fetch(
          `https://usevia.app/definitions/${v}/${kb.vid * 65536 + kb.pid}.json`,
        );
        if (r.ok) {
          try {
            return { def: parseDefinitionText(await r.text()), source: "usevia" };
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
