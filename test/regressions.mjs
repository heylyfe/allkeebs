import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { exactLayout, keyAtPoint, keyRectangles, presetLayout } from "../src/layouts.js";
import { decodeDbLayout, keyboardDb, servedDefinition } from "../src/kbdb.js";
import {
  distinctHidHandles,
  parseDefinitionText,
  turnOffLogitechLighting,
} from "../src/devices.js";
import { KeyboardView } from "../src/render.js";
import { viaActiveKeys } from "@openmouse/keyboard-protocol/via";

(async () => {
  for (const id of ["invalid", "__proto__", "constructor", null]) {
    assert.equal(presetLayout(id).id, "100");
  }
  assert.equal(presetLayout("60").id, "60");

  const rotated = exactLayout("test", "rotated", [
    { row: 0, col: 0, x: 0, y: 0, w: 1, h: 1, r: 30, rx: 0, ry: 0 },
  ]);
  assert.ok(Math.abs(rotated.W - (Math.sqrt(3) / 2 + 0.5)) < 1e-9);
  assert.ok(Math.abs(rotated.H - (Math.sqrt(3) / 2 + 0.5)) < 1e-9);
  assert.equal(keyAtPoint(rotated, 0.6830127019, 0.6830127019), 0);
  assert.equal(
    keyAtPoint(rotated, 1.3, 0.1),
    -1,
    "rotated key bounding-box corners are not clickable",
  );

  const composite = exactLayout("test", "composite", [
    { row: 0, col: 0, x: 0, y: 0, w: 1, h: 1, r: 90, rx: 0, ry: 0, x2: 1, y2: 0, w2: 1, h2: 1 },
  ]);
  assert.equal(keyRectangles(composite.keys[0]).length, 2);
  assert.ok(Math.abs(composite.W - 1) < 1e-9);
  assert.ok(Math.abs(composite.H - 2) < 1e-9);
  assert.equal(keyAtPoint(composite, 0.5, 1.5), 0, "rotated secondary rectangle is clickable");

  const secondaryWithoutX2 = exactLayout("test", "secondary defaults", [
    { row: 0, col: 0, x: 0, y: 0, w: 1, h: 1, y2: 1, h2: 1 },
  ]);
  assert.equal(keyAtPoint(secondaryWithoutX2, 0.5, 1.5), 0);

  const parsed = parseDefinitionText(
    JSON.stringify({
      name: "Rotated VIA fixture",
      vendorId: "0x1234",
      productId: "0x0001",
      matrix: { rows: 1, cols: 1 },
      layouts: { keymap: [[{ r: 30, rx: 0, ry: 0, x2: 1, y2: 0, w2: 1, h2: 1 }, "0,0"]] },
    }),
  );
  const parsedShape = viaActiveKeys(parsed, [])[0];
  assert.equal(parsedShape.r, 30);
  assert.equal(parsedShape.x2, 1);
  const parsedGeometry = exactLayout("via-test", parsed.name, [parsedShape]);
  const radians = Math.PI / 6,
    parsedSecondaryCenter = [
      1.5 * Math.cos(radians) - 0.5 * Math.sin(radians) + 0.5,
      1.5 * Math.sin(radians) + 0.5 * Math.cos(radians),
    ];
  assert.equal(
    keyAtPoint(parsedGeometry, ...parsedSecondaryCenter),
    0,
    "VIA KLE geometry survives parsing",
  );

  // The canvas renderer applies the key transform and emits geometry for both rectangles.
  const canvasCalls = [];
  const context = new Proxy(
    { createLinearGradient: () => ({ addColorStop() {} }), measureText: () => ({ width: 1 }) },
    {
      get(target, prop) {
        if (prop in target) return target[prop];
        return (...args) => canvasCalls.push([prop, ...args]);
      },
      set(target, prop, value) {
        target[prop] = value;
        return true;
      },
    },
  );
  const fakeCanvas = () => ({
    clientWidth: 200,
    style: {},
    parentElement: { clientWidth: 200 },
    getContext: () => context,
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    addEventListener() {},
  });
  globalThis.document = { createElement: fakeCanvas };
  globalThis.window = { devicePixelRatio: 1 };
  globalThis.ResizeObserver = class {
    observe() {}
  };
  const view = new KeyboardView(fakeCanvas(), { handleKey() {} });
  view.setLayout(composite);
  view.draw(new Float32Array([0.5, 0.2, 0.1]));
  assert.ok(
    canvasCalls.some(([name, angle]) => name === "rotate" && Math.abs(angle - Math.PI / 2) < 1e-9),
  );
  assert.equal(
    view.hit({ clientX: (0.45 + 0.5) * view.size.u, clientY: (0.45 + 1.5) * view.size.u }),
    0,
  );

  const sameModel1 = { vendorId: 0x1234, productId: 1, productName: "Same board" },
    sameModel2 = { vendorId: 0x1234, productId: 1, productName: "Same board" };
  assert.deepEqual(distinctHidHandles([sameModel1, sameModel2, sameModel1]), [
    sameModel1,
    sameModel2,
  ]);

  const lightCalls = [],
    fakeLights = {
      async setIllumination(value) {
        lightCalls.push(["illumination", value]);
      },
      async setRgbEffect(value) {
        lightCalls.push(["effect", value]);
      },
      async setSolidColor(...args) {
        lightCalls.push(["solid", ...args]);
      },
    };
  await turnOffLogitechLighting(fakeLights, {
    brightness: null,
    lighting: { zones: [{ zone: 1 }], rgbZones: [] },
  });
  assert.deepEqual(lightCalls.pop(), ["solid", 0, 0, 0]);
  await turnOffLogitechLighting(fakeLights, {
    brightness: { illumination: true, illuminationEnabled: false },
    lighting: { zones: [{ zone: 1 }], rgbZones: [] },
  });
  assert.deepEqual(lightCalls.pop(), ["illumination", false]);
  await turnOffLogitechLighting(fakeLights, {
    brightness: null,
    lighting: { zones: [], rgbZones: [{ zone: 1 }] },
  });
  assert.deepEqual(lightCalls.pop(), ["effect", "Off"]);
  await assert.rejects(
    turnOffLogitechLighting(fakeLights, {
      brightness: null,
      lighting: { zones: [], rgbZones: [] },
    }),
    /did not report a supported lighting-off command/,
  );

  assert.equal(
    decodeDbLayout([[0, 1, 0, 0]])[0].w,
    1,
    "old database entries keep their default size",
  );
  const temp = mkdtempSync(join(tmpdir(), "allkeebs-geometry-db-"));
  try {
    const viaDir = join(temp, "via"),
      qmkDir = join(temp, "qmk"),
      out = join(temp, "db.json.gz");
    mkdirSync(join(viaDir, "v3"), { recursive: true });
    mkdirSync(join(qmkDir, "keyboards"), { recursive: true });
    writeFileSync(
      join(viaDir, "v3", "geometry.json"),
      JSON.stringify({
        name: "Geometry fixture",
        vendorId: "0x1234",
        productId: "0x0001",
        matrix: { rows: 1, cols: 2 },
        layouts: { keymap: [[{ r: 30, rx: 0, ry: 0, y2: 1, h2: 1 }, "0,0", { x: 1 }, "0,1"]] },
      }),
    );
    execFileSync(process.execPath, ["tools/build-db.mjs", out, "--via", viaDir, "--qmk", qmkDir], {
      cwd: process.cwd(),
      stdio: "pipe",
    });
    const db = JSON.parse(gunzipSync(readFileSync(out))),
      encoded = db.layouts[db.boards[0][3]],
      decoded = decodeDbLayout(encoded);
    assert.equal(decoded[0].r, 30);
    assert.equal(decoded[0].x2, 0);
    assert.equal(decoded[0].y2, 1);
    assert.equal(decoded[0].w2, 1);
    assert.equal(decoded[0].rx, 0);
    assert.equal(decoded[1].r, 30, "KLE rotation remains active for following keys");
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }

  const values = new Map();
  globalThis.localStorage = {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, String(v)),
  };
  const { state, reloadStoredState } = await import("../src/ui/state.js");
  const shippedDb = await keyboardDb(),
    shippedKyria = shippedDb.lookup(0x8d1d, 0x9d9d);
  assert.equal(shippedKyria.keys.length, 54);
  assert.equal(shippedKyria.keys.filter((key) => key.r !== 0).length, 10);
  assert.ok(exactLayout("db", shippedKyria.name, shippedKyria.keys).H > 6.25);
  // A shared id with several community files for one board: the one with lighting menus wins.
  const rainy = shippedDb.lookup(0x320f, 0x5055, "Rainy75");
  assert.equal(rainy.name, "Rainy 75");
  assert.ok(servedDefinition(rainy).menus?.length, "Rainy 75 keeps its VIA lighting menu");
  values.set("allkeebs.prefs", JSON.stringify({ theme: "light", reduced: true }));
  values.set("allkeebs.keytest.layout", JSON.stringify("60"));
  values.set("allkeebs.profiles", "null");
  reloadStoredState();
  assert.equal(state.prefs.theme, "light");
  assert.equal(state.prefs.reduced, true);
  assert.equal(state.prefs.demoTyping, true);
  assert.equal(state.keytestLayout, "60");
  values.clear();
  reloadStoredState();
  assert.equal(state.prefs.theme, "dark");
  assert.equal(state.keytestLayout, "100");

  // Every UI icon must draw something: a Lucide upgrade that renames an icon or changes
  // its export shape would otherwise leave blank buttons with no build error.
  const { icons } = await import("../src/ui/dom.js");
  for (const [name, svg] of Object.entries(icons))
    assert.match(svg, /<svg [^>]*>\s*<(path|circle|rect|line|polyline|polygon|ellipse) /, name);

  console.log(
    "geometry, identity, Logitech off, database, saved-state and icon regressions passed",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
