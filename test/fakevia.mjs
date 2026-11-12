// A fake VIA keyboard at the HID report level, driven through the real @openmouse drivers.
globalThis.localStorage = (() => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i],
  };
})();
globalThis.fetch = async () => {
  throw new Error("offline");
};
const ROWS = 6,
  COLS = 16,
  LAYERS = 4;
// Keyboard state, reset before each run so the direct and the adapter run see the same board.
let keymap, macros, custom, sent;
function reset() {
  keymap = new Uint8Array(LAYERS * ROWS * COLS * 2);
  for (let i = 0; i < ROWS * COLS; i++) keymap[i * 2 + 1] = 4 + (i % 26);
  macros = new Uint8Array(1024);
  custom = {};
  sent = [];
}
const listeners = new Set();
const device = {
  vendorId: 0x1234,
  productId: 0x5678,
  productName: "Rainy75",
  opened: false,
  collections: [
    {
      usagePage: 0xff60,
      usage: 0x61,
      inputReports: [],
      outputReports: [],
      featureReports: [],
      children: [],
    },
  ],
  async open() {
    this.opened = true;
  },
  async close() {
    this.opened = false;
  },
  addEventListener(t, f) {
    listeners.add(f);
  },
  removeEventListener(t, f) {
    listeners.delete(f);
  },
  async sendFeatureReport() {},
  async receiveFeatureReport() {
    return new DataView(new ArrayBuffer(32));
  },
  async sendReport(id, data) {
    const q = new Uint8Array(
        data.buffer ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data,
      ),
      r = new Uint8Array(32);
    r.set(q);
    const c = q[0];
    sent.push([...q.slice(0, 8)]);
    if (c === 1) {
      r[1] = 0;
      r[2] = 12;
    } else if (c === 2) {
      if (q[1] === 3) {
        r[2] = 0;
        r[3] = 0b101;
      } else {
        r[2] = r[3] = r[4] = r[5] = 0;
      }
    } else if (c === 0x11) r[1] = LAYERS;
    else if (c === 0x0c) r[1] = 16;
    else if (c === 0x0d) {
      r[1] = 4;
      r[2] = 0;
    } else if (c === 0x0e) {
      const off = (q[1] << 8) | q[2];
      for (let i = 0; i < q[3]; i++) r[4 + i] = macros[off + i];
    } else if (c === 0x0f) {
      const off = (q[1] << 8) | q[2];
      for (let i = 0; i < q[3]; i++) macros[off + i] = q[4 + i];
    } else if (c === 0x12) {
      const off = (q[1] << 8) | q[2];
      for (let i = 0; i < q[3]; i++) r[4 + i] = keymap[off + i];
    } else if (c === 0x04) {
      const o = ((q[1] * ROWS + q[2]) * COLS + q[3]) * 2;
      r[4] = keymap[o];
      r[5] = keymap[o + 1];
    } else if (c === 0x05) {
      const o = ((q[1] * ROWS + q[2]) * COLS + q[3]) * 2;
      keymap[o] = q[4];
      keymap[o + 1] = q[5];
    } else if (c === 0x07) {
      custom[q[1] + ":" + q[2]] = [...q.slice(3, 6)];
    } else if (c === 0x08) {
      const v = custom[q[1] + ":" + q[2]] || [0, 0, 0];
      r.set(v, 3);
    } else if (c === 0x09) {
    } else r[0] = 0xff;
    queueMicrotask(() => {
      for (const f of listeners) f({ device, reportId: 0, data: new DataView(r.buffer) });
    });
  },
};
// A raw vendor-style VIA JSON (KLE keymap), the kind Wobkey publishes.
const row = (r, n, extra = {}) => [extra, ...Array.from({ length: n }, (_, c) => `${r},${c}`)];
const raw = {
  name: "Rainy75 test",
  vendorId: "0x1234",
  productId: "0x5678",
  matrix: { rows: ROWS, cols: COLS },
  menus: ["qmk_rgb_matrix"],
  keycodes: ["qmk_lighting"],
  layouts: {
    labels: [["Split space", "No", "Yes"]],
    keymap: [
      row(0, 14),
      [{ y: 0.25 }, ...Array.from({ length: 15 }, (_, c) => `1,${c}`)],
      row(2, 15),
      row(3, 14),
      row(4, 14),
      [
        "5,0",
        "5,1",
        { w: 6.25 },
        "5,2\n\n\n0,0",
        { x: -6.25, w: 3 },
        "5,3\n\n\n0,1",
        "5,4\n\n\n0,1",
        "5,5",
        "5,6",
      ],
    ],
  },
};
localStorage.setItem(
  "allkeebs.def.file." + (0x1234 * 65536 + 0x5678),
  JSON.stringify(JSON.stringify(raw)),
);
import assert from "node:assert/strict";
import { openKeyboard } from "../src/devices.js";
import { createHidHandle } from "../src/hid/adapter.js";

// The same fake keyboard behind the byte-level backend a non-WebHID transport provides.
const bridged = createHidHandle(device, {
  async connect(onInput) {
    await device.open();
    this.forward = (e) =>
      onInput(e.reportId, new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength));
    device.addEventListener("inputreport", this.forward);
  },
  async disconnect() {
    device.removeEventListener("inputreport", this.forward);
    await device.close();
  },
  send: (id, bytes) => device.sendReport(id, bytes),
  sendFeature: (id, bytes) => device.sendFeatureReport(id, bytes),
  receiveFeature: async (id) => new Uint8Array((await device.receiveFeatureReport(id)).buffer),
});

(async () => {
  reset();
  const direct = await capture(() => run(device));
  const directSent = sent;
  reset();
  const viaAdapter = await capture(() => run(bridged));
  assert.deepEqual(viaAdapter, direct, "drivers behave the same through the HID adapter");
  assert.deepEqual(sent, directSent, "the adapter sends exactly the same reports");
  for (const line of direct) console.log(line);
  console.log(
    `ok   same ${direct.length} results and ${sent.length} reports through the HID adapter`,
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

async function capture(fn) {
  const lines = [],
    log = console.log;
  console.log = (...a) =>
    lines.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));
  try {
    await fn();
  } finally {
    console.log = log;
  }
  return lines;
}

async function run(device) {
  const a = await openKeyboard(device, (m) => console.log("log:", m));
  console.log(
    "family",
    a.family,
    "proto",
    a.proto,
    "name",
    a.name,
    "defSource",
    a.definitionSource,
  );
  console.log(
    "exact keys",
    a.exactLayout.keys.length,
    "W",
    a.exactLayout.W.toFixed(2),
    "H",
    a.exactLayout.H.toFixed(2),
  );
  console.log(
    "lighting effects",
    a.lighting.effects.length,
    a.lighting.has,
    "guessed",
    a.lighting.guessed,
  );
  await a.lighting.apply({ h: 200, s: 80, br: 50, speed: 40 }, a.lighting.effects[23]);
  console.log("custom after apply", JSON.stringify(custom));
  const vals = await a.lighting.read();
  console.log("read values", JSON.stringify(vals));
  const km = await a.keymap.read();
  console.log(
    "keymap layers",
    km.length,
    "layer0 first",
    km[0].slice(0, 5),
    a.keymap.describe(km[0][0]).label,
  );
  await a.keymap.set(1, 3, 0x29);
  const km2 = await a.keymap.read();
  console.log("after set layer1 key3", km2[1][3]);
  await a.macros.write([
    [
      { type: "text", text: "hi" },
      { type: "tap", keycode: 0x28 },
    ],
    [
      { type: "down", keycode: 0xe0 },
      { type: "tap", keycode: 4 },
      { type: "up", keycode: 0xe0 },
      { type: "delay", ms: 120 },
    ],
    ...Array.from({ length: 14 }, () => []),
  ]);
  const back = await a.macros.read();
  console.log("macros back", JSON.stringify(back.slice(0, 3)));
  console.log("matrix pressed", [...(await a.matrix.read())]);
  console.log(
    "macro keycode M0",
    a.macros.macroKeycode(0)?.toString(16),
    a.keymap.describe(a.macros.macroKeycode(0)).label,
  );
  await a.close();
}
