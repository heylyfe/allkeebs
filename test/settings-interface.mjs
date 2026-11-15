// The typing-interface fix: a VIA board picked through its typing interface must not be
// told VIA failed, a VIA device whose first readStatus attempt goes unanswered must open
// on retry, a silent one must surface the driver's error, and the desktop picker must
// collapse a keyboard's interfaces into one row.
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
import assert from "node:assert/strict";
import { openKeyboard, pickSettingsInterface } from "../src/devices.js";
import { groupInterfaces } from "../src/hid/picker.js";
import { setTransport } from "../src/hid/transport.js";
import { webHidTransport } from "../src/hid/webhid.js";

const check = (label, ok) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) process.exitCode = 1;
};

const collections = (usagePage, usage) => [
  { usagePage, usage, inputReports: [], outputReports: [], featureReports: [], children: [] },
];

// A bare HID handle for the common parts: opens, closes and records listeners.
function fake(vid, pid, name, usagePage, usage) {
  const listeners = new Set();
  return {
    vendorId: vid,
    productId: pid,
    productName: name,
    opened: false,
    collections: collections(usagePage, usage),
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
    async sendReport() {},
    async sendFeatureReport() {},
    async receiveFeatureReport() {
      return new DataView(new ArrayBuffer(8));
    },
    listeners,
  };
}

// A fake VIA keyboard (0xFF60/0x61) talking the real protocol. `silenceVersions` makes it
// ignore that many protocol-version commands before answering; `neverAnswer` silences it
// completely. The Vial probe (0xFE) is never answered either way.
function fakeVia({ silenceVersions = 0, neverAnswer = false } = {}) {
  const listeners = new Set();
  let versionAsks = 0;
  const device = {
    vendorId: 0x1234,
    productId: 0x5678,
    productName: "Retry75",
    opened: false,
    collections: collections(0xff60, 0x61),
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
      );
      const c = q[0];
      if (c === 0xfe) return; // the Vial definition probe gets nothing here
      if (neverAnswer) return;
      if (c === 1) {
        versionAsks += 1;
        if (versionAsks <= silenceVersions) return; // swallow this attempt
      }
      const r = new Uint8Array(32);
      r.set(q);
      if (c === 1) {
        r[1] = 0;
        r[2] = 12;
      } else if (c === 2) {
        // keyboard values: zeros are fine (firmware 0, layout options 0, uptime 0)
      } else if (c === 0x11)
        r[1] = 4; // layer count
      else if (c === 0x0c)
        r[1] = 0; // macro count
      else if (c === 0x0d) {
        r[1] = 0;
        r[2] = 0; // macro buffer size
      }
      queueMicrotask(() => {
        for (const f of listeners) f({ device, reportId: 0, data: new DataView(r.buffer) });
      });
    },
  };
  return device;
}

(async () => {
  // 1. The Rainy 75's typing interface: VIA lives on a sibling interface, so the note
  //    must point there, not claim VIA failed.
  const typing = await openKeyboard(fake(0x320f, 0x5055, "Rainy75", 0x01, 0x06));
  check("typing interface opens identified", typing.family === "identified" && typing.identified);
  check(
    "typing interface gets the settings-interface flag",
    typing.settingsInterface?.vendorId === 0x320f && typing.settingsInterface?.productId === 0x5055,
  );
  check(
    "typing interface note does not claim VIA failed",
    !typing.notes[0].includes("didn’t answer VIA") &&
      !typing.notes[0].includes("didn't answer VIA"),
  );
  check(
    "typing interface note points at the settings interface",
    typing.notes[0].includes("typing interface") && typing.notes[0].includes("settings (VIA)"),
  );
  await typing.close();

  // 2. The first readStatus attempt times out; the retry with a fresh client answers.
  const flaky = await openKeyboard(fakeVia({ silenceVersions: 1 }));
  check("a VIA board that only answers on retry opens as via", flaky.family === "via");
  await flaky.close();

  // 3. A VIA board that never answers opens identified, with the driver's error text.
  const silent = await openKeyboard(fakeVia({ neverAnswer: true }));
  check("a VIA board that never answers opens identified", silent.family === "identified");
  check(
    "the silent board's note carries the driver's error",
    silent.notes[0].includes("Keyboard did not answer VIA command 0x1"),
  );
  check(
    "the silent board's note keeps the wired-mode advice",
    silent.notes[0].includes("wired mode"),
  );
  await silent.close();

  // 4. The desktop picker collapses a keyboard's interfaces into one row.
  const t = {
    vendorId: 0x320f,
    productId: 0x5055,
    productName: "Rainy75",
    serial: "",
    usagePage: 0x01,
    usage: 0x06,
  };
  const settings = { ...t, usagePage: 0xff60, usage: 0x61 };
  const media = { ...t, usagePage: 0x0c, usage: 0x01 };
  const vendor = { ...t, usagePage: 0xff00, usage: 0x02 };
  const other = { ...t, usagePage: 0x01, usage: 0x80 };

  const grouped = groupInterfaces([t, media, settings]);
  check(
    "one row per physical keyboard",
    grouped.length === 1 && grouped[0].interfaces.length === 3,
  );
  check("the VIA settings interface leads the row", grouped[0].best === settings);
  check(
    "without the VIA interface, a vendor page leads",
    groupInterfaces([t, media, vendor])[0].best === vendor,
  );
  check(
    "without a vendor interface, the typing keyboard leads",
    groupInterfaces([media, other, t])[0].best === t,
  );
  check("media and others come last", groupInterfaces([other, media])[0].best === other);
  check(
    "grouping keeps separate keyboards apart",
    groupInterfaces([
      { ...settings, serial: "AAA" },
      { ...t, serial: "AAA" },
      { ...settings, serial: "BBB" },
    ]).length === 2,
  );
  check("an empty list groups to nothing", groupInterfaces([]).length === 0);

  // 5. pickSettingsInterface asks the transport for the keyboard's 0xFF60/0x61 interface only.
  let captured = null;
  setTransport({
    name: "test",
    support: () => "ok",
    request: async (filters) => {
      captured = filters;
      return [];
    },
    granted: async () => [],
    on: () => () => {},
  });
  await pickSettingsInterface({ vid: 0x320f, pid: 0x5055 });
  check(
    "pickSettingsInterface filters to the settings interface",
    JSON.stringify(captured) ===
      JSON.stringify([{ vendorId: 0x320f, productId: 0x5055, usagePage: 0xff60, usage: 0x61 }]),
  );
  setTransport(webHidTransport);
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
