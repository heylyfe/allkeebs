// The desktop app's stand-in for Chrome's device chooser: lists matching HID devices and
// resolves with the ones the user connects (or none on cancel). Styled with the app's own
// classes, plus the few rules a floating dialog needs.
import { esc } from "../ui/dom.js";

const hex4 = (n) => (n >>> 0).toString(16).toUpperCase().padStart(4, "0");

export function pickDevices(list) {
  return new Promise((resolve) => {
    const shade = document.createElement("div");
    shade.style.cssText =
      "position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:16px;" +
      "background:rgb(0 0 0 / .55)";
    const rows = list.length
      ? list
          .map(
            (d, i) => `
        <label class="mitem" style="display:flex;gap:12px;align-items:center;cursor:pointer">
          <input type="checkbox" data-i="${i}">
          <span><em>${esc(d.productName || "HID device")}</em>
            <small>${hex4(d.vendorId)}:${hex4(d.productId)} · usage ${hex4(d.usagePage)}:${hex4(d.usage)}</small></span>
        </label>`,
          )
          .join("")
      : `<div class="empty">No matching devices are plugged in. Connect your keyboard with a cable and try again</div>`;
    shade.innerHTML = `
      <div class="panel" role="dialog" aria-modal="true" aria-label="Connect a keyboard"
        style="width:min(560px,100%);max-height:80vh;display:flex;flex-direction:column">
        <h2>Connect a keyboard</h2>
        <p class="sub">allkeebs only talks to the devices you pick here, and it remembers them.</p>
        <div class="mlist" style="overflow:auto;margin:12px 0">${rows}</div>
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
    document.addEventListener("keydown", onKey);
    document.body.appendChild(shade);
    shade.querySelector("input, [data-act=ok], [data-act=cancel]")?.focus();
  });
}
