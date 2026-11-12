// The built-in keyboard database, gzipped into the page and unpacked once on first use with the
// browser's own gzip decoder. It holds three kinds of entry:
//   boards  USB id and exact key layout (VIA, Vial and QMK, including makers' own firmware)
//   ids     USB id and name only (OpenRGB, OpenRazer, ckb-next, the Linux kernel, the USB id list...)
//   models  a model name and its size, for keyboards that never published either
import PACKED from "./kbdb.json.gz";

let ready = null;

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Decode a compact database layout, including optional KLE geometry extensions. */
export function decodeDbLayout(layout) {
  return layout.map((k) => {
    const geometry = Array.isArray(k[k.length - 1]) ? k[k.length - 1] : null,
      end = geometry ? k.length - 1 : k.length,
      label = typeof k[end - 1] === "string" ? k[end - 1] : undefined,
      key = {
        row: k[0],
        col: k[1],
        x: k[2] / 8,
        y: k[3] / 8,
        w: Number.isFinite(k[4]) ? k[4] / 8 : 1,
        h: Number.isFinite(k[5]) ? k[5] / 8 : 1,
        label,
        r: geometry?.[0] || 0,
        rx: geometry ? geometry[1] / 8 : 0,
        ry: geometry ? geometry[2] / 8 : 0,
      };
    if (geometry?.[3])
      Object.assign(key, {
        x2: geometry[4] / 8,
        y2: geometry[5] / 8,
        w2: geometry[6] / 8,
        h2: geometry[7] / 8,
      });
    return key;
  });
}

export function keyboardDb() {
  if (!ready)
    ready = (async () => {
      const bin = Uint8Array.from(atob(PACKED), (c) => c.charCodeAt(0));
      const text = await new Response(
        new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip")),
      ).text();
      const raw = JSON.parse(text);
      const ids = raw.ids || [],
        models = raw.models || [];
      const sizes = raw.sizes || ["40", "60", "65", "75", "80", "96", "100"];
      const maker = (i) => (i >= 0 ? raw.makers[i] : "");

      const boardIndex = new Map(),
        idIndex = new Map();
      // Several boards can share one USB id: keep them all, in the order the builder ranked them.
      raw.boards.forEach((b, i) => {
        const list = boardIndex.get(b[0]) || [];
        list.push(i);
        boardIndex.set(b[0], list);
      });
      ids.forEach((b, i) => idIndex.set(b[0], i));

      const board = (b) => {
        const [id, name, mk, li, flags, rows, cols, ex] = b;
        return {
          kind: "board",
          hasLayout: true,
          vid: id >>> 16,
          pid: id & 0xffff,
          name,
          maker: maker(mk),
          via: !!(flags & 1),
          qmk: !!(flags & 2),
          rgbMatrix: !!(flags & 4),
          underglow: !!(flags & 8),
          rows,
          cols,
          extra: ex != null ? raw.extras[ex] : null,
          get keys() {
            return decodeDbLayout(raw.layouts[li]);
          },
          get keyCount() {
            return raw.layouts[li].length;
          },
        };
      };
      const identified = ([id, name, mk, size]) => ({
        kind: "id",
        hasLayout: false,
        vid: id >>> 16,
        pid: id & 0xffff,
        name,
        maker: maker(mk),
        size: size >= 0 ? sizes[size] : null,
        via: false,
        keyCount: 0,
        keys: [],
      });
      const model = ([name, mk, size]) => ({
        kind: "model",
        hasLayout: false,
        vid: null,
        pid: null,
        name,
        maker: maker(mk),
        size: sizes[size],
        via: false,
        keyCount: 0,
        keys: [],
      });

      // Longest names first, so "Rainy 75 Pro" wins over "Rainy 75".
      const modelKeys = models
        .map((m) => ({ m, key: norm(m[0]), full: norm(maker(m[1]) + m[0]) }))
        .filter((x) => x.key.length >= 3)
        .sort((a, b) => b.key.length - a.key.length);

      const matches = (e, s) =>
        e.name.toLowerCase().includes(s) || e.maker.toLowerCase().includes(s);

      return {
        count: boardIndex.size + ids.length + models.length,
        boardCount: boardIndex.size,
        idCount: ids.length,
        modelCount: models.length,
        viaCount: raw.boards.filter((b) => b[4] & 1).length,
        built: raw.built,

        /**
         * The entry for a USB id: a board with a layout first, then an identified keyboard.
         * When boards share the id, the one the user picked wins, then one whose name appears
         * in the name the keyboard reports, then the first. `others` lists the rest.
         */
        lookup(vid, pid, reported = "", picked = "") {
          const id = vid * 65536 + pid;
          if (boardIndex.has(id)) {
            const list = boardIndex.get(id).map((i) => board(raw.boards[i]));
            const said = norm(reported);
            const byName = (e) => {
              const n = norm(e.name);
              return n.length >= 3 && (said.includes(n) || n.includes(said));
            };
            let chosen = picked && list.find((e) => e.name === picked);
            let how = chosen ? "picked" : "only";
            if (!chosen && list.length > 1) {
              chosen = said.length >= 3 && list.find(byName);
              how = chosen ? "name" : "guess";
            }
            chosen = chosen || list[0];
            chosen.matchedBy = how;
            chosen.others = list.filter((e) => e !== chosen).map((e) => e.name);
            return chosen;
          }
          if (idIndex.has(id)) return identified(ids[idIndex.get(id)]);
          return null;
        },

        /** A known model whose name appears in what the keyboard calls itself. */
        matchName(reported) {
          const n = norm(reported);
          if (n.length < 3) return null;
          const hit = modelKeys.find((x) => n.includes(x.full) || n.includes(x.key));
          return hit ? model(hit.m) : null;
        },

        search(q, limit = 60) {
          const s = q.trim().toLowerCase(),
            out = [];
          const from = (list, make) => {
            for (const b of list) {
              if (out.length >= limit) return;
              const e = make(b);
              if (!s || matches(e, s)) out.push(e);
            }
          };
          from(raw.boards, board);
          from(ids, identified);
          from(models, model);
          return out;
        },
      };
    })();
  return ready;
}

/** A VIA definition object in the served shape, built from a database board. */
export function servedDefinition(e) {
  const ex = e.extra || {};
  const def = {
    name: e.name,
    vendorProductId: e.vid * 65536 + e.pid,
    matrix: { rows: e.rows, cols: e.cols },
    layouts: {
      keys: e.keys.map(({ row, col, x, y, w, h, r, rx, ry, x2, y2, w2, h2 }) => ({
        row,
        col,
        x,
        y,
        w,
        h,
        r,
        rx,
        ry,
        x2,
        y2,
        w2,
        h2,
      })),
      labels: [],
    },
    keycodes: ex.k || [],
    customKeycodes: ex.c || undefined,
  };
  if (Array.isArray(ex.m)) def.menus = ex.m;
  else if (ex.m && ex.m.lighting) def.lighting = ex.m.lighting;
  else if (!ex.m)
    def.menus = e.rgbMatrix ? ["qmk_rgb_matrix"] : e.underglow ? ["qmk_rgblight"] : [];
  return def;
}
