// The built-in keyboard database: every board in the-via/keyboards, Vial and qmk_firmware that has a USB id,
// gzipped into the page. Unpacked once, on first use, with the browser's own gzip decoder.
import PACKED from "./kbdb.json.gz";

let ready = null;

export function keyboardDb() {
  if (!ready)
    ready = (async () => {
      const bin = Uint8Array.from(atob(PACKED), (c) => c.charCodeAt(0));
      const text = await new Response(
        new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip")),
      ).text();
      const raw = JSON.parse(text),
        index = new Map();
      raw.boards.forEach((b, i) => index.set(b[0], i));
      const entry = (b) => {
        const [id, name, maker, li, flags, rows, cols, ex] = b;
        return {
          vid: id >>> 16,
          pid: id & 0xffff,
          name,
          maker: maker >= 0 ? raw.makers[maker] : "",
          via: !!(flags & 1),
          qmk: !!(flags & 2),
          rgbMatrix: !!(flags & 4),
          underglow: !!(flags & 8),
          rows,
          cols,
          extra: ex != null ? raw.extras[ex] : null,
          get keys() {
            return raw.layouts[li].map(([row, col, x, y, w = 8, h = 8, label]) => ({
              row,
              col,
              x: x / 8,
              y: y / 8,
              w: w / 8,
              h: h / 8,
              label,
            }));
          },
          get keyCount() {
            return raw.layouts[li].length;
          },
        };
      };
      return {
        count: raw.boards.length,
        built: raw.built,
        lookup(vid, pid) {
          const i = index.get(vid * 65536 + pid);
          return i == null ? null : entry(raw.boards[i]);
        },
        search(q, limit = 60) {
          const s = q.trim().toLowerCase(),
            out = [];
          for (const b of raw.boards) {
            const maker = b[2] >= 0 ? raw.makers[b[2]] : "";
            if (!s || b[1].toLowerCase().includes(s) || maker.toLowerCase().includes(s)) {
              out.push(entry(b));
              if (out.length >= limit) break;
            }
          }
          return out;
        },
        viaCount: raw.boards.filter((b) => b[4] & 1).length,
      };
    })();
  return ready;
}

/** A VIA definition object in the served shape, built from a database entry. */
export function servedDefinition(e) {
  const ex = e.extra || {};
  const def = {
    name: e.name,
    vendorProductId: e.vid * 65536 + e.pid,
    matrix: { rows: e.rows, cols: e.cols },
    layouts: {
      keys: e.keys.map(({ row, col, x, y, w, h }) => ({ row, col, x, y, w, h })),
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
