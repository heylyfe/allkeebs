// Physical layouts. A key is [label, code, width, shiftLabel, height]; a bare number is a horizontal gap.
const key = (label, code, w = 1, sub, h = 1) => [label, code, w, sub, h];

const letters = (s) => s.split("").map((c) => key(c, "Key" + c));

const NUMBER_ROW = [
  key("1", "Digit1", 1, "!"),
  key("2", "Digit2", 1, "@"),
  key("3", "Digit3", 1, "#"),
  key("4", "Digit4", 1, "$"),
  key("5", "Digit5", 1, "%"),
  key("6", "Digit6", 1, "^"),
  key("7", "Digit7", 1, "&"),
  key("8", "Digit8", 1, "*"),
  key("9", "Digit9", 1, "("),
  key("0", "Digit0", 1, ")"),
  key("-", "Minus", 1, "_"),
  key("=", "Equal", 1, "+"),
];

const GRAVE = key("`", "Backquote", 1, "~");

const QWERTY_ROW = [
  ...letters("QWERTYUIOP"),
  key("[", "BracketLeft", 1, "{"),
  key("]", "BracketRight", 1, "}"),
];

const HOME_ROW = [
  ...letters("ASDFGHJKL"),
  key(";", "Semicolon", 1, ":"),
  key("'", "Quote", 1, '"'),
];

const BOTTOM_ROW = [
  ...letters("ZXCVBNM"),
  key(",", "Comma", 1, "<"),
  key(".", "Period", 1, ">"),
  key("/", "Slash", 1, "?"),
];

const fKeys = (a, b) =>
  Array.from({ length: b - a + 1 }, (_, i) => key("F" + (a + i), "F" + (a + i)));

const ESC = key("Esc", "Escape"),
  BS = (w = 2) => key("Backspace", "Backspace", w),
  TAB = key("Tab", "Tab", 1.5),
  BSL = key("\\", "Backslash", 1.5, "|");

const CAPS = key("Caps", "CapsLock", 1.75),
  ENT = key("Enter", "Enter", 2.25),
  LSH = key("Shift", "ShiftLeft", 2.25);

const MODS = [
  key("Ctrl", "ControlLeft", 1.25),
  key("Win", "MetaLeft", 1.25),
  key("Alt", "AltLeft", 1.25),
  key("", "Space", 6.25),
];

const NAV3 = [key("PrtSc", "PrintScreen"), key("ScrLk", "ScrollLock"), key("Pause", "Pause")];
const ARROWS = [key("←", "ArrowLeft"), key("↓", "ArrowDown"), key("→", "ArrowRight")];

const LAYOUT_DEFS = {
  40: {
    name: "40%",
    rows: [
      [0, [ESC, ...letters("QWERTYUIOP"), BS(1.75)]],
      [1, [key("Tab", "Tab", 1.25), ...letters("ASDFGHJKL"), key("Enter", "Enter", 2.5)]],
      [
        2,
        [
          key("Shift", "ShiftLeft", 1.75),
          ...letters("ZXCVBNM"),
          key(",", "Comma", 1, "<"),
          key(".", "Period", 1, ">"),
          key("/", "Slash", 1, "?"),
          key("Shift", "ShiftRight"),
        ],
      ],
      [3, [...MODS, key("Fn", "Fn", 1.25), key("Ctrl", "ControlRight", 1.5)]],
    ],
  },
  60: {
    name: "60%",
    rows: [
      [0, [ESC, ...NUMBER_ROW, BS()]],
      [1, [TAB, ...QWERTY_ROW, BSL]],
      [2, [CAPS, ...HOME_ROW, ENT]],
      [3, [LSH, ...BOTTOM_ROW, key("Shift", "ShiftRight", 2.75)]],
      [
        4,
        [
          ...MODS,
          key("Alt", "AltRight", 1.25),
          key("Win", "MetaRight", 1.25),
          key("Fn", "Fn", 1.25),
          key("Ctrl", "ControlRight", 1.25),
        ],
      ],
    ],
  },
  65: {
    name: "65%",
    rows: [
      [0, [ESC, ...NUMBER_ROW, BS(), key("Del", "Delete")]],
      [1, [TAB, ...QWERTY_ROW, BSL, key("PgUp", "PageUp")]],
      [2, [CAPS, ...HOME_ROW, ENT, key("PgDn", "PageDown")]],
      [
        3,
        [
          LSH,
          ...BOTTOM_ROW,
          key("Shift", "ShiftRight", 1.75),
          key("↑", "ArrowUp"),
          key("End", "End"),
        ],
      ],
      [
        4,
        [...MODS, key("Alt", "AltRight"), key("Fn", "Fn"), key("Ctrl", "ControlRight"), ...ARROWS],
      ],
    ],
  },
  75: {
    name: "75%",
    rows: [
      [
        0,
        [
          ESC,
          0.5,
          ...fKeys(1, 4),
          0.5,
          ...fKeys(5, 8),
          0.5,
          ...fKeys(9, 12),
          0.5,
          key("Del", "Delete"),
        ],
      ],
      [1.25, [GRAVE, ...NUMBER_ROW, BS(), key("Home", "Home")]],
      [2.25, [TAB, ...QWERTY_ROW, BSL, key("PgUp", "PageUp")]],
      [3.25, [CAPS, ...HOME_ROW, ENT, key("PgDn", "PageDown")]],
      [
        4.25,
        [
          LSH,
          ...BOTTOM_ROW,
          key("Shift", "ShiftRight", 1.75),
          key("↑", "ArrowUp"),
          key("End", "End"),
        ],
      ],
      [
        5.25,
        [...MODS, key("Alt", "AltRight"), key("Fn", "Fn"), key("Ctrl", "ControlRight"), ...ARROWS],
      ],
    ],
  },
  80: {
    name: "80%",
    rows: [
      [0, [ESC, 1, ...fKeys(1, 4), 0.5, ...fKeys(5, 8), 0.5, ...fKeys(9, 12), 0.25, ...NAV3]],
      [
        1.5,
        [
          GRAVE,
          ...NUMBER_ROW,
          BS(),
          0.25,
          key("Ins", "Insert"),
          key("Home", "Home"),
          key("PgUp", "PageUp"),
        ],
      ],
      [
        2.5,
        [
          TAB,
          ...QWERTY_ROW,
          BSL,
          0.25,
          key("Del", "Delete"),
          key("End", "End"),
          key("PgDn", "PageDown"),
        ],
      ],
      [3.5, [CAPS, ...HOME_ROW, ENT]],
      [4.5, [LSH, ...BOTTOM_ROW, key("Shift", "ShiftRight", 2.75), 1.25, key("↑", "ArrowUp")]],
      [
        5.5,
        [
          ...MODS,
          key("Alt", "AltRight", 1.25),
          key("Win", "MetaRight", 1.25),
          key("Menu", "ContextMenu", 1.25),
          key("Ctrl", "ControlRight", 1.25),
          0.25,
          ...ARROWS,
        ],
      ],
    ],
  },
  96: {
    name: "96%",
    rows: [
      [
        0,
        [
          ESC,
          ...fKeys(1, 12),
          key("PrtSc", "PrintScreen"),
          key("Del", "Delete"),
          key("Home", "Home"),
          key("End", "End"),
          key("PgUp", "PageUp"),
          key("PgDn", "PageDown"),
        ],
      ],
      [
        1,
        [
          GRAVE,
          ...NUMBER_ROW,
          BS(),
          key("Num", "NumLock"),
          key("/", "NumpadDivide"),
          key("*", "NumpadMultiply"),
          key("-", "NumpadSubtract"),
        ],
      ],
      [
        2,
        [
          TAB,
          ...QWERTY_ROW,
          BSL,
          key("7", "Numpad7"),
          key("8", "Numpad8"),
          key("9", "Numpad9"),
          key("+", "NumpadAdd", 1, null, 2),
        ],
      ],
      [3, [CAPS, ...HOME_ROW, ENT, key("4", "Numpad4"), key("5", "Numpad5"), key("6", "Numpad6")]],
      [
        4,
        [
          LSH,
          ...BOTTOM_ROW,
          key("Shift", "ShiftRight", 1.75),
          key("↑", "ArrowUp"),
          key("1", "Numpad1"),
          key("2", "Numpad2"),
          key("3", "Numpad3"),
          key("Ent", "NumpadEnter", 1, null, 2),
        ],
      ],
      [
        5,
        [
          ...MODS,
          key("Alt", "AltRight"),
          key("Fn", "Fn"),
          key("Ctrl", "ControlRight"),
          ...ARROWS,
          key("0", "Numpad0"),
          key(".", "NumpadDecimal"),
        ],
      ],
    ],
  },
  100: {
    name: "100%",
    rows: [
      [0, [ESC, 1, ...fKeys(1, 4), 0.5, ...fKeys(5, 8), 0.5, ...fKeys(9, 12), 0.25, ...NAV3]],
      [
        1.5,
        [
          GRAVE,
          ...NUMBER_ROW,
          BS(),
          0.25,
          key("Ins", "Insert"),
          key("Home", "Home"),
          key("PgUp", "PageUp"),
          0.25,
          key("Num", "NumLock"),
          key("/", "NumpadDivide"),
          key("*", "NumpadMultiply"),
          key("-", "NumpadSubtract"),
        ],
      ],
      [
        2.5,
        [
          TAB,
          ...QWERTY_ROW,
          BSL,
          0.25,
          key("Del", "Delete"),
          key("End", "End"),
          key("PgDn", "PageDown"),
          0.25,
          key("7", "Numpad7"),
          key("8", "Numpad8"),
          key("9", "Numpad9"),
          key("+", "NumpadAdd", 1, null, 2),
        ],
      ],
      [
        3.5,
        [
          CAPS,
          ...HOME_ROW,
          ENT,
          3.5,
          key("4", "Numpad4"),
          key("5", "Numpad5"),
          key("6", "Numpad6"),
        ],
      ],
      [
        4.5,
        [
          LSH,
          ...BOTTOM_ROW,
          key("Shift", "ShiftRight", 2.75),
          1.25,
          key("↑", "ArrowUp"),
          1.25,
          key("1", "Numpad1"),
          key("2", "Numpad2"),
          key("3", "Numpad3"),
          key("Ent", "NumpadEnter", 1, null, 2),
        ],
      ],
      [
        5.5,
        [
          ...MODS,
          key("Alt", "AltRight", 1.25),
          key("Win", "MetaRight", 1.25),
          key("Menu", "ContextMenu", 1.25),
          key("Ctrl", "ControlRight", 1.25),
          0.25,
          ...ARROWS,
          0.25,
          key("0", "Numpad0", 2),
          key(".", "NumpadDecimal"),
        ],
      ],
    ],
  },
};

export const PRESET_IDS = ["40", "60", "65", "75", "80", "96", "100"];

/** Fill in geometry that effects and the renderer share. */
export function finish(layout) {
  const keys = layout.keys;
  let W = 0,
    H = 0;
  for (const key of keys) {
    W = Math.max(W, key.x + key.w);
    H = Math.max(H, key.y + key.h);
  }
  const CX = W / 2,
    CY = H / 2;
  keys.forEach((key, i) => {
    key.i = i;
    key.cx = key.x + key.w / 2;
    key.cy = key.y + key.h / 2;
    key.nx = key.cx / W;
    key.ny = key.cy / H;
    key.ang = Math.atan2(key.cy - CY, key.cx - CX);
    key.dist = Math.hypot(key.cx - CX, key.cy - CY);
  });
  layout.W = W;
  layout.H = H;
  layout.byCode = {};
  for (const key of keys) if (key.code && !layout.byCode[key.code]) layout.byCode[key.code] = key;
  return layout;
}

const cache = {};

export function presetLayout(id) {
  if (cache[id]) return cache[id];
  const def = LAYOUT_DEFS[id];
  const keys = [];
  def.rows.forEach(([y, items], row) => {
    let x = 0;
    for (const it of items) {
      if (typeof it === "number") {
        x += it;
        continue;
      }
      const [label, code, w, sub, h] = it;
      keys.push({ label, code, w, h, sub: sub || null, x, y, row });
      x += w;
    }
  });
  return (cache[id] = finish({ id, name: def.name, exact: false, keys }));
}

/** A layout from matrix-addressed key shapes (VIA definition, Keychron Launcher). */
export function exactLayout(id, name, shapes) {
  const keys = shapes
    .filter((s) => s.row >= 0 && s.col >= 0)
    .map((s) => ({
      label: "",
      code: null,
      sub: null,
      x: s.x,
      y: s.y,
      w: s.w || 1,
      h: s.h || 1,
      row: Math.round(s.y),
      mrow: s.row,
      mcol: s.col,
    }));
  const minX = Math.min(...keys.map((k) => k.x)),
    minY = Math.min(...keys.map((k) => k.y));
  for (const key of keys) {
    key.x -= minX;
    key.y -= minY;
  }
  return finish({ id, name, exact: true, keys });
}

/** Rough size class of an exact layout, for labels. */
export function sizeClass(layout) {
  const n = layout.keys.length;
  if (n <= 50) return "40%";
  if (n <= 64) return "60%";
  if (n <= 72) return "65%";
  if (n <= 85) return "75%";
  if (n <= 90) return "80%";
  if (n <= 100) return "96%";
  return "100%";
}

// Name hints, most specific first. Returns a preset id and the reason.
const KEYCHRON = {
  k: {
    1: "80",
    2: "75",
    3: "75",
    4: "96",
    5: "100",
    6: "65",
    7: "65",
    8: "80",
    10: "100",
    12: "60",
    14: "65",
    17: "96",
  },
  q: {
    1: "75",
    2: "65",
    3: "80",
    4: "60",
    5: "96",
    6: "100",
    7: "65",
    9: "40",
    11: "75",
    12: "96",
    14: "100",
    15: "40",
  },
  v: { 1: "75", 2: "65", 3: "80", 4: "60", 5: "96", 6: "100", 7: "65", 10: "75" },
};

const n = (x) => new RegExp(`(?<!\\d)(?:${x})(?!\\d)`, "i");

const HINTS = [
  [/gmmk\s*pro|wooting\s*80|\bq1\b/i, "75"],
  [/wooting\s*one/i, "80"],
  [/wooting\s*two|full[\s-]?size/i, "100"],
  [/tkl|tenkeyless|tournament/i, "80"],
  [/\bmini\b/i, "60"],
  [/\bsf\b/i, "65"],
  [/k6[35](?!\d)/i, "80"],
  [/alloy.*(core|fps)/i, "80"],
  [/g7[01][35]|g515|\bpro x(?!\s*60)|\bg pro\b/i, "80"],
  [/corsair.*k(55|57|60|68|70|95|100)(?!\d)|\bk(55|57|68|70|95)(?!\d)/i, "100"],
  [n("100|104|105|108"), "100"],
  [n("96|98|99|1800"), "96"],
  [n("80|87|88"), "80"],
  [n("75|81|82|83|84"), "75"],
  [n("65|66|67|68"), "65"],
  [n("60|61|62|63|64"), "60"],
  [/planck|preonic|(?<!\d)(?:40|45|47|48)(?!\d)/i, "40"],
  [
    /blackwidow|huntsman|deathstalker|ornata|cynosa|alloy|apex|ducky|\bg\d{3}\b|strafe|vulcan|roccat|aula|redragon/i,
    "100",
  ],
];

export function guessFromName(name) {
  if (!name) return null;
  const kc = name.match(/keychron\s+([kqv])(\d+)/i) || name.match(/^\s*([kqv])(\d+)\b/i);
  if (kc) {
    const id = KEYCHRON[kc[1].toLowerCase()]?.[+kc[2]];
    if (id) return { id, why: `the model name “${name.trim()}”` };
  }
  const akko = name.match(/(?<!\d)[35]([01]\d\d)(?!\d)/); // Akko-style model numbers end in the key count
  const text = akko ? name + " " + +akko[1] : name;
  for (const [re, id] of HINTS) if (re.test(text)) return { id, why: `the name “${name.trim()}”` };
  return null;
}

// Give every key of an exact layout a KeyboardEvent code, from its legend or its position
const SHIFTED = {
  "!": "Digit1",
  "@": "Digit2",
  "#": "Digit3",
  $: "Digit4",
  "%": "Digit5",
  "^": "Digit6",
  "&": "Digit7",
  "*": ["Digit8", "NumpadMultiply"],
  "(": "Digit9",
  ")": "Digit0",
  _: "Minus",
  "-": ["Minus", "NumpadSubtract"],
  "+": ["Equal", "NumpadAdd"],
  "=": "Equal",
  "{": "BracketLeft",
  "[": "BracketLeft",
  "}": "BracketRight",
  "]": "BracketRight",
  "|": "Backslash",
  "\\": "Backslash",
  ":": "Semicolon",
  ";": "Semicolon",
  '"': "Quote",
  "'": "Quote",
  "~": "Backquote",
  "`": "Backquote",
  "<": "Comma",
  ",": "Comma",
  ">": "Period",
  ".": ["Period", "NumpadDecimal"],
  "?": "Slash",
  "/": ["Slash", "NumpadDivide"],
  "↑": "ArrowUp",
  "↓": "ArrowDown",
  "←": "ArrowLeft",
  "→": "ArrowRight",
};

const WORDS = {
  esc: "Escape",
  escape: "Escape",
  tab: "Tab",
  caps: "CapsLock",
  capslock: "CapsLock",
  shift: ["ShiftLeft", "ShiftRight"],
  lshift: "ShiftLeft",
  rshift: "ShiftRight",
  ctrl: ["ControlLeft", "ControlRight"],
  control: ["ControlLeft", "ControlRight"],
  alt: ["AltLeft", "AltRight"],
  opt: ["AltLeft", "AltRight"],
  option: ["AltLeft", "AltRight"],
  altgr: "AltRight",
  win: ["MetaLeft", "MetaRight"],
  gui: ["MetaLeft", "MetaRight"],
  super: ["MetaLeft", "MetaRight"],
  cmd: ["MetaLeft", "MetaRight"],
  command: ["MetaLeft", "MetaRight"],
  meta: ["MetaLeft", "MetaRight"],
  os: ["MetaLeft", "MetaRight"],
  space: "Space",
  spacebar: "Space",
  enter: ["Enter", "NumpadEnter"],
  return: ["Enter", "NumpadEnter"],
  ent: ["Enter", "NumpadEnter"],
  backspace: "Backspace",
  bksp: "Backspace",
  bspc: "Backspace",
  back: "Backspace",
  del: "Delete",
  delete: "Delete",
  ins: "Insert",
  insert: "Insert",
  home: "Home",
  end: "End",
  pgup: "PageUp",
  pageup: "PageUp",
  pgdn: "PageDown",
  pagedown: "PageDown",
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  menu: "ContextMenu",
  app: "ContextMenu",
  apps: "ContextMenu",
  prtsc: "PrintScreen",
  printscreen: "PrintScreen",
  psc: "PrintScreen",
  prtscr: "PrintScreen",
  scrlk: "ScrollLock",
  scrolllock: "ScrollLock",
  pause: "Pause",
  break: "Pause",
  numlock: "NumLock",
  num: "NumLock",
  numlk: "NumLock",
};

function labelCodes(label) {
  const out = [];
  for (const line of String(label || "").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const w = t.toLowerCase().replace(/[\s_]/g, "");
    if (/^[a-z]$/i.test(t)) out.push("Key" + t.toUpperCase());
    else if (/^[0-9]$/.test(t)) out.push("Digit" + t, "Numpad" + t);
    else if (/^f([1-9]|1[0-9]|2[0-4])$/i.test(t)) out.push(t.toUpperCase());
    else if (SHIFTED[t]) out.push(...[].concat(SHIFTED[t]));
    else if (WORDS[w]) out.push(...[].concat(WORDS[w]));
  }
  return out;
}

const SIZE_ID = {
  "40%": "40",
  "60%": "60",
  "65%": "65",
  "75%": "75",
  "80%": "80",
  "96%": "96",
  "100%": "100",
};

export function assignCodes(L) {
  const used = new Set(L.keys.filter((k) => k.code).map((k) => k.code));
  for (const k of [...L.keys].sort((a, b) => a.y - b.y || a.x - b.x)) {
    if (k.code) continue;
    const code = labelCodes(k.label).find((c) => !used.has(c));
    if (code) {
      k.code = code;
      used.add(code);
    }
  }
  const P = presetLayout(SIZE_ID[sizeClass(L)] || "100"),
    pairs = [];
  for (const k of L.keys)
    if (!k.code)
      for (const p of P.keys)
        if (p.code && !used.has(p.code))
          pairs.push([Math.hypot(k.cx / L.W - p.cx / P.W, (k.cy / L.H - p.cy / P.H) * 0.8), k, p]);
  pairs.sort((a, b) => a[0] - b[0]);
  const done = new Set();
  for (const [d, k, p] of pairs) {
    if (d > 0.06 || done.has(k) || used.has(p.code)) continue;
    k.code = p.code;
    used.add(p.code);
    done.add(k);
    if (!k.label) {
      k.label = p.label;
      k.sub = p.sub;
      k.guessed = true;
    }
  }
  L.byCode = {};
  for (const k of L.keys) if (k.code && !L.byCode[k.code]) L.byCode[k.code] = k;
  return L;
}
