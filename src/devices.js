// Connects keyboards through @openmouse/keyboard-protocol and wraps every driver in one adapter shape:
// { id, family, name, brand, connection, facts, layoutSource, lighting, keymap, macros, matrix, notes }.
// Anything a driver does not implement is left null, and the UI hides it.
import {
  createSupportedClient,
  SUPPORTED_HID_FILTERS,
  deviceBrand,
} from "@openmouse/keyboard-protocol/drivers";

import * as via from "@openmouse/keyboard-protocol/via";
import { keychronLayoutFor } from "@openmouse/keyboard-protocol/keychron";
import { ARBITER_LIGHT_EFFECTS } from "@openmouse/keyboard-protocol/arbiter";
import { exactLayout, sizeClass, assignCodes } from "./layouts.js";
import { keyboardDb, servedDefinition } from "./kbdb.js";
import { SONIX_FILTERS, sonixClient, sonixFamilyOf } from "./drivers/sonix.js";
import xz from "xz-decompress";
import { hsv } from "./effects.js";

export const hex4 = (n) => "0x" + (n >>> 0).toString(16).toUpperCase().padStart(4, "0");

const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem("allkeebs." + k);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem("allkeebs." + k, JSON.stringify(v));
    } catch {
      /* storage blocked */
    }
  },
};

export { store };

export function hidSupport() {
  if (!("hid" in navigator)) return "missing";
  try {
    const fp = document.permissionsPolicy || document.featurePolicy;
    if (fp && fp.allowsFeature && !fp.allowsFeature("hid")) return "blocked";
  } catch {
    /* ignore */
  }
  return "ok";
}

const VIA_FILTER = { usagePage: 0xff60, usage: 0x61 };

const isVia = (d) =>
  d.collections.some((c) => c.usagePage === VIA_FILTER.usagePage && c.usage === VIA_FILTER.usage);

/** Opens the browser's device picker. `any` lists every HID device instead of known keyboards. */
// Known drivers first, then any keyboard (usage 1:6) or media-key (0x0C:1) collection,
// so every keyboard shows up in Chrome's picker.
const ANY_KEYBOARD = [
  { usagePage: 0x01, usage: 0x06 },
  { usagePage: 0x0c, usage: 0x01 },
];

export async function pickKeyboards(any) {
  return navigator.hid.requestDevice({
    filters: any ? [] : [...SUPPORTED_HID_FILTERS, ...SONIX_FILTERS, ...ANY_KEYBOARD],
  });
}

export async function grantedKeyboards() {
  if (hidSupport() !== "ok") return [];
  return navigator.hid.getDevices();
}

/** Remove repeated references to the same WebHID handle without guessing physical identity. */
export function distinctHidHandles(list) {
  return [...new Set(list)];
}

// VIA built-in menus (VIA app names these instead of spelling them out)
const RGB_MATRIX_EFFECTS = [
  "All Off",
  "Solid Color",
  "Alphas Mods",
  "Gradient Up/Down",
  "Gradient Left/Right",
  "Breathing",
  "Band Sat.",
  "Band Val.",
  "Pinwheel Sat.",
  "Pinwheel Val.",
  "Spiral Sat.",
  "Spiral Val.",
  "Cycle All",
  "Cycle Left/Right",
  "Cycle Up/Down",
  "Rainbow Moving Chevron",
  "Cycle Out/In",
  "Cycle Out/In Dual",
  "Cycle Pinwheel",
  "Cycle Spiral",
  "Dual Beacon",
  "Rainbow Beacon",
  "Rainbow Pinwheels",
  "Raindrops",
  "Jellybean Raindrops",
  "Hue Breathing",
  "Hue Pendulum",
  "Hue Wave",
  "Pixel Rain",
  "Pixel Flow",
  "Pixel Fractal",
  "Typing Heatmap",
  "Digital Rain",
  "Solid Reactive Simple",
  "Solid Reactive",
  "Solid Reactive Wide",
  "Solid Reactive Multi Wide",
  "Solid Reactive Cross",
  "Solid Reactive Multi Cross",
  "Solid Reactive Nexus",
  "Solid Reactive Multi Nexus",
  "Splash",
  "Multi Splash",
  "Solid Splash",
  "Solid Multi Splash",
];

const RGBLIGHT_EFFECTS = [
  "All Off",
  "Solid Color",
  "Breathing 1",
  "Breathing 2",
  "Breathing 3",
  "Breathing 4",
  "Rainbow Mood 1",
  "Rainbow Mood 2",
  "Rainbow Mood 3",
  "Rainbow Swirl 1",
  "Rainbow Swirl 2",
  "Rainbow Swirl 3",
  "Rainbow Swirl 4",
  "Rainbow Swirl 5",
  "Rainbow Swirl 6",
  "Snake 1",
  "Snake 2",
  "Snake 3",
  "Snake 4",
  "Snake 5",
  "Snake 6",
  "Knight 1",
  "Knight 2",
  "Knight 3",
  "Christmas",
  "Gradient 1",
  "Gradient 2",
  "Gradient 3",
  "Gradient 4",
  "Gradient 5",
  "Gradient 6",
  "Gradient 7",
  "Gradient 8",
  "Gradient 9",
  "Gradient 10",
  "RGB Test",
  "Alternating",
];

const lightMenu = (label, ch, token, effects) => ({
  label: "Lighting",
  content: [
    {
      label,
      content: [
        {
          label: "Brightness",
          type: "range",
          options: [0, 255],
          content: [`id_${token}_brightness`, ch, 1],
          legacyId: 0x80,
        },
        {
          label: "Effect",
          type: "dropdown",
          options: effects,
          content: [`id_${token}_effect`, ch, 2],
          legacyId: 0x81,
        },
        {
          showIf: `{id_${token}_effect} != 0`,
          label: "Effect speed",
          type: "range",
          options: [0, 255],
          content: [`id_${token}_effect_speed`, ch, 3],
          legacyId: 0x82,
        },
        {
          showIf: `{id_${token}_effect} != 0`,
          label: "Colour",
          type: "color",
          content: [`id_${token}_color`, ch, 4],
          legacyId: 0x83,
        },
      ],
    },
  ],
});

const BUILT_IN = {
  qmk_rgb_matrix: () => lightMenu("RGB matrix", 3, "qmk_rgb_matrix", RGB_MATRIX_EFFECTS),
  qmk_rgblight: () => lightMenu("Underglow", 2, "qmk_rgblight", RGBLIGHT_EFFECTS),
  qmk_backlight: () => ({
    label: "Lighting",
    content: [
      {
        label: "Backlight",
        content: [
          {
            label: "Brightness",
            type: "range",
            options: [0, 255],
            content: ["id_qmk_backlight_brightness", 1, 1],
            legacyId: 0x09,
          },
          {
            label: "Effect",
            type: "dropdown",
            options: [
              ["Off", 0],
              ["Breathing", 1],
            ],
            content: ["id_qmk_backlight_effect", 1, 2],
            legacyId: 0x0a,
          },
        ],
      },
    ],
  }),
};

const expandMenus = (menus) =>
  menus.flatMap((m) => (typeof m === "string" ? (BUILT_IN[m] ? [BUILT_IN[m]()] : []) : [m]));

/** Raw VIA JSON (KLE keymap, as vendors publish it) to the served shape the parser reads. */
function kleToServed(j) {
  const keys = [],
    optionKeys = {};
  let y = 0,
    r = 0,
    rx = 0,
    ry = 0;
  for (const row of j.layouts.keymap || []) {
    if (!Array.isArray(row)) continue;
    let x = rx,
      w = 1,
      h = 1,
      x2,
      y2,
      w2,
      h2,
      decal = false;
    for (const it of row) {
      if (it && typeof it === "object") {
        if (it.r != null) r = it.r;
        if (it.rx != null) {
          rx = it.rx;
          x = rx;
        }
        if (it.ry != null) {
          ry = it.ry;
          y = ry;
        }
        if (it.x != null) x += it.x;
        if (it.y != null) y += it.y;
        if (it.w != null) w = it.w;
        if (it.h != null) h = it.h;
        if (it.x2 != null) x2 = it.x2;
        if (it.y2 != null) y2 = it.y2;
        if (it.w2 != null) w2 = it.w2;
        if (it.h2 != null) h2 = it.h2;
        if (it.d) decal = true;
        continue;
      }
      if (typeof it !== "string") continue;
      const labels = it.split("\n"),
        m = (labels[0] || "").match(/^\s*(\d+)\s*,\s*(\d+)\s*$/);
      let opt = null;
      for (let q = 1; q < labels.length; q++) {
        const o = (labels[q] || "").match(/^\s*(\d+)\s*,\s*(\d+)\s*$/);
        if (o) opt = [+o[1], +o[2]];
      }
      if (m && !decal) {
        const key = { row: +m[1], col: +m[2], x, y, w, h, r, rx, ry };
        if (x2 != null) Object.assign(key, { x2, y2: y2 || 0, w2: w2 || w, h2: h2 || h });
        if (opt) ((optionKeys[opt[0]] ||= {})[opt[1]] ||= []).push(key);
        else keys.push(key);
      }
      x += w;
      w = 1;
      h = 1;
      x2 = y2 = w2 = h2 = undefined;
      decal = false;
    }
    y += 1;
  }
  const hx = (v) => (typeof v === "string" ? parseInt(v, 16) : +v) || 0;
  return {
    ...j,
    vendorProductId: hx(j.vendorId) * 65536 + hx(j.productId),
    layouts: { ...j.layouts, keys, optionKeys, labels: j.layouts.labels || [] },
  };
}

export function parseDefinitionText(text) {
  const j = JSON.parse(text);
  const served = Array.isArray(j.layouts?.keys) ? j : kleToServed(j);
  if (served.vendorProductId == null) {
    const hx = (v) => (typeof v === "string" ? parseInt(v, 16) : +v) || 0;
    served.vendorProductId = hx(j.vendorId) * 65536 + hx(j.productId);
  }
  return via.parseViaDefinition(served);
}

/**
 * The board's VIA definition: a file the user loaded, then usevia.app (v3, then v2),
 * then the last good copy.
 */
async function findDefinition(vid, pid, vialText, reported = "") {
  const vpid = via.viaVendorProductId(vid, pid);
  const own = store.get("def.file." + vpid, null);
  if (own) {
    try {
      return { def: parseDefinitionText(own), source: "file" };
    } catch {
      /* fall through */
    }
  }
  if (vialText) {
    try {
      return { def: parseDefinitionText(vialText), source: "vial" };
    } catch {
      /* fall through */
    }
  }
  try {
    const e = (await keyboardDb()).lookup(vid, pid, reported, store.get("db.pick." + vpid, ""));
    if (e?.hasLayout)
      return { def: via.parseViaDefinition(servedDefinition(e)), source: "db", entry: e };
  } catch {
    /* fall through */
  }
  try {
    for (const ver of ["v3", "v2"]) {
      const res = await fetch(`https://usevia.app/definitions/${ver}/${vpid}.json`);
      if (res.status === 404) continue;
      if (!res.ok) throw new Error("status " + res.status);
      const text = await res.text();
      try {
        const def = parseDefinitionText(text);
        store.set("def.cache." + vpid, text);
        return { def, source: "usevia" };
      } catch {
        /* HTML page = not found */
      }
    }
    return { def: null, source: null, error: "notFound" };
  } catch {
    const cached = store.get("def.cache." + vpid, null);
    if (cached) {
      try {
        return { def: parseDefinitionText(cached), source: "cache" };
      } catch {
        /* ignore */
      }
    }
    return { def: null, source: null, error: "offline" };
  }
}

const rgbOf = (p) => hsv(p.h, p.s / 100, 1).map((v) => Math.round(v * 255));

const connText = (status) =>
  status.connectionType && status.connectionType !== "Unknown"
    ? status.connectionType
    : "Connected";

function base(device, client, status) {
  return {
    id: `${device.vendorId}:${device.productId}:${Math.random().toString(36).slice(2, 7)}`,
    key: `${device.vendorId}:${device.productId}`,
    device,
    client,
    status,
    brand: status.brand || deviceBrand(client),
    name: status.name || device.productName || "Keyboard",
    connection: connText(status),
    connectionDetail: status.connectionDetail || "",
    vid: device.vendorId,
    pid: device.productId,
    facts: [],
    identity: [],
    notes: [],
    exactLayout: null,
    layoutHint: null,
    lighting: null,
    keymap: null,
    macros: null,
    matrix: null,
    definition: null,
    async close() {
      try {
        await client.close();
      } catch {
        /* already gone */
      }
    },
  };
}

function identityRows(kb, status) {
  const rows = [
    ["Vendor and product", `${hex4(kb.vid)} : ${hex4(kb.pid)}`],
    ["Driver", kb.brand],
  ];
  if (status.firmwareVersion) rows.push(["Firmware", status.firmwareVersion]);
  for (const line of status.firmware || [])
    if (line && line !== status.firmwareVersion) rows.push(["Firmware detail", line]);
  if (status.serial) rows.push(["Serial", status.serial]);
  if (status.layout) rows.push(["Layout reported", status.layout]);
  if (status.connectionDetail) rows.push(["Connection", status.connectionDetail]);
  return rows;
}

// VIA / QMK
function viaLighting(kb, menus, guessed) {
  const proto = kb.proto;
  const items = menus.flatMap((m) =>
    m.sections.flatMap((s) => s.items.map((it) => ({ ...it, section: s.label || m.label }))),
  );
  const find = (re, type) =>
    items.find((it) => re.test(it.token + " " + it.label) && (!type || it.control.type === type));
  const effect = find(/effect|mode|pattern/i, "dropdown"),
    color = items.find((it) => it.control.type === "color"),
    bright = find(/bright/i, "range"),
    speed = find(/speed/i, "range");
  const wire = (it) => (proto < 11 && it.legacyId !== undefined ? [it.legacyId] : it.ids);
  const itemLen = (it) => (it.control.type === "color" ? 2 : it.bytes);
  const channels = [
    ...new Set(items.map((it) => (proto < 11 && it.legacyId !== undefined ? -1 : it.ids[0]))),
  ];
  async function set(it, value) {
    return kb.client.setCustomValue(wire(it), value, false);
  }
  async function save() {
    for (const ch of channels)
      await kb.client.saveCustomChannel(ch < 0 ? 0 : ch, ch < 0).catch(() => {});
  }
  return {
    kind: "via",
    guessed,
    effects: effect ? effect.control.options.map((o) => ({ name: o.label, value: o.value })) : null,
    has: { color: !!color, brightness: !!bright, speed: !!speed, effect: !!effect },
    menus,
    items,
    async read() {
      const values = {};
      for (const it of items) {
        if (it.control.type === "button") continue;
        const key = it.ids.join(":");
        if (key in values) continue;
        values[key] = await kb.client.readCustomValue(wire(it), itemLen(it)).catch(() => null);
      }
      return values;
    },
    async apply(p, fw) {
      if (effect && fw) await set(effect, via.viaNumberToBytes(fw.value, effect.bytes));
      if (color)
        await set(color, [Math.round(((p.h % 360) / 360) * 255) & 255, Math.round(p.s * 2.55)]);
      if (bright)
        await set(
          bright,
          via.viaNumberToBytes(
            Math.round(
              bright.control.min + ((bright.control.max - bright.control.min) * p.br) / 100,
            ),
            bright.bytes,
          ),
        );
      if (speed)
        await set(
          speed,
          via.viaNumberToBytes(
            Math.round(
              speed.control.min + ((speed.control.max - speed.control.min) * p.speed) / 100,
            ),
            speed.bytes,
          ),
        );
      await save();
    },
    async setItem(it, bytes) {
      await set(it, bytes);
      await save();
    },
    async off() {
      if (bright) {
        await set(bright, via.viaNumberToBytes(0, bright.bytes));
        await save();
      }
    },
  };
}

/**
 * Vial firmware carries its own definition (xz-compressed JSON). Read it over raw HID
 * before the VIA driver attaches.
 */
async function readVialDefinition(device) {
  const vpid = device.vendorId * 65536 + device.productId,
    cached = store.get("def.vial." + vpid, null);
  if (cached) return cached;
  if (!device.opened) await device.open();
  let waiter = null;
  const onRep = (e) => {
    if (waiter) {
      const w = waiter;
      waiter = null;
      w(new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength).slice());
    }
  };
  device.addEventListener("inputreport", onRep);
  const ask = (bytes) =>
    new Promise((res, rej) => {
      const t = setTimeout(() => {
        waiter = null;
        rej(new Error("timeout"));
      }, 400);
      waiter = (r) => {
        clearTimeout(t);
        res(r);
      };
      const buf = new Uint8Array(32);
      buf.set(bytes);
      device.sendReport(0, buf).catch((e) => {
        clearTimeout(t);
        waiter = null;
        rej(e);
      });
    });
  try {
    const id = await ask([0xfe, 0x00]);
    if (id[0] === 0xff || id[0] === 0xfe || id[0] > 32 || id[1] || id[2] || id[3]) return null;
    const sz = await ask([0xfe, 0x01]),
      size = sz[0] | (sz[1] << 8) | (sz[2] << 16) | (sz[3] << 24);
    if (!size || size > 65536) return null;
    const bytes = new Uint8Array(Math.ceil(size / 32) * 32);
    for (let page = 0; page * 32 < size; page++)
      bytes.set(await ask([0xfe, 0x02, page & 255, page >> 8]), page * 32);
    const stream = new xz.XzReadableStream(new Blob([bytes.slice(0, size)]).stream());
    const text = await new Response(stream).text();
    JSON.parse(text);
    store.set("def.vial." + vpid, text);
    return text;
  } catch {
    return null;
  } finally {
    device.removeEventListener("inputreport", onRep);
  }
}

async function viaAdapter(device, client, status, vialText) {
  const kb = base(device, client, status),
    v = status.via || {};
  kb.family = "via";
  kb.proto = v.protocolVersion || 0;
  kb.brand = vialText ? "Vial" : "VIA / QMK";
  kb.layers = v.layerCount || 4;
  kb.facts = [
    ["VIA protocol", kb.proto || "–"],
    ["Layers", v.layerCount ?? "–"],
    ["Macro slots", v.macroCount ?? "–"],
    ["Macro memory", v.macroBufferSize ? v.macroBufferSize + " B" : "–", ""],
  ];
  kb.identity = identityRows(kb, status);
  if (v.uptimeMs != null) kb.identity.push(["Uptime", Math.round(v.uptimeMs / 60000) + " min"]);
  kb.attachDefinition = async (found) => {
    kb.definition = found.def;
    kb.definitionSource = found.source;
    kb.definitionError = found.error || null;
    const def = found.def;
    if (def) {
      kb.choices = via.viaLayoutChoices(def.labels, v.layoutOptions || 0);
      kb.exactLayout = exactLayout("via", def.name, via.viaActiveKeys(def, kb.choices));
      if (found.entry) {
        const lab = new Map(
          found.entry.keys.filter((k) => k.label).map((k) => [k.row + "," + k.col, k.label]),
        );
        for (const k of kb.exactLayout.keys) k.label = lab.get(k.mrow + "," + k.mcol) || "";
      }
      assignCodes(kb.exactLayout);
      kb.maker = found.entry?.maker || kb.maker;
      kb.dbEntry = found.entry || null;
      kb.name = def.name || (status.name && status.name !== "VIA keyboard" ? status.name : kb.name);
      const menus = via.parseViaMenus(expandMenus(def.menus));
      kb.lighting = menus.length ? viaLighting(kb, menus, false) : null;
      const matrix = def.matrix;
      kb.keymap = {
        layers: kb.layers,
        proto: kb.proto,
        picker: via.viaKeycodePicker(kb.proto, kb.layers, v.macroCount || 0, {
          modules: def.keycodeModules,
          custom: def.customKeycodes,
        }),
        describe: (code) => via.describeViaKeycode(code, kb.proto, def.customKeycodes),
        async read() {
          const all = await client.readKeymap(matrix, kb.layers);
          return all.map((layer) =>
            kb.exactLayout.keys.map((k) => layer[k.mrow * matrix.cols + k.mcol]),
          );
        },
        async set(layer, i, code) {
          const k = kb.exactLayout.keys[i];
          return client.setKeycode(layer, k.mrow, k.mcol, code);
        },
      };
      if (matrix.rows * Math.ceil(matrix.cols / 8) <= 28) {
        kb.matrix = {
          async read() {
            const rows = await client.readSwitchMatrix(matrix.rows, matrix.cols);
            const on = new Set();
            kb.exactLayout.keys.forEach((k) => {
              if ((rows[k.mrow] >>> k.mcol) & 1) on.add(k.i);
            });
            return on;
          },
        };
      }
    } else {
      kb.exactLayout = null;
      kb.keymap = null;
      kb.matrix = null;
      kb.lighting = viaLighting(kb, via.parseViaMenus([BUILT_IN.qmk_rgb_matrix()]), true);
    }
  };
  await kb.attachDefinition(
    await findDefinition(device.vendorId, device.productId, vialText, device.productName),
  );
  if ((v.macroCount || 0) > 0) {
    kb.macros = {
      count: v.macroCount,
      size: v.macroBufferSize || 0,
      proto: kb.proto,
      picker: via.viaKeycodePicker(kb.proto, kb.layers, v.macroCount),
      describe: (c) => via.describeViaKeycode(c, kb.proto),
      async read() {
        const m = await client.readMacros();
        return m.macros.map((bytes) => via.decodeViaMacro(bytes, kb.proto));
      },
      encode: (acts) => via.encodeViaMacro(acts, kb.proto),
      async write(list) {
        await client.writeMacros(list.map((acts) => via.encodeViaMacro(acts, kb.proto)));
      },
      macroKeycode: (i) =>
        via.viaKeycodePicker(kb.proto, kb.layers, v.macroCount).find((g) => g.id === "macros")
          ?.keycodes[i] ?? null,
    };
  }
  return kb;
}

// Keychron Hall-effect
async function keychronAdapter(device, client, status) {
  const kb = base(device, client, status),
    k = status.keychron || {};
  kb.family = "keychron";
  const proto = await client.readViaProtocol().catch(() => 12);
  const layers = await client.readLayerCount().catch(() => 4);
  kb.facts = [
    ["Hall effect command set", k.heVersion ?? "–"],
    ["Layers", layers],
    ["Travel step", k.unit ? k.unit + " mm" : "–"],
    ["Matrix", k.rows ? `${k.rows} × ${k.cols}` : "–"],
  ];
  kb.identity = identityRows(kb, status);
  const shape = keychronLayoutFor(device.productId);
  if (shape) {
    kb.exactLayout = exactLayout(
      "keychron",
      kb.name,
      shape.keys.filter((s) => s.encoder == null),
    );
    kb.keymap = {
      layers,
      proto,
      picker: via.viaKeycodePicker(proto, layers, 0),
      describe: (code) => via.describeViaKeycode(code, proto),
      async read() {
        const out = [];
        for (let l = 0; l < layers; l++) {
          const m = await client.readKeymap(l);
          out.push(kb.exactLayout.keys.map((key) => m[key.mrow]?.[key.mcol] ?? 0));
        }
        return out;
      },
      async set(layer, i, code) {
        const key = kb.exactLayout.keys[i];
        return client.setKeycode(layer, key.mrow, key.mcol, code);
      },
    };
  }
  kb.notes.push("Lighting for Keychron Hall-effect boards isn't in the driver yet.");
  return kb;
}

// Brand drivers with lighting
function razerAdapter(device, client, status) {
  const kb = base(device, client, status);
  kb.family = "razer";
  kb.identity = identityRows(kb, status);
  kb.facts = [
    ["Connection", kb.connection],
    ["Firmware", status.firmwareVersion || "–"],
  ];
  const kinds = ["static", "breathing", "spectrum", "wave", "reactive", "off"],
    names = {
      static: "Static",
      breathing: "Breathing",
      spectrum: "Spectrum",
      wave: "Wave",
      reactive: "Reactive",
      off: "Off",
    };
  kb.lighting = {
    kind: "razer",
    effects: kinds.map((k) => ({ name: names[k], value: k })),
    has: { color: true, brightness: true, speed: true, effect: true },
    async apply(p, fw) {
      const [red, green, blue] = rgbOf(p),
        kind = fw ? fw.value : "static";
      const effect =
        kind === "wave"
          ? { kind, direction: 1 }
          : kind === "reactive"
            ? { kind, speed: 1 + Math.round((100 - p.speed) / 50), red, green, blue }
            : kind === "static" || kind === "breathing"
              ? { kind, red, green, blue }
              : { kind };
      await client.setBrightness(Math.round(p.br * 2.55));
      await client.setMatrixEffect(effect);
    },
    async off() {
      await client.setMatrixEffect({ kind: "off" });
    },
  };
  return kb;
}

export async function turnOffLogitechLighting(client, L) {
  // `illumination` reports the advertised 0x8040 capability; `illuminationEnabled`
  // is its current state. setIllumination verifies its own read-back.
  if (L.brightness?.illumination) return client.setIllumination(false);
  if (L.lighting?.rgbZones?.length) return client.setRgbEffect("Off");
  // 0x8081 supports writing a volatile solid colour to every advertised zone.
  // Black turns these solid-only zones off without persisting a new device state.
  if (L.lighting?.zones?.length) return client.setSolidColor(0, 0, 0);
  throw new Error("This Logitech keyboard did not report a supported lighting-off command.");
}

function logitechAdapter(device, client, status) {
  const kb = base(device, client, status),
    L = status.logitech || {};
  kb.family = "logitech";
  kb.identity = identityRows(kb, status);
  kb.facts = [
    ["Connection", kb.connection],
    ["Battery", L.battery?.percentage != null ? L.battery.percentage + "%" : "–"],
    ["Polling rate", L.pollingRateHz ? L.pollingRateHz + " Hz" : "–"],
  ];
  const zones = L.lighting?.rgbZones?.length > 0,
    solid = (L.lighting?.zones?.length || 0) > 0,
    br = L.brightness;
  if (zones || solid) {
    const modes = zones ? ["Static", "Cycling", "Wave", "Breathing single"] : ["Static"];
    kb.lighting = {
      kind: "logitech",
      effects: modes.map((m) => ({ name: m, value: m })),
      has: { color: true, brightness: !!br, speed: false, effect: zones },
      async apply(p, fw) {
        const [red, green, blue] = rgbOf(p);
        if (br) await client.setBrightness(Math.round(br.min + ((br.max - br.min) * p.br) / 100));
        if (!fw || fw.value === "Static") {
          if (solid) await client.setSolidColor(red, green, blue, true);
          else await client.setRgbEffect("Static", { red, green, blue });
        } else await client.setRgbEffect(fw.value, { red, green, blue });
      },
      async off() {
        await turnOffLogitechLighting(client, L);
      },
    };
  } else kb.notes.push("This Logitech keyboard didn't report lighting the driver can change.");
  return kb;
}

function steelseriesAdapter(device, client, status) {
  const kb = base(device, client, status);
  kb.family = "steelseries";
  kb.identity = identityRows(kb, status);
  kb.facts = [
    ["Connection", kb.connection],
    ["Firmware", status.firmwareVersion || "–"],
  ];
  kb.lighting = {
    kind: "steelseries",
    effects: null,
    has: { color: true, brightness: true, speed: false, effect: false },
    async apply(p) {
      const [r, g, b] = rgbOf(p).map((v) => Math.round((v * p.br) / 100));
      await client.setSolidLighting(r, g, b);
    },
    async off() {
      await client.setSolidLighting(0, 0, 0);
    },
    note: "SteelSeries lighting is a solid colour here. Your saved on-board lighting comes back when you choose Hand back.",
    async handBack() {
      await client.clearLighting();
    },
  };
  return kb;
}

function arbiterAdapter(device, client, status) {
  const kb = base(device, client, status);
  kb.family = "arbiter";
  kb.identity = identityRows(kb, status);
  kb.facts = [
    ["Connection", kb.connection],
    ["Firmware", status.firmwareVersion || "–"],
  ];
  kb.lighting = {
    kind: "arbiter",
    effects: ARBITER_LIGHT_EFFECTS.map((n, i) => ({ name: n.replace(/_/g, " "), value: i })),
    has: { color: true, brightness: false, speed: false, effect: true },
    async apply(p, fw) {
      const cur = await client.readLightEffect();
      const [red, green, blue] = rgbOf(p);
      await client.setLightEffect({
        ...cur,
        on: true,
        effect: fw ? fw.value : cur.effect,
        colors: cur.colors.map(() => ({ red, green, blue })),
      });
    },
    async off() {
      const cur = await client.readLightEffect();
      await client.setLightEffect({ ...cur, on: false });
    },
  };
  return kb;
}

function plainAdapter(device, client, status, family, note) {
  const kb = base(device, client, status);
  kb.family = family;
  kb.identity = identityRows(kb, status);
  kb.facts = [
    ["Connection", kb.connection],
    ["Firmware", status.firmwareVersion || "–"],
  ];
  if (status.profileCount) kb.facts.push(["On-board profiles", status.profileCount]);
  if (note) kb.notes.push(note);
  return kb;
}

/**
 * EVision and Cherry boards (see drivers/sonix.js). Lighting only: built-in effects, colour,
 * brightness and speed. Ported from OpenRGB and not yet tried on a real keyboard.
 */
async function sonixAdapter(device, family, log) {
  const client = sonixClient(device, family);
  await client.open();
  log(`${family.brand} driver opened ${device.productName || "keyboard"}`);
  const kb = base(device, client, { brand: family.brand, name: device.productName });
  kb.family = "sonix";
  kb.experimental = true;
  kb.identity = identityRows(kb, {});
  kb.facts = [
    ["Connection", kb.connection],
    ["Effects on the keyboard", family.modes.length],
  ];
  const effects = family.modes.map(([name, value]) => ({ name, value }));
  const staticMode = effects[0];
  kb.lighting = {
    kind: "sonix",
    effects,
    has: { color: true, brightness: true, speed: true, effect: true },
    note:
      "Experimental: this driver comes from OpenRGB and hasn’t been tried on this keyboard yet. " +
      "Changes are saved on the keyboard, like its own software does.",
    async apply(p, fw) {
      const mode = (fw || staticMode).value;
      const brightness = Math.round((p.br / 100) * 4);
      const speed = Math.round(((100 - p.speed) / 100) * family.slowest);
      await client.setMode(mode, brightness, speed, rgbOf(p));
    },
    async off() {
      await client.setMode(staticMode.value, 0, 0, [0, 0, 0]);
    },
  };
  kb.notes.push(
    `allkeebs drives this ${family.brand} keyboard’s lighting with a driver ported from OpenRGB. ` +
      "Keys and macros aren’t supported.",
  );
  return kb;
}

/**
 * A keyboard no driver can configure. It's identified from the database or its name and
 * still gets a layout and the key test.
 */
async function identifiedAdapter(device, why) {
  const e = await keyboardDb()
    .then((db) => db.lookup(device.vendorId, device.productId))
    .catch(() => null);
  const status = {
    brand: "Generic HID",
    name: e?.name || device.productName || "Keyboard",
    connectionType: "Unknown",
    firmware: [],
  };
  const kb = base(device, null, status);
  kb.family = "identified";
  kb.brand = e ? "Database" : "Generic HID";
  kb.connection = "Connected";
  kb.identified = true;
  kb.maker = e?.maker || "";
  kb.close = async () => {};
  kb.identity = [
    ["Vendor and product", `${hex4(kb.vid)} : ${hex4(kb.pid)}`],
    ["Name reported", device.productName || "–"],
  ];
  if (e) kb.identity.push(["Database entry", `${e.name}${e.maker ? ", " + e.maker : ""}`]);
  if (e?.hasLayout) {
    kb.exactLayout = exactLayout("db", e.name, e.keys);
    for (const k of kb.exactLayout.keys) k.label = k.label || "";
    assignCodes(kb.exactLayout);
  }
  kb.facts = [
    ["Keys", e?.hasLayout ? e.keyCount : "–"],
    ["Known from", !e ? "Its name" : e.via ? "VIA" : e.hasLayout ? "QMK" : "Keyboard database"],
  ];
  kb.notes.push(
    why ||
      (e?.via
        ? "This keyboard is in the VIA database but didn’t answer VIA. Switch it to wired mode and connect again."
        : "allkeebs recognises this keyboard, but its maker uses a private protocol for lighting and keys. The layout and key test work."),
  );
  return kb;
}

/**
 * Several boards can share one USB id. Remember which one this keyboard is and load its
 * definition from the database.
 */
export async function pickDatabaseBoard(kb, name) {
  store.set("db.pick." + via.viaVendorProductId(kb.vid, kb.pid), name);
  await kb.attachDefinition(await findDefinition(kb.vid, kb.pid, null, kb.device?.productName));
}

/** Opens one HID device with the best driver and returns its adapter. */
export async function openKeyboard(device, log = () => {}) {
  const kb = await openWithDriver(device, log);
  await addSizeHint(kb, device).catch(() => {});
  return kb;
}

/**
 * Without an exact layout, the database can still say how big the keyboard is: from its USB id,
 * or from a known model name inside the name it reports.
 */
async function addSizeHint(kb, device) {
  if (kb.exactLayout || kb.layoutHint) return;
  const db = await keyboardDb();
  const byId = db.lookup(device.vendorId, device.productId);
  const hit = byId?.size ? byId : db.matchName(device.productName) || db.matchName(kb.name);
  if (!hit?.size) return;
  kb.layoutHint = hit.size;
  const name =
    hit.maker && !hit.name.toLowerCase().startsWith(hit.maker.toLowerCase())
      ? `${hit.maker} ${hit.name}`
      : hit.name;
  kb.layoutWhy = `the keyboard database entry for ${name}`;
  if (hit.kind === "model" && !kb.identity.some(([label]) => label === "Database entry"))
    kb.identity.push(["Database entry", name]);
}

async function openWithDriver(device, log) {
  const family = sonixFamilyOf(device);
  if (family) return sonixAdapter(device, family, log);
  const client = createSupportedClient(device);
  if (!client) {
    log(`No driver for ${device.productName || "device"}, identifying it`);
    return identifiedAdapter(device);
  }
  let vialText = null;
  if (deviceBrand(client) === "VIA") {
    vialText = await readVialDefinition(device).catch(() => null);
    if (vialText) log("Read the Vial definition stored on the keyboard");
  }
  let status;
  try {
    await client.open();
    status = await client.readStatus();
  } catch (e) {
    await client.close().catch(() => {});
    log(`${deviceBrand(client)} driver failed: ${e.message}`);
    if (deviceBrand(client) === "VIA") return identifiedAdapter(device);
    throw e;
  }
  const usbId = `${hex4(device.vendorId)}:${hex4(device.productId)}`;
  log(`${deviceBrand(client)} driver opened ${device.productName || "device"} (${usbId})`);
  const fam = (status.ui && status.ui.family) || deviceBrand(client).toLowerCase();
  if (status.via || /via/.test(fam)) return viaAdapter(device, client, status, vialText);
  if (status.keychron) return keychronAdapter(device, client, status);
  if (status.razer) return razerAdapter(device, client, status);
  if (status.logitech) return logitechAdapter(device, client, status);
  if (status.steelseries) return steelseriesAdapter(device, client, status);
  if (status.arbiter) return arbiterAdapter(device, client, status);
  if (status.wuque)
    return plainAdapter(
      device,
      client,
      status,
      "wuque",
      "Wuque lighting, keymap and macros are read by the driver but not yet safe to write.",
    );
  if (status.kochi)
    return plainAdapter(
      device,
      client,
      status,
      "kochi",
      "The Kochi driver covers Windows and Mac mode only.",
    );
  return plainAdapter(
    device,
    client,
    status,
    "wooting",
    "Wooting lighting lives in on-board profiles that the driver reads but doesn't write yet.",
  );
}

// Demo board: every feature, nothing sent anywhere
export function demoAdapter(layoutFor) {
  const fx = RGB_MATRIX_EFFECTS.map((n, i) => ({ name: n, value: i }));
  const keymapStore = {};
  const kb = {
    id: "demo",
    key: "demo",
    family: "demo",
    demo: true,
    name: "Demo keyboard",
    brand: "Simulated",
    connection: "Simulated",
    connectionDetail: "",
    vid: 0,
    pid: 0,
    proto: 12,
    layers: 4,
    facts: [
      ["VIA protocol", 12],
      ["Layers", 4],
      ["Macro slots", 16],
      ["Macro memory", "1024 B"],
    ],
    identity: [["Driver", "None. This board only exists in your browser."]],
    notes: [],
    exactLayout: null,
    layoutHint: null,
    definition: null,
    lighting: {
      kind: "demo",
      effects: fx,
      has: { color: true, brightness: true, speed: true, effect: true },
      async apply() {},
      async off() {},
    },
    macros: {
      count: 16,
      size: 1024,
      proto: 12,
      picker: via.viaKeycodePicker(12, 4, 16),
      describe: (c) => via.describeViaKeycode(c, 12),
      encode: (acts) => via.encodeViaMacro(acts, 12),
      async read() {
        return store.get("demo.macros", null) || Array.from({ length: 16 }, () => []);
      },
      async write(list) {
        store.set("demo.macros", list);
      },
      macroKeycode: (i) =>
        via.viaKeycodePicker(12, 4, 16).find((g) => g.id === "macros")?.keycodes[i] ?? null,
    },
    matrix: null,
    async close() {},
  };
  kb.keymap = {
    layers: 4,
    proto: 12,
    picker: via.viaKeycodePicker(12, 4, 16),
    describe: (code) => via.describeViaKeycode(code, 12),
    async read() {
      const layout = layoutFor(kb);
      return [0, 1, 2, 3].map((l) =>
        layout.keys.map(
          (k, i) =>
            keymapStore[`${layout.id}:${l}:${i}`] ??
            (l === 0
              ? k.code === "Fn"
                ? (via.viaKeycodeFromLayoutName("MO(1)", 12) ?? 0)
                : (via.viaKeycodeFromEventCode(k.code || "") ?? 0)
              : 1),
        ),
      );
    },
    async set(layer, i, code) {
      keymapStore[`${layoutFor(kb).id}:${layer}:${i}`] = code;
      return code;
    },
  };
  return kb;
}

export const VIA_FROM_EVENT = via.viaKeycodeFromEventCode;
export const EVENT_FROM_VIA = via.viaEventCodeFromKeycode;
export const VIA_DELAY_PROTOCOL = via.VIA_MACRO_DELAY_PROTOCOL;
export { sizeClass };
