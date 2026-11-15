// The desktop app's stand-in for Chrome's device chooser: lists matching HID devices and
// resolves with the ones the user connects (or none on cancel). Styled with the app's own
// classes, plus the few rules a floating dialog needs.
import { esc } from "../ui/dom.js";

const hex4 = (n) => (n >>> 0).toString(16).toUpperCase().padStart(4, "0");

// What an interface is for, in words: keyboards expose several, and only some carry settings.
const kindOf = (d) =>
  d.usagePage === 0xff60
    ? "Settings (VIA): pick this one"
    : d.usagePage >= 0xff00
      ? "Vendor settings"
      : d.usagePage === 0x01 && d.usage === 0x06
        ? "Typing only"
        : d.usagePage === 0x0c
          ? "Media keys"
          : "Other";

// Which interface leads when one physical keyboard collapses into a single row: the VIA
// settings interface first, then any vendor interface, then the typing keyboard, then the rest.
const rank = (d) =>
  d.usagePage === 0xff60 && d.usage === 0x61
    ? 0
    : d.usagePage >= 0xff00
      ? 1
      : d.usagePage === 0x01 && d.usage === 0x06
        ? 2
        : 3;

/**
 * Collapse the interfaces of one physical keyboard — same vendor, product and serial
 * (or, without a serial, product name) — into a single entry, keeping the interface that
 * speaks first: the VIA settings interface, then any vendor page, then the typing
 * keyboard, then the rest. Returns one group per keyboard, in the order they first
 * appear, each with its interfaces and the one the group leads with.
 */
export function groupInterfaces(list) {
  const groups = new Map();
  for (const d of list) {
    const key = [d.vendorId, d.productId, d.serial || d.productName || ""].join(":");
    const g = groups.get(key);
    if (g) g.push(d);
    else groups.set(key, [d]);
  }
  return [...groups.values()].map((interfaces) => ({
    interfaces,
    best: interfaces.reduce((a, b) => (rank(b) < rank(a) ? b : a)),
  }));
}

export function pickDevices(list) {
  return new Promise((resolve) => {
    const shade = document.createElement("div");
    shade.style.cssText =
      "position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:16px;" +
      "background:rgb(0 0 0 / .55)";
    const index = new Map(list.map((d, i) => [d, i]));
    const grouped = groupInterfaces(list);
    const row = (d, note) => `
        <label class="mitem" style="display:flex;gap:12px;align-items:center;cursor:pointer">
          <input type="checkbox" data-i="${index.get(d)}">
          <span><em>${esc(d.productName || "HID device")}</em>
            <small>${note} · ${hex4(d.vendorId)}:${hex4(d.productId)} · usage ${hex4(d.usagePage)}:${hex4(d.usage)}</small></span>
        </label>`;
    const rowsFor = (showAll) =>
      showAll
        ? list.map((d) => row(d, kindOf(d))).join("")
        : grouped
            .map(({ interfaces, best }) =>
              row(
                best,
                `${kindOf(best)}${interfaces.length > 1 ? ` · ${interfaces.length} interfaces` : ""}`,
              ),
            )
            .join("");
    const empty = `<div class="empty">No matching devices are plugged in. Connect your keyboard with a cable and try again</div>`;
    shade.innerHTML = `
      <div class="panel" role="dialog" aria-modal="true" aria-label="Connect a keyboard"
        style="width:min(560px,100%);max-height:80vh;display:flex;flex-direction:column">
        <h2>Connect a keyboard</h2>
        <p class="sub">allkeebs only talks to the devices you pick here, and it remembers them.</p>
        <div class="mlist" style="overflow:auto;margin:12px 0">${list.length ? rowsFor(false) : empty}</div>
        ${
          list.length
            ? `<label class="sub" style="display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;margin:0 0 8px">
          <input type="checkbox" data-toggle="all"> Show every interface
        </label>`
            : ""
        }
        <div class="btns" style="justify-content:flex-end">
          <button class="btn ghost" data-act="cancel">Cancel</button>
          <button class="btn primary" data-act="ok" ${list.length ? "" : "disabled"}>Connect</button>
        </div>
      </div>`;
    const done = (chosen) => {
      shade.remove();
      document.removeEventListener("keydown", onKey);
      resolve(chosen);
    };
    const onKey = (e) => e.key === "Escape" && done([]);
    shade.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (e.target === shade || act === "cancel") done([]);
      else if (act === "ok")
        done([...shade.querySelectorAll("input[data-i]:checked")].map((c) => list[+c.dataset.i]));
    });
    shade.addEventListener("change", (e) => {
      if (!e.target.matches("[data-toggle=all]")) return;
      // Keep what's ticked when switching views (rows are keyed by their index in list).
      const ticked = new Set(
        [...shade.querySelectorAll("input[data-i]:checked")].map((c) => c.dataset.i),
      );
      shade.querySelector(".mlist").innerHTML = rowsFor(e.target.checked);
      for (const c of shade.querySelectorAll("input[data-i]")) c.checked = ticked.has(c.dataset.i);
    });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(shade);
    shade.querySelector("input, [data-act=ok], [data-act=cancel]")?.focus();
  });
}
