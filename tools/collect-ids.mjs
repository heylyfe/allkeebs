// Collects keyboard USB ids and names from projects that know keyboards without a VIA or QMK
// layout: the USB id list, the Linux kernel, OpenRGB, OpenRazer, ckb-next and sinowealth-kb-tool.
// Writes one JSON list that build-db.mjs folds into the database as "identified" keyboards.
//
// usage: node tools/collect-ids.mjs <data dir> <out.json>

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [dataDir, out] = process.argv.slice(2);
const found = []; // { vid, pid, name, maker, source }

const read = (...parts) => {
  const p = join(dataDir, ...parts);
  return existsSync(p) ? readFileSync(p, "utf8") : "";
};

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

// Things that share a vendor with keyboards but aren't keyboards.
const NOT_KEYBOARD =
  /\b(mouse|mice|headset|headphones?|mouse ?pad|mouse ?mat|mat|cooler|fan|motherboard|gpu|graphics|dock|hub|webcam|camera|speaker|microphone|kraken|deathadder|basilisk|naga|viper|mamba|lancehead|orochi|abyssus|atheris|nommo|leviathan|seiren|firefly|goliathus|laptop|blade|notebook|monitor|psu|ram|dram|memory|chair|controller pad|gamepad|joystick|wheel|receiver only|touchpad|trackpad|trackball|presenter|barcode|scanner|card reader|storage|pulsefire|rival|sensei|aerox|prime|kone|kain|burst|pure|tyon|savu|lua|nyth|ironclaw|harpoon|glaive|sabre|scimitar|nightsword|dark core|katar|m65|aura (motherboard|addressable)|lightbar|light strip|led strip|ambient|mug|stand|case|tower|aio|pump|hydro|commander|lighting node|ls100)\b/i;

// Model names that are keyboards even when the word "keyboard" is missing.
const KEYBOARD_MODEL =
  /keyboard|\bkbd\b|keypad|blackwidow|huntsman|ornata|cynosa|deathstalker|turret|anansi|tartarus|orbweaver|\bapex\b|alloy|vulcan|pyro|horde|strafe|\bk(5[57]|6[0358]|70|9[05]|100)\b|\bg(11[05]|19|213|413|512|513|610|710\+?|810|815|910|915|pro keyboard|pro x)\b|\btkl\b|tenkeyless|mechanical|anne pro|ducky|das keyboard|\bmx board\b|\bmk\d+|\bck\d+|\bsk\d+|\bmasterkeys\b|elite 2|origins|redragon|magnum|\bkumara\b|\bk55[0-9]\b|\bfizz\b/i;

const isKeyboard = (name, hint = "") =>
  (KEYBOARD_MODEL.test(name) || /keyboard|kbd/i.test(hint)) && !NOT_KEYBOARD.test(name);

function add(vid, pid, name, maker, source) {
  if (!vid || !pid || pid === 0xffff) return;
  name = String(name)
    .replace(/\s+/g, " ")
    .replace(/\s*\[[^\]]*\]\s*/g, " ")
    .trim();
  if (!name) return;
  found.push({ vid, pid, name, maker: (maker || "").trim(), source });
}

const titleCase = (s) =>
  s
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => (/\d/.test(w) && w.length <= 6 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ")
    .replace(/\bRoyalkludge\b/g, "Royal Kludge")
    .replace(/\bIso\b/g, "ISO")
    .replace(/\bAnsi\b/g, "ANSI")
    .replace(/\bRgb\b/g, "RGB")
    .replace(/\bTkl\b/g, "TKL");

/* ---- usb.ids: the community list of every USB device ---- */
{
  const text = read("ids", "usb.ids");
  let vendor = null;
  for (const line of text.split("\n")) {
    if (/^C /.test(line)) break; // device classes start here
    const v = line.match(/^([0-9a-f]{4})\s+(.+)$/);
    if (v) {
      vendor = { id: parseInt(v[1], 16), name: v[2].trim() };
      continue;
    }
    const p = line.match(/^\t([0-9a-f]{4})\s+(.+)$/);
    if (
      p &&
      vendor &&
      /keyboard|kbd|keypad/i.test(p[2]) &&
      !/hub\b|mouse only|touchpad/i.test(p[2])
    )
      add(vendor.id, parseInt(p[1], 16), p[2], vendor.name, "usb.ids");
  }
}

/* ---- Linux hid-ids.h: devices the kernel handles specially ---- */
{
  const vendors = new Map(); // define suffix -> id
  const lines = read("ids", "hid-ids.h").split("\n");
  for (const l of lines) {
    const m = l.match(/#define\s+USB_VENDOR_ID_(\w+)\s+(0x[0-9a-f]+)/i);
    if (m) vendors.set(m[1], parseInt(m[2], 16));
  }
  let lastVendor = null;
  for (const l of lines) {
    const v = l.match(/#define\s+USB_VENDOR_ID_(\w+)\s/);
    if (v) lastVendor = v[1];
    const d = l.match(/#define\s+USB_DEVICE_ID_(\w+)\s+(0x[0-9a-f]+)/i);
    if (!d || !/KEYBOARD|KBD|KEYPAD/.test(d[1]) || /MOUSE_ONLY|TOUCHPAD|RECEIVER/.test(d[1]))
      continue;
    // Device defines usually start with their vendor's name; otherwise use the vendor above them.
    const prefix = [...vendors.keys()]
      .filter((k) => d[1].startsWith(k + "_"))
      .sort((a, b) => b.length - a.length)[0];
    const vendorKey = prefix || lastVendor;
    if (!vendorKey || !vendors.has(vendorKey)) continue;
    const model = prefix ? d[1].slice(prefix.length + 1) : d[1];
    add(
      vendors.get(vendorKey),
      parseInt(d[2], 16),
      titleCase(`${vendorKey} ${model}`),
      titleCase(vendorKey),
      "linux",
    );
  }
}

/* ---- ckb-next: Corsair keyboards ---- */
{
  const text = read("ids", "ckb-usb.h");
  const corsair = 0x1b1c;
  for (const m of text.matchAll(/#define\s+P_(K\d+\w*|STRAFE\w*)\s+(0x[0-9a-f]{4})/gi)) {
    const model = titleCase(m[1].replace(/_/g, " "))
      .replace(/\bNrgb\b/g, "non-RGB")
      .replace(/\bLp\b/g, "Low Profile")
      .replace(/\bWl\d?\b/g, "Wireless")
      .replace(/\bRfire\b/g, "RAPIDFIRE")
      .replace(/\bMk(\d)\b/g, "MK.$1");
    add(corsair, parseInt(m[2], 16), `Corsair ${model}`, "Corsair", "ckb-next");
  }
}

/* ---- OpenRGB: lighting-controllable devices from many brands ---- */
{
  const files = walk(join(dataDir, "openrgb", "Controllers")).filter((f) => /\.(h|cpp)$/.test(f));
  const defines = new Map();
  const sources = [];
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(/#define\s+(\w+)\s+(0x[0-9A-Fa-f]{1,4})\b/g))
      defines.set(m[1], parseInt(m[2], 16));
    if (/REGISTER_HID_DETECTOR/.test(text)) sources.push(text);
  }
  const value = (t) => (/^0x/i.test(t) ? parseInt(t, 16) : defines.get(t));
  for (const text of sources)
    for (const m of text.matchAll(
      /REGISTER_HID_DETECTOR\w*\s*\(\s*"([^"]+)"\s*,\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)/g,
    )) {
      const [, name, fn, vidTok, pidTok] = m;
      if (!isKeyboard(name, fn)) continue;
      const vid = value(vidTok),
        pid = value(pidTok);
      add(vid, pid, name, name.split(" ")[0], "OpenRGB");
    }
}

/* ---- OpenRazer: Razer keyboards and keypads ---- */
{
  const text = read("openrazer", "daemon", "openrazer_daemon", "hardware", "keyboards.py");
  for (const block of text.split(/\nclass /).slice(1)) {
    const name = block.match(/"""\s*Class for the (Razer[^\n]+?)\s*(?:\(|\n)/)?.[1];
    const pid = block.match(/USB_PID\s*=\s*(0x[0-9a-f]+)/i)?.[1];
    const vid = block.match(/USB_VID\s*=\s*(0x[0-9a-f]+)/i)?.[1] || "0x1532";
    if (name && pid && !NOT_KEYBOARD.test(name))
      add(parseInt(vid, 16), parseInt(pid, 16), name, "Razer", "OpenRazer");
  }
}

/* ---- sinowealth-kb-tool: budget boards on Sinowealth chips (Aula, Redragon, Royal Kludge...) ---- */
{
  const text = read("sinowealth", "src", "device_spec.rs");
  for (const m of text.matchAll(
    /pub const DEVICE_(\w+):\s*DeviceSpec\s*=\s*DeviceSpec\s*\{\s*vendor_id:\s*(0x[0-9a-f]+),\s*product_id:\s*(0x[0-9a-f]+)/gi,
  )) {
    if (m[1].startsWith("BASE_")) continue;
    const words = m[1].split("_");
    // The tool also flashes a few mice on the same chips.
    if (NOT_KEYBOARD.test(words.join(" ")) || /model_[odi]\b|_m\d+$/i.test(m[1])) continue;
    add(
      parseInt(m[2], 16),
      parseInt(m[3], 16),
      titleCase(words.join(" ")),
      titleCase(words[0]),
      "sinowealth-kb-tool",
    );
  }
}

// One entry per USB id. Earlier sources in this order win, because their names are more specific.
const RANK = ["OpenRazer", "ckb-next", "OpenRGB", "sinowealth-kb-tool", "usb.ids", "linux"];
found.sort((a, b) => RANK.indexOf(a.source) - RANK.indexOf(b.source));
const byId = new Map();
for (const e of found) {
  const id = e.vid * 65536 + e.pid;
  const prev = byId.get(id);
  if (!prev) byId.set(id, { ...e, also: [] });
  else if (prev.name.toLowerCase() !== e.name.toLowerCase()) prev.also.push(e);
}

// Shared ids (cheap chips used by many brands) name a chip, not a keyboard. Prefer the real model
// names the sources give over generic labels, and when several brands share an id, list them.
const GENERIC =
  /^(\w+ )?(usb |gaming |wireless )?(keyboard|kbd)\b|^(sinowealth|evision|holtek|generic)\b/i;
const brand = (e) => (e.maker || e.name).toLowerCase().split(/[\s,.]/)[0];
const list = [...byId.values()].map((e) => {
  const all = [e, ...e.also];
  const specific = all.filter((x) => !GENERIC.test(x.name));
  const brands = new Set(all.map(brand));
  let name = e.name,
    maker = e.maker;
  if (specific.length && GENERIC.test(e.name)) ({ name, maker } = specific[0]);
  if (brands.size > 1) {
    const names = [...new Set(specific.map((x) => x.name))].slice(0, 3);
    name =
      names.length > 1 ? `${names.join(", ")} or a similar board` : `${name} (or a similar board)`;
  }
  return { vid: e.vid, pid: e.pid, name, maker, source: e.source };
});
writeFileSync(out, JSON.stringify(list, null, 1));

const bySource = {};
for (const e of list) bySource[e.source] = (bySource[e.source] || 0) + 1;
console.log(`${list.length} keyboard ids`, bySource);
