// Lighting search by meaning. Each word has a small vector (from GloVe, see tools/build-vectors.py);
// a preset's vector is the average of the words describing it, and a search is ranked by how
// close its own average is. Words in the preset's name still count most, so typing a name works
// as before. Everything runs in the page; nothing is sent anywhere.
import PACKED from "./search-vectors.bin";
import WORDS from "./search-words.txt";

const DIMS = 32;
const VECTORS = new Int8Array(PACKED.buffer, PACKED.byteOffset, PACKED.length);
let table = null;

function words() {
  if (!table) {
    table = new Map();
    WORDS.split("\n").forEach((w, i) => table.set(w, i));
  }
  return table;
}

const tokens = (text) =>
  String(text)
    .toLowerCase()
    .replace(/colour/g, "color")
    .match(/[a-z]+/g) || [];

function vectorOf(text) {
  const out = new Float32Array(DIMS),
    index = words();
  let n = 0;
  for (let w of tokens(text)) {
    let i = index.get(w);
    if (i == null && w.endsWith("s")) i = index.get(w.slice(0, -1)); // "waves" -> "wave"
    if (i == null) continue;
    for (let d = 0; d < DIMS; d++) out[d] += VECTORS[i * DIMS + d];
    n++;
  }
  if (!n) return null;
  let len = 0;
  for (const v of out) len += v * v;
  len = Math.sqrt(len) || 1;
  for (let d = 0; d < DIMS; d++) out[d] /= len;
  return out;
}

const cache = new WeakMap();

/**
 * Ranks items by how well they match a query. `describe(item)` gives the words to compare,
 * `name(item)` the visible name, which wins outright when it contains what was typed.
 */
export function rankByMeaning(items, query, describe, name) {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  const qv = vectorOf(q);
  const scored = [];
  for (const item of items) {
    const plain = name(item).toLowerCase();
    const text = describe(item).toLowerCase();
    let score = plain.includes(q) ? 2 : text.includes(q) ? 1.2 : 0;
    // Each typed word that appears as it is (a colour, "rain", "fire") counts on top of meaning.
    const own = new Set(tokens(plain + " " + text));
    for (const w of tokens(q)) if (own.has(w) || own.has(w.replace(/s$/, ""))) score += 0.35;
    if (qv) {
      let v = cache.get(item);
      if (v === undefined) cache.set(item, (v = vectorOf(name(item) + " " + describe(item))));
      if (v) {
        let dot = 0;
        for (let d = 0; d < DIMS; d++) dot += qv[d] * v[d];
        score += dot;
      }
    }
    scored.push([score, item]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  // Keep the clear matches: everything that names the query, then the closest by meaning.
  const best = scored[0]?.[0] ?? 0;
  return scored.filter(([s], i) => s >= 1 || (i < 120 && s > best - 0.35)).map(([, item]) => item);
}
