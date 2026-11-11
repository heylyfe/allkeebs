// Builds the compact keyboard database from the-via/keyboards and qmk_firmware.
// usage: node tools/build-db.mjs <via repo> <qmk repo> <out.json.gz>
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { gzipSync } from "node:zlib";
const [viaDir, qmkDir, out, vialDir, extraDir] = process.argv.slice(2);
const walk = (d, acc = []) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
};
const hx = (v) => (typeof v === "string" ? parseInt(v, 16) : +v);
const E = (v) => Math.round(v * 8); // eighth-unit integers

/* ---- KLE (VIA raw keymap) to keys, default option choices only ---- */
function kle(rows) {
  const keys = [];
  let y = 0,
    rx = 0,
    ry = 0;
  for (const row of rows || []) {
    if (!Array.isArray(row)) continue;
    let x = rx,
      w = 1,
      h = 1,
      decal = false;
    for (const it of row) {
      if (it && typeof it === "object") {
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
      if (m && !decal && (!opt || opt[1] === 0)) keys.push({ r: +m[1], c: +m[2], x, y, w, h });
      x += w;
      w = 1;
      h = 1;
      decal = false;
    }
    y += 1;
  }
  return keys;
}
/* ---- QMK hierarchical info.json/keyboard.json ---- */
const deep = (a, b) => {
  if (Array.isArray(b) || typeof b !== "object" || b === null) return b;
  const o = { ...(a && typeof a === "object" && !Array.isArray(a) ? a : {}) };
  for (const k of Object.keys(b)) o[k] = deep(o[k], b[k]);
  return o;
};
const qmkRoot = join(qmkDir, "keyboards");
const files = walk(qmkRoot).filter((p) => /(^|\/)(info|keyboard)\.json$/.test(p));
const byDir = new Map();
for (const f of files) {
  const d = dirname(f);
  (byDir.get(d) || byDir.set(d, []).get(d)).push(f);
}
function merged(dir) {
  const chain = [];
  let d = dir;
  while (d.startsWith(qmkRoot) && d !== qmkRoot) {
    chain.unshift(d);
    d = dirname(d);
  }
  let o = {};
  for (const c of chain)
    for (const f of (byDir.get(c) || []).sort()) {
      try {
        o = deep(o, JSON.parse(readFileSync(f, "utf8")));
      } catch {
        /* bad json */
      }
    }
  return o;
}
function pickLayout(layouts) {
  const names = Object.keys(layouts || {}).filter(
    (n) => Array.isArray(layouts[n]?.layout) && layouts[n].layout.length,
  );
  if (!names.length) return null;
  const score = (n) =>
    /ansi/i.test(n) && !/iso|split|wkl|tsangan/i.test(n)
      ? 0
      : n === "LAYOUT"
        ? 1
        : /ansi/i.test(n)
          ? 2
          : /all/i.test(n)
            ? 9
            : /iso/i.test(n)
              ? 6
              : 4;
  names.sort((a, b) => score(a) - score(b) || layouts[b].layout.length - layouts[a].layout.length);
  return layouts[names[0]].layout;
}
const qmk = new Map(); // vidpid -> [{name, maker, keys, leaf}]
for (const dir of byDir.keys()) {
  const leaf = (byDir.get(dir) || []).some((f) => f.endsWith("keyboard.json"));
  const m = merged(dir);
  const usb = m.usb || {};
  if (!usb.vid || !usb.pid) continue;
  const lay = pickLayout(m.layouts);
  if (!lay) continue;
  const keys = lay
    .filter((k) => Array.isArray(k.matrix))
    .map((k) => ({
      r: k.matrix[0],
      c: k.matrix[1],
      x: k.x || 0,
      y: k.y || 0,
      w: k.w || 1,
      h: k.h || 1,
      l: typeof k.label === "string" ? k.label : undefined,
    }));
  if (!keys.length) continue;
  const id = hx(usb.vid) * 65536 + hx(usb.pid);
  (qmk.get(id) || qmk.set(id, []).get(id)).push({
    name: m.keyboard_name || relative(qmkRoot, dir),
    maker: m.manufacturer || "",
    keys,
    leaf,
    path: relative(qmkRoot, dir),
    rgb: !!m.features?.rgb_matrix,
    ug: !!m.features?.rgblight,
  });
}
/* ---- VIA ---- */
const via = new Map();
const viaSources = [
  join(viaDir, "v3"),
  join(viaDir, "src"),
  vialDir && join(vialDir, "keyboards"),
  extraDir,
].filter((d) => d && existsSync(d));
for (const base of viaSources) {
  for (const f of walk(base).filter((p) =>
    base.includes("keyboards") ? p.endsWith("vial.json") : p.endsWith(".json"),
  )) {
    let j;
    try {
      j = JSON.parse(readFileSync(f, "utf8"));
    } catch {
      continue;
    }
    if (!j.vendorId || !j.productId || !j.layouts?.keymap) continue;
    const id = hx(j.vendorId) * 65536 + hx(j.productId);
    if (via.has(id)) continue;
    const keys = kle(j.layouts.keymap);
    if (!keys.length) continue;
    via.set(id, {
      name: j.name,
      keys,
      rows: j.matrix?.rows,
      cols: j.matrix?.cols,
      menus: j.menus ?? (j.lighting ? { lighting: j.lighting } : null),
      keycodes: j.keycodes || null,
      custom: j.customKeycodes || null,
      path: f,
    });
  }
}
/* ---- merge into compact tables ---- */
const layouts = [],
  layoutIdx = new Map(),
  extras = [],
  extraIdx = new Map(),
  makers = [],
  makerIdx = new Map();
const intern = (arr, map, v) => {
  const k = JSON.stringify(v);
  if (map.has(k)) return map.get(k);
  map.set(k, arr.length);
  arr.push(v);
  return arr.length - 1;
};
const enc = (keys) => {
  const minX = Math.min(...keys.map((k) => k.x)),
    minY = Math.min(...keys.map((k) => k.y));
  return keys.map((k) => {
    const a = [k.r, k.c, E(k.x - minX), E(k.y - minY)];
    if (k.w !== 1 || k.h !== 1 || k.l) a.push(E(k.w));
    if (k.h !== 1 || k.l) a.push(E(k.h));
    if (k.l) a.push(k.l);
    return a;
  });
};
const norm = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const boards = [];
let skipped = 0,
  labelled = 0;
const ids = new Set([...via.keys(), ...qmk.keys()]);
for (const id of [...ids].sort((a, b) => a - b)) {
  const v = via.get(id),
    qs = qmk.get(id) || [];
  const names = new Set(qs.map((q) => norm(q.name)));
  let q = null;
  if (qs.length) {
    if (v) q = qs.find((x) => norm(x.name) === norm(v.name)) || (names.size === 1 ? qs[0] : null);
    else if (names.size === 1) q = qs.find((x) => x.leaf) || qs[0];
    else {
      skipped++;
      continue;
    }
  }
  let keys;
  if (v) {
    keys = v.keys.map((k) => ({ ...k }));
    if (q) {
      const lab = new Map(q.keys.filter((k) => k.l).map((k) => [k.r + "," + k.c, k.l]));
      let n = 0;
      for (const k of keys) {
        const l = lab.get(k.r + "," + k.c);
        if (l) {
          k.l = l;
          n++;
        }
      }
      if (n) labelled++;
    }
  } else keys = q.keys;
  const name = String(
      (typeof v?.name === "string" && v.name) ||
        q?.name ||
        (v
          ? v.path
              .split("/")
              .pop()
              .replace(/\.json$/, "")
              .replace(/vial$/, "")
              .replace(/[-_]/g, " ")
          : "") ||
        "Keyboard",
    ).trim(),
    maker = String(q?.maker || "").trim();
  const flags = (v ? 1 : 0) | (q ? 2 : 0) | (q?.rgb ? 4 : 0) | (q?.ug ? 8 : 0);
  const ex =
    v && (v.menus || v.keycodes || v.custom)
      ? intern(extras, extraIdx, {
          m: v.menus || undefined,
          k: v.keycodes || undefined,
          c: v.custom || undefined,
        })
      : -1;
  const rows = v?.rows || Math.max(...keys.map((k) => k.r)) + 1,
    cols = v?.cols || Math.max(...keys.map((k) => k.c)) + 1;
  const row = [
    id,
    name,
    maker ? intern(makers, makerIdx, maker) : -1,
    intern(layouts, layoutIdx, enc(keys)),
    flags,
    rows,
    cols,
  ];
  if (ex >= 0) row.push(ex);
  boards.push(row);
}
const db = { v: 1, built: new Date().toISOString().slice(0, 10), makers, layouts, extras, boards };
const json = JSON.stringify(db),
  gz = gzipSync(json, { level: 9 });
writeFileSync(out, gz);
console.log(
  `boards ${boards.length} (via ${via.size}, qmk ids ${qmk.size}, ambiguous skipped ${skipped}, via boards with legends ${labelled})`,
);
console.log(
  `layouts ${layouts.length}, extras ${extras.length}, makers ${makers.length}; json ${(json.length / 1024).toFixed(0)} KB, gzip ${(gz.length / 1024).toFixed(0)} KB`,
);
