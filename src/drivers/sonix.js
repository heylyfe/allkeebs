// Lighting for keyboards on EVision and Cherry firmware, which share one protocol. EVision boards
// are sold by Redragon, Ajazz, Tecware, Glorious (first GMMK) and many others.
//
// Ported from OpenRGB (GPL-2.0-or-later): Controllers/EVisionKeyboardController by Adam Honse and
// Controllers/CherryKeyboardController. The checksum is an unsigned sum, as in packets captured
// from Cherry boards by cherryrgb-rs (MIT); OpenRGB sums C chars, which only differs above 127.
//
// Every request is a 64-byte output report:
//   04  sum-lo sum-hi  command  size  offset-lo offset-hi  (00 | 55)  data...
// Setting a mode writes the keyboard's stored settings, as the maker's own software does, so it
// survives a restart. We only send it when the user presses Apply.

const REPORT_ID = 0x04;
const SET_PARAMETER = 0x06;

const EVISION_MODES = [
  ["Static", 0x06],
  ["Breathing", 0x05],
  ["Spectrum cycle", 0x04],
  ["Colour wave", 0x02],
  ["Short colour wave", 0x01],
  ["Colour wheel", 0x03],
  ["Rainbow wave vertical", 0x0c],
  ["Rainbow circle", 0x12],
  ["Reactive", 0x07],
  ["Ripple", 0x08],
  ["Reactive line", 0x09],
  ["Starlight", 0x0f],
  ["Fast starlight", 0x0a],
  ["Blooming", 0x0b],
  ["Hurricane", 0x0d],
  ["Accumulate", 0x0e],
  ["Visor", 0x10],
];

// Cherry's officially supported modes only; OpenRGB lists more that some boards ignore.
const CHERRY_MODES = [
  ["Static", 0x03],
  ["Breathing", 0x02],
  ["Spectrum", 0x01],
  ["Wave", 0x00],
  ["Radar", 0x04],
  ["Rolling", 0x0a],
  ["Curve", 0x0c],
  ["Radiation", 0x12],
  ["Ripples", 0x13],
  ["Single key reactive", 0x15],
];

export const SONIX_FAMILIES = {
  evision: {
    brand: "EVision",
    usagePage: 0xff1c,
    products: [
      [0x0c45, 0x5004],
      [0x0c45, 0x5104],
      [0x0c45, 0x5204],
      [0x0c45, 0x652f],
      [0x0c45, 0x7672],
      [0x0c45, 0x7698],
      [0x0c45, 0x8520],
      [0x320f, 0x5000],
      [0x320f, 0x502a],
      [0x320f, 0x505b],
      [0x320f, 0x5064],
      [0x320f, 0x5078],
      [0x320f, 0x5084],
    ],
    modes: EVISION_MODES,
    slowest: 5,
    // mode, brightness, speed, direction, random colour, R, G, B
    payload: (mode, br, speed, [r, g, b]) => [mode, br, speed, 0, 0, r, g, b],
    marker: 0x00,
  },
  cherry: {
    brand: "Cherry",
    usagePage: 0xff1c,
    products: [
      0x0077, 0x0079, 0x0083, 0x00ab, 0x00ac, 0x00b7, 0x00bb, 0x00c3, 0x01a6, 0x00c4, 0x00ce,
      0x00c5, 0x00c7, 0x00c9, 0x00ca, 0x00cb, 0x00cd, 0x00d2, 0x00d3, 0x00dd, 0x00e0, 0x00de,
      0x00e1, 0x00df, 0x00e2,
    ].map((pid) => [0x046a, pid]),
    modes: CHERRY_MODES,
    slowest: 4,
    // 0, mode, brightness, speed, direction, random colour, R, G, B
    payload: (mode, br, speed, [r, g, b]) => [0, mode, br, speed, 0, 0, r, g, b],
    marker: 0x55,
  },
};

/** Builds a set-parameter request, without the report id. Exported for the tests. */
export function parameterReport(family, data) {
  const buf = new Uint8Array(64);
  buf[0] = REPORT_ID;
  buf[3] = SET_PARAMETER;
  buf[4] = data.length;
  buf[5] = 0x00; // parameter 0: the whole mode block
  buf[7] = family.marker;
  buf.set(data, 8);
  let sum = 0;
  for (let i = 3; i < 64; i++) sum += buf[i];
  buf[1] = sum & 0xff;
  buf[2] = (sum >> 8) & 0xff;
  return buf.subarray(1);
}

export function sonixFamilyOf(device) {
  for (const family of Object.values(SONIX_FAMILIES)) {
    const known = family.products.some(
      ([vid, pid]) => vid === device.vendorId && pid === device.productId,
    );
    if (known && device.collections?.some((c) => c.usagePage === family.usagePage)) return family;
  }
  return null;
}

export const SONIX_FILTERS = Object.values(SONIX_FAMILIES).flatMap((family) =>
  family.products.map(([vendorId, productId]) => ({
    vendorId,
    productId,
    usagePage: family.usagePage,
  })),
);

/** A small client: open the interface, send a request, wait briefly for the board's answer. */
export function sonixClient(device, family) {
  let waiting = null;
  const onReport = () => {
    waiting?.();
    waiting = null;
  };
  return {
    family,
    async open() {
      if (!device.opened) await device.open();
      device.addEventListener("inputreport", onReport);
    },
    async close() {
      device.removeEventListener("inputreport", onReport);
      if (device.opened) await device.close();
    },
    async send(report) {
      const answered = new Promise((resolve) => {
        waiting = resolve;
        setTimeout(resolve, 250); // some firmware never answers; carry on after a moment
      });
      await device.sendReport(REPORT_ID, report);
      await answered;
    },
    async setMode(mode, brightness, speed, rgb) {
      await this.send(parameterReport(family, family.payload(mode, brightness, speed, rgb)));
    },
  };
}
