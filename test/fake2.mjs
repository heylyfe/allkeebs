import { readFileSync } from "node:fs";
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
import { openKeyboard } from "../src/devices.js";
const VIAL = new Uint8Array(
  readFileSync(new URL("./vial-sample.xz", "file://" + __dirname + "/../")),
);
function fake({ vid, pid, name, rows = 6, cols = 16, vial = false, via = true }) {
  const listeners = new Set();
  const keymap = new Uint8Array(4 * rows * cols * 2);
  for (let i = 0; i < rows * cols; i++) keymap[i * 2 + 1] = 4 + (i % 26);
  const device = {
    vendorId: vid,
    productId: pid,
    productName: name,
    opened: false,
    collections: via
      ? [
          {
            usagePage: 0xff60,
            usage: 0x61,
            inputReports: [],
            outputReports: [],
            featureReports: [],
            children: [],
          },
        ]
      : [
          {
            usagePage: 1,
            usage: 6,
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
    async sendReport(id, data) {
      const q = new Uint8Array(data),
        r = new Uint8Array(32);
      r.set(q);
      const c = q[0];
      if (c === 0xfe) {
        if (!vial) r[0] = 0xff;
        else if (q[1] === 0) {
          r.fill(0);
          r[0] = 6;
        } else if (q[1] === 1) {
          r.fill(0);
          r[0] = VIAL.length & 255;
          r[1] = VIAL.length >> 8;
        } else if (q[1] === 2) {
          r.fill(0);
          const pg = q[2] | (q[3] << 8);
          r.set(VIAL.slice(pg * 32, pg * 32 + 32));
        }
      } else if (c === 1) {
        r[1] = 0;
        r[2] = 12;
      } else if (c === 2) {
        r[2] = r[3] = r[4] = r[5] = 0;
      } else if (c === 0x11) r[1] = 4;
      else if (c === 0x0c) r[1] = 0;
      else if (c === 0x0d) {
        r[1] = 0;
        r[2] = 0;
      } else if (c === 0x12) {
        const off = (q[1] << 8) | q[2];
        for (let i = 0; i < q[3]; i++) r[4 + i] = keymap[off + i];
      } else if (c === 7 || c === 8 || c === 9) {
      } else r[0] = 0xff;
      queueMicrotask(() => {
        for (const f of listeners) f({ device, reportId: 0, data: new DataView(r.buffer) });
      });
    },
  };
  return device;
}
const show = (a) =>
  console.log(
    `${a.name} | family ${a.family} | brand ${a.brand} | def ${a.definitionSource ?? "-"} | exact ${a.exactLayout ? a.exactLayout.keys.length + " keys, coded " + a.exactLayout.keys.filter((k) => k.code).length + ", labelled " + a.exactLayout.keys.filter((k) => k.label).length : "none"} | lighting ${a.lighting ? (a.lighting.effects?.length ?? "solid") + (a.lighting.guessed ? " guessed" : "") : "none"} | keymap ${!!a.keymap} | size ${a.layoutHint ? a.layoutHint + "% (" + a.layoutWhy + ")" : "-"} | note ${a.notes[0] || ""}`,
  );
(async () => {
  show(
    await openKeyboard(fake({ vid: 0x320f, pid: 0x5044, name: "GMMK Pro", rows: 11, cols: 16 })),
  );
  show(
    await openKeyboard(fake({ vid: 0xfffe, pid: 0x000d, name: "Akko 5108", rows: 6, cols: 21 })),
  );
  show(
    await openKeyboard(
      fake({ vid: 0xbeef, pid: 0x1065, name: "Vial Test 65", rows: 5, cols: 15, vial: true }),
    ),
  );
  show(
    await openKeyboard(fake({ vid: 0x1b1c, pid: 0x1b38, name: "CORSAIR K70 RGB PRO", via: false })),
  );
  show(await openKeyboard(fake({ vid: 0x1234, pid: 0x9999, name: "Rainy75", rows: 6, cols: 16 })));
  // 320F:5055 is shared by six boards in the database; the reported name picks the Rainy 75.
  const rainy = await openKeyboard(
    fake({ vid: 0x320f, pid: 0x5055, name: "Rainy75", rows: 6, cols: 16 }),
  );
  show(rainy);
  console.log(
    `  picked by ${rainy.dbEntry?.matchedBy}, others: ${rainy.dbEntry?.others?.join(", ")}`,
  );
  const generic = await openKeyboard(
    fake({ vid: 0x320f, pid: 0x5055, name: "USB Keyboard", rows: 6, cols: 16 }),
  );
  console.log(`  generic name -> ${generic.dbEntry?.name} (${generic.dbEntry?.matchedBy})`);
})();
