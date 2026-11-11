// An EVision board and a Cherry board that record what they're sent, to check the ported driver
// builds the same requests OpenRGB and cherryrgb-rs do.
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
import { onePerKeyboard, openKeyboard } from "../src/devices.js";

function fake(vid, pid, name, usagePage) {
  const listeners = new Set();
  const sent = [];
  return {
    sent,
    vendorId: vid,
    productId: pid,
    productName: name,
    opened: false,
    collections: [{ usagePage, usage: 0x92 }],
    async open() {
      this.opened = true;
    },
    async close() {
      this.opened = false;
    },
    addEventListener: (t, f) => listeners.add(f),
    removeEventListener: (t, f) => listeners.delete(f),
    async sendReport(id, data) {
      sent.push([id, ...data]);
      queueMicrotask(() => listeners.forEach((f) => f({ data: new DataView(data.buffer) })));
    },
    async sendFeatureReport() {},
    async receiveFeatureReport() {
      return new DataView(new ArrayBuffer(64));
    },
  };
}
const hex = (bytes) =>
  [...bytes]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
const check = (label, ok) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) process.exitCode = 1;
};

(async () => {
  // The typing interface and the lighting interface of one board: the lighting one must win.
  const typing = fake(0x320f, 0x5064, "Gaming Keyboard", 0x01);
  const lighting = fake(0x320f, 0x5064, "Gaming Keyboard", 0xff1c);
  check("picks the lighting interface", onePerKeyboard([typing, lighting])[0] === lighting);

  const ev = await openKeyboard(lighting);
  check(
    `EVision board opens with the ported driver (${ev.family}, ${ev.brand})`,
    ev.family === "sonix",
  );
  check(
    `it offers ${ev.lighting.effects.length} keyboard effects`,
    ev.lighting.effects.length === 17,
  );
  const breathing = ev.lighting.effects.find((e) => e.name === "Breathing");
  await ev.lighting.apply({ h: 0, s: 100, br: 100, speed: 50 }, breathing);
  const evPacket = ev.device.sent.at(-1);
  console.log("     sent", hex(evPacket));
  // mode 05, brightness 04, speed 03 (5 slowest, 0 fastest), direction 0, random 0, ff 00 00
  check(
    "EVision request matches the protocol",
    hex(evPacket) === "04 19 01 06 08 00 00 00 05 04 03 00 00 ff 00 00",
  );

  const ch = await openKeyboard(fake(0x046a, 0x00dd, "G80-3000N TKL RGB", 0xff1c));
  const wave = ch.lighting.effects.find((e) => e.name === "Wave");
  await ch.lighting.apply({ h: 0, s: 100, br: 75, speed: 50 }, wave);
  const chPacket = ch.device.sent.at(-1);
  console.log("     sent", hex(chPacket));
  // 0, mode 00 wave, brightness 03, speed 02, direction 0, random 0, ff 00 00
  check(
    "Cherry request matches the protocol",
    hex(chPacket) === "04 68 01 06 09 00 00 55 00 00 03 02 00 00 ff 00",
  );

  await ch.lighting.off();
  check("lights off sends brightness 0", ch.device.sent.at(-1)[10] === 0);

  const other = await openKeyboard(fake(0x320f, 0x9999, "Unknown", 0xff1c)).catch((e) => e);
  check("unknown products aren't driven", other?.family !== "sonix");
})();
