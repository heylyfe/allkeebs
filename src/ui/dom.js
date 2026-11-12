// Small DOM helpers shared by every page: querying, escaping, icons, toasts and the activity log.

import * as L from "lucide";

export const VERSION = typeof __VERSION__ === "string" ? __VERSION__ : "dev";

// Set "repository" and "author" in package.json; the build puts them here.
export const SOURCE_URL = typeof __SOURCE_URL__ === "string" ? __SOURCE_URL__ : "";

export const AUTHOR = typeof __AUTHOR__ === "string" ? __AUTHOR__ : "";

export const $ = (s, r = document) => r.querySelector(s),
  $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const pad2 = (n) => String(n).padStart(2, "0");

// Lucide 1.x exports an icon as its child elements, [[tag, attrs], ...]; older releases
// wrapped them as ["svg", attrs, children]. Accept both, and fail loudly on a missing icon.
function icon(node, cls = "i") {
  if (!Array.isArray(node)) throw new Error("Missing Lucide icon");
  const children = node[0] === "svg" ? node[2] : node;
  const kids = (children || [])
    .map(
      ([tag, attrs]) =>
        `<${tag} ${Object.entries(attrs)
          .map(([k, v]) => `${k}="${v}"`)
          .join(" ")}/>`,
    )
    .join("");
  const attrs = [
    `class="${cls}"`,
    `xmlns="http://www.w3.org/2000/svg"`,
    `viewBox="0 0 24 24"`,
    `fill="none"`,
    `stroke="currentColor"`,
    `stroke-linecap="round"`,
    `stroke-linejoin="round"`,
    `aria-hidden="true"`,
  ].join(" ");
  return `<svg ${attrs}>${kids}</svg>`;
}

export const icons = {
  keyboard: icon(L.Keyboard),
  test: icon(L.ScanLine),
  list: icon(L.ListChecks),
  prefs: icon(L.SlidersHorizontal),
  sun: icon(L.Sun),
  moon: icon(L.Moon),
  plug: icon(L.Cable),
  check: icon(L.Check, "i yes"),
  minus: icon(L.Minus),
  x: icon(L.X),
  up: icon(L.ArrowUp),
  down: icon(L.ArrowDown),
  trash: icon(L.Trash2),
  rec: icon(L.Circle),
  stop: icon(L.Square),
  search: icon(L.Search),
  upload: icon(L.Upload),
  download: icon(L.Download),
  reset: icon(L.RotateCcw),
  power: icon(L.Power),
  plus: icon(L.Plus),
  about: icon(L.Heart),
  ext: icon(L.ArrowUpRight),
  // Lucide 1.0 dropped brand logos, so the source link uses a generic code icon.
  github: icon(L.CodeXml),
  light: icon(L.Lightbulb),
  info: icon(L.Info),
  alert: icon(L.TriangleAlert),
  refresh: icon(L.RefreshCw),
  unplug: icon(L.Unplug),
  file: icon(L.FileJson),
};

// A keycap seen from above: the outer cap and the dished top.
export const LOGO = `
  <svg class="mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="3.5"/>
    <rect x="6.5" y="6.5" width="11" height="9" rx="2"/>
  </svg>`;

export const sandboxed = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

export function toast(msg, kind, action) {
  const t = document.createElement("div");
  t.className = "toast " + (kind || "");
  t.textContent = msg;
  if (action) {
    const b = document.createElement("button");
    b.className = "linkish";
    b.textContent = action.label;
    b.onclick = () => {
      action.fn();
      t.remove();
    };
    t.appendChild(b);
  }
  $("#toasts").appendChild(t);
  setTimeout(() => t.remove(), action ? 6500 : 4200);
}

export const activityLog = [];

export const log = (msg) => {
  activityLog.push(`${new Date().toLocaleTimeString()}  ${msg}`);
  if (activityLog.length > 200) activityLog.shift();
};
