// Saved keyboard definitions: validation, the def.file.* store, and an identified keyboard
// picking its definition up when it connects.
globalThis.localStorage = (() => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i],
  };
})();
globalThis.fetch = async () => {
  throw new Error("offline");
};
import assert from "node:assert/strict";
import {
  MAX_DEFINITION_BYTES,
  listDefinitions,
  parseDefinition,
  removeDefinition,
  saveDefinition,
} from "../src/definitions.js";
import { openKeyboard } from "../src/devices.js";

const VID = 0xf00d,
  PID = 0x0001,
  VPid = VID * 65536 + PID;
// A small raw VIA JSON (KLE keymap), the kind makers publish for VIA.
const definition = {
  name: "Definition fixture",
  vendorId: "0xf00d",
  productId: "0x0001",
  matrix: { rows: 2, cols: 3 },
  layouts: {
    keymap: [
      ["0,0", "0,1", "0,2"],
      ["1,0", "1,1", "1,2"],
    ],
  },
};
const text = JSON.stringify(definition);

// --- validation -------------------------------------------------------------
assert.throws(() => parseDefinition("this is not json"), /JSON/);
assert.throws(() => parseDefinition(JSON.stringify({ name: "no matrix or layouts" })), /matrix/);
assert.throws(
  () =>
    parseDefinition(
      JSON.stringify({ matrix: { rows: 1, cols: 1 }, name: "matrix but no layouts" }),
    ),
  /layout/i,
);
assert.throws(() => parseDefinition("a".repeat(MAX_DEFINITION_BYTES + 1)), /2 MB/);
assert.throws(
  () =>
    parseDefinition(JSON.stringify({ matrix: { rows: 1, cols: 1 }, layouts: { keymap: [[]] } })),
  /key/i,
);
const def = parseDefinition(text);
assert.equal(def.name, "Definition fixture");
assert.equal(def.vendorId, VID);
assert.equal(def.productId, PID);
assert.equal(def.keys.length, 6);

// A definition that says nothing about its USB id is accepted for a connected keyboard,
// but can't be saved for one from the Keyboards page.
const idless = JSON.stringify({
  name: "Idless fixture",
  matrix: { rows: 1, cols: 1 },
  layouts: { keymap: [["0,0"]] },
});
assert.equal(parseDefinition(idless).vendorId, 0);
assert.throws(() => saveDefinition(idless), /which keyboard/);

// --- save, list, remove ------------------------------------------------------
const saved = saveDefinition(text);
assert.equal(saved.vpid, VPid);
assert.equal(saved.name, "Definition fixture");
// store.set JSON-encodes, so the raw localStorage value is the text JSON-encoded once.
assert.equal(JSON.parse(localStorage.getItem("allkeebs.def.file." + VPid)), text);
let listed = listDefinitions();
assert.equal(listed.length, 1);
assert.equal(listed[0].name, "Definition fixture");
assert.equal(listed[0].vid, VID);
assert.equal(listed[0].pid, PID);
assert.equal(listed[0].vpid, VPid);

// Saving again for the same id doesn't duplicate the list entry.
saveDefinition(text);
assert.equal(listDefinitions().length, 1);

// A def.file.* entry saved before the list existed is listed too.
const LEGACY_VPid = 0x1234 * 65536 + 0x5678;
localStorage.setItem(
  "allkeebs.def.file." + LEGACY_VPid,
  JSON.stringify(
    JSON.stringify({
      name: "Legacy fixture",
      vendorId: "0x1234",
      productId: "0x5678",
      matrix: { rows: 1, cols: 1 },
      layouts: { keymap: [["0,0"]] },
    }),
  ),
);
listed = listDefinitions();
assert.equal(listed.length, 2);
assert.equal(listed.find((d) => d.vpid === LEGACY_VPid).name, "Legacy fixture");

removeDefinition(LEGACY_VPid);
assert.equal(localStorage.getItem("allkeebs.def.file." + LEGACY_VPid), null);
assert.equal(listDefinitions().length, 1);

// --- an identified keyboard picks its saved definition up --------------------
function fake(vid, pid, name, usagePage) {
  const listeners = new Set();
  return {
    vendorId: vid,
    productId: pid,
    productName: name,
    opened: false,
    collections: [{ usagePage, usage: 0x06 }],
    async open() {
      this.opened = true;
    },
    async close() {
      this.opened = false;
    },
    addEventListener: (t, f) => listeners.add(f),
    removeEventListener: (t, f) => listeners.delete(f),
    async sendReport() {},
    async sendFeatureReport() {},
    async receiveFeatureReport() {
      return new DataView(new ArrayBuffer(64));
    },
  };
}

(async () => {
  const kb = await openKeyboard(fake(VID, PID, "Unknown board", 0x01));
  assert.equal(kb.family, "identified");
  assert.equal(kb.definitionSource, "file");
  assert.equal(kb.name, "Definition fixture");
  assert.equal(kb.exactLayout.name, "Definition fixture");
  assert.equal(kb.exactLayout.exact, true);
  assert.equal(kb.exactLayout.keys.length, 6);
  assert.equal(kb.facts[0][0], "Keys");
  assert.equal(kb.facts[0][1], 6);
  // No driver: layout and name only, never keymap or lighting writes.
  assert.equal(kb.keymap, null);
  assert.equal(kb.lighting, null);
  assert.equal(kb.macros, null);
  await kb.close();

  removeDefinition(VPid);
  assert.equal(localStorage.getItem("allkeebs.def.file." + VPid), null);
  assert.equal(listDefinitions().length, 0);

  const bare = await openKeyboard(fake(VID, PID, "Unknown board", 0x01));
  assert.equal(bare.family, "identified");
  assert.equal(bare.name, "Unknown board");
  assert.equal(bare.exactLayout, null);
  await bare.close();

  console.log(
    "saved definitions: validation, save/list/remove and identified-keyboard load passed",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
