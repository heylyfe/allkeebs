// VIA definitions the user saved on purpose: from a keyboard's overview page, or from the
// Keyboards page before the keyboard is connected. They live under the same
// "def.file.<vpid>" keys findDefinition reads, plus a "def.files" index so the list of
// saved boards can be shown and removed. Nothing here runs any part of the JSON; it is
// only parsed, validated and stored.

import { viaVendorProductId } from "@openmouse/keyboard-protocol/via";
import { parseDefinitionText, store } from "./devices.js";

/** Inputs bigger than this are refused before parsing (a VIA definition is a few KB). */
export const MAX_DEFINITION_BYTES = 2 * 1024 * 1024;

const byteLength = (text) =>
  typeof TextEncoder === "function" ? new TextEncoder().encode(text).length : text.length;

/**
 * Parse and validate VIA definition text: the .json VIA and Vial keyboards publish.
 * Returns the parsed definition. Throws an Error with a friendly message when the text
 * is not a usable definition (not JSON, no matrix/layouts, too big, no keys).
 */
export function parseDefinition(text) {
  if (typeof text !== "string" || text.trim() === "")
    throw new Error("The definition is empty. Paste the keyboard’s .json or choose a file.");
  if (byteLength(text) > MAX_DEFINITION_BYTES)
    throw new Error("That file is bigger than 2 MB. A VIA definition is usually a few KB.");
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error("That isn’t JSON. Paste the whole .json exactly as the maker published it.");
  }
  if (!j || typeof j !== "object" || Array.isArray(j))
    throw new Error(
      "That JSON isn’t a VIA definition. It should be an object with a matrix and layouts.",
    );
  const matrix = j.matrix;
  if (
    !matrix ||
    !Number.isInteger(matrix.rows) ||
    !Number.isInteger(matrix.cols) ||
    matrix.rows < 1 ||
    matrix.cols < 1
  )
    throw new Error(
      "That JSON has no matrix. A VIA definition needs “matrix”: { “rows”: …, “cols”: … }.",
    );
  const layouts = j.layouts;
  if (!layouts || (!Array.isArray(layouts.keys) && !Array.isArray(layouts.keymap)))
    throw new Error(
      "That JSON has no layouts. A VIA definition needs “layouts” with the keymap and keys.",
    );
  // The VIA parser does the rest: matrix bounds, at least one key, ids.
  try {
    return parseDefinitionText(text);
  } catch (e) {
    throw new Error(e?.message || "That isn’t a VIA definition.");
  }
}

/**
 * The USB id a definition is for, or null when it doesn't say (neither
 * vendorId/productId nor a vendorProductId that is more than 0x0000:0x0000).
 */
export function definitionUsbId(def) {
  const vid = def?.vendorId,
    pid = def?.productId;
  if (!Number.isInteger(vid) || !Number.isInteger(pid) || vid < 0 || pid < 0) return null;
  if (vid === 0 && pid === 0) return null;
  return { vid, pid, vpid: viaVendorProductId(vid, pid) };
}

/** The saved-definitions index, or [] when it's missing or not an array. */
function readIndex() {
  const list = store.get("def.files", []);
  return Array.isArray(list) ? list : [];
}

/**
 * Parse and save a definition. When vid/pid are given the definition is stored for that
 * keyboard (the connected board it was loaded for); otherwise it is stored for the USB id
 * the definition says it belongs to. Returns { vpid, vid, pid, name }.
 */
export function saveDefinition(text, { vid, pid } = {}) {
  const def = parseDefinition(text);
  const target =
    vid != null
      ? { vid, pid: pid ?? 0, vpid: viaVendorProductId(vid, pid ?? 0) }
      : definitionUsbId(def);
  if (!target)
    throw new Error(
      "That definition doesn’t say which keyboard it’s for (no vendorId/productId in it).",
    );
  store.set("def.file." + target.vpid, text);
  const list = readIndex().filter((e) => e && Number.isInteger(e.vpid) && e.vpid !== target.vpid);
  list.push({ vpid: target.vpid, name: def.name || "Saved definition" });
  store.set("def.files", list);
  return { ...target, name: def.name || "Saved definition" };
}

/**
 * Remove a saved definition: the stored file findDefinition reads, and its entry in the
 * saved-definitions list. Existing def.file.* entries saved before the list existed are
 * removed the same way.
 */
export function removeDefinition(vpid) {
  if (!Number.isInteger(vpid)) return;
  store.remove("def.file." + vpid);
  store.set(
    "def.files",
    readIndex().filter((e) => e && Number.isInteger(e.vpid) && e.vpid !== vpid),
  );
}

/** A stored def.file exists, whatever findDefinition would make of its contents. */
function storedFileExists(vpid) {
  try {
    return localStorage.getItem("allkeebs.def.file." + vpid) != null;
  } catch {
    return store.get("def.file." + vpid, null) != null;
  }
}

/**
 * The definitions saved on this device, as { vpid, vid, pid, name } entries. Includes
 * def.file.* entries saved before the list existed, so they can be managed too.
 */
export function listDefinitions() {
  const out = new Map();
  const add = (vpid, name) => {
    if (!Number.isInteger(vpid) || vpid < 0) return;
    out.set(vpid, {
      vpid,
      vid: Math.floor(vpid / 65536),
      pid: vpid % 65536,
      name: name || "Saved definition",
    });
  };
  // The index can outrun the files (devtools meddling): drop entries whose file is gone.
  const index = readIndex(),
    kept = [];
  let dropped = false;
  for (const e of index) {
    if (!e || !Number.isInteger(e.vpid)) {
      dropped = true;
      continue;
    }
    if (!storedFileExists(e.vpid)) {
      dropped = true;
      continue;
    }
    kept.push({ vpid: e.vpid, name: e.name || "Saved definition" });
    add(e.vpid, e.name);
  }
  if (dropped) store.set("def.files", kept);
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i),
        m = /^allkeebs\.def\.file\.(\d+)$/.exec(key || "");
      if (!m) continue;
      const vpid = Number(m[1]);
      if (out.has(vpid)) continue;
      let name = "Saved definition";
      try {
        const raw = localStorage.getItem(key);
        // store.set JSON-encodes the text it stores; accept a raw payload too.
        let text = raw;
        try {
          const wrapped = JSON.parse(raw);
          if (typeof wrapped === "string") text = wrapped;
        } catch {
          /* already raw JSON */
        }
        name = parseDefinitionText(text)?.name || name;
      } catch {
        /* keep the generic name */
      }
      add(vpid, name);
    }
  } catch {
    /* storage blocked or missing enumeration */
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}
