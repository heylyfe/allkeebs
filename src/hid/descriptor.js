// Turns a raw HID report descriptor into WebHID-style collections:
// [{ usagePage, usage, type, children, inputReports, outputReports, featureReports }], where each
// report is { reportId, items: [{ reportSize, reportCount, usagePage, usages }] }.
// Drivers read these (Wooting picks its feature report id and output report size from them), so
// a non-WebHID transport has to rebuild what Chrome would have reported.

const MAIN = 0,
  GLOBAL = 1,
  LOCAL = 2;

export function parseReportDescriptor(bytes) {
  const d = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const top = [];
  const stack = []; // open collections
  let g = { usagePage: 0, reportSize: 0, reportCount: 0, reportId: 0 };
  const globals = [];
  let usages = [];

  const report = (col, kind, id) => {
    const list = col[kind];
    let r = list.find((x) => x.reportId === id);
    if (!r) list.push((r = { reportId: id, items: [] }));
    return r;
  };

  for (let i = 0; i < d.length;) {
    const prefix = d[i];
    if (prefix === 0xfe) {
      // Long item: skip its data.
      i += 3 + (d[i + 1] || 0);
      continue;
    }
    const size = [0, 1, 2, 4][prefix & 3],
      type = (prefix >> 2) & 3,
      tag = prefix >> 4;
    let value = 0;
    for (let k = 0; k < size; k++) value |= (d[i + 1 + k] || 0) << (8 * k);
    value >>>= 0;
    i += 1 + size;

    if (type === GLOBAL) {
      if (tag === 0x0) g.usagePage = value;
      else if (tag === 0x7) g.reportSize = value;
      else if (tag === 0x8) g.reportId = value;
      else if (tag === 0x9) g.reportCount = value;
      else if (tag === 0xa) globals.push({ ...g });
      else if (tag === 0xb && globals.length) g = globals.pop();
    } else if (type === LOCAL) {
      // A 4-byte usage carries its own page in the high 16 bits.
      if (tag === 0x0) usages.push(size === 4 ? value : (g.usagePage << 16) | value);
    } else if (type === MAIN) {
      if (tag === 0xa) {
        const u = usages[0] ?? g.usagePage << 16;
        const col = {
          usagePage: u >>> 16,
          usage: u & 0xffff,
          type: value,
          children: [],
          inputReports: [],
          outputReports: [],
          featureReports: [],
        };
        (stack.length ? stack[stack.length - 1].children : top).push(col);
        stack.push(col);
      } else if (tag === 0xc) {
        stack.pop();
      } else if (tag === 0x8 || tag === 0x9 || tag === 0xb) {
        const col = stack[stack.length - 1];
        if (col) {
          const kind =
            tag === 0x8 ? "inputReports" : tag === 0x9 ? "outputReports" : "featureReports";
          report(col, kind, g.reportId).items.push({
            reportSize: g.reportSize,
            reportCount: g.reportCount,
            usagePage: g.usagePage,
            usages: usages.map((u) => u & 0xffff),
          });
        }
      }
      usages = [];
    }
  }
  return top;
}

/** True when the descriptor declares report ids, so every report starts with its id byte. */
export const usesReportIds = (collections) => {
  const walk = (c) =>
    ["inputReports", "outputReports", "featureReports"].some((k) =>
      c[k].some((r) => r.reportId !== 0),
    ) || c.children.some(walk);
  return collections.some(walk);
};

/** Bytes in one report (without its id byte), summed over every collection that declares it. */
export function reportLength(collections, kind, reportId) {
  let bits = 0;
  const walk = (c) => {
    for (const r of c[kind])
      if (r.reportId === reportId)
        bits += r.items.reduce((n, it) => n + it.reportSize * it.reportCount, 0);
    c.children.forEach(walk);
  };
  collections.forEach(walk);
  return Math.ceil(bits / 8);
}
