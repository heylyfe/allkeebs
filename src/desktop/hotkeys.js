// Desktop app: put a macro on a global hotkey. The Rust side (src-tauri/src/hotkeys.rs) types
// the steps on this computer when the hotkey is pressed, even with the window closed. Nothing
// is sent to the keyboard, and nothing happens until the user sets a hotkey.
import { esc, toast } from "../ui/dom.js";

const invoke = (cmd, args) => window.__TAURI__.core.invoke(cmd, args);

let bindings = [];
let paused = false;
const loaded = invoke("hotkeys_get")
  .then(([p, list]) => {
    paused = p;
    bindings = list;
  })
  .catch(() => {});

const SUPPORTED = new Set(["text", "tap", "down", "up", "delay"]);
const cleanSteps = (steps) =>
  steps
    .filter((s) => SUPPORTED.has(s.type))
    .map((s) =>
      s.type === "text"
        ? { type: "text", text: s.text }
        : s.type === "delay"
          ? { type: "delay", ms: s.ms }
          : { type: s.type, keycode: s.keycode },
    );

const sourceOf = (ctx) => `${ctx.kb.key}:${ctx.slot}`;
const pretty = (accel) =>
  accel
    .split("+")
    .map((p) => p.replace(/^Key(?=[A-Z]$)/, "").replace(/^Digit(?=\d$)/, ""))
    .join(" + ");

async function save(next) {
  const refused = await invoke("hotkeys_set", { bindings: next });
  bindings = next;
  if (refused.length)
    toast(
      `${refused.map(pretty).join(", ")} is used by another app. Pick a different hotkey`,
      "bad",
    );
  return refused;
}

// Keep a bound macro's steps in step with the editor, so the hotkey types what you see.
let syncTimer = 0;
function syncSteps(ctx) {
  const b = bindings.find((x) => x.source === sourceOf(ctx));
  if (!b) return;
  const steps = cleanSteps(ctx.steps);
  if (JSON.stringify(steps) === JSON.stringify(b.steps) && b.name === ctx.name) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    save(bindings.map((x) => (x === b ? { ...b, name: ctx.name, steps } : x))).catch(() => {});
  }, 400);
}

const MODS = ["Control", "Alt", "Shift", "Meta"];

/** Waits for a shortcut with at least one modifier; Escape cancels. */
function captureShortcut() {
  return new Promise((resolve) => {
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") return finish(null);
      if (MODS.includes(e.key)) return;
      const mods = [
        e.ctrlKey && "Ctrl",
        e.altKey && "Alt",
        e.shiftKey && "Shift",
        e.metaKey && "Super",
      ].filter(Boolean);
      if (!mods.length) {
        toast("Use at least one of Ctrl, Alt, Shift or Win with the key");
        return;
      }
      finish([...mods, e.code].join("+"));
    };
    const finish = (v) => {
      window.removeEventListener("keydown", onKey, true);
      resolve(v);
    };
    window.addEventListener("keydown", onKey, true);
  });
}

export const hotkeyPanel = {
  html(ctx) {
    syncSteps(ctx);
    const b = bindings.find((x) => x.source === sourceOf(ctx));
    const state = b
      ? `<span class="kbd">${esc(pretty(b.shortcut))}</span>
         <button class="btn sm" data-hk="set">Change</button>
         <button class="btn ghost sm" data-hk="remove">Remove</button>`
      : `<button class="btn sm" data-hk="set">Set hotkey</button>`;
    return `
      <div data-hk-block style="margin-top:18px;padding-top:16px;border-top:1px solid rgb(var(--line-rgb) / .12)">
        <div class="slider-head"><span>Hotkey on this computer</span>
          <output>${b && paused ? "Paused from the tray" : ""}</output></div>
        <div class="btns" style="align-items:center;margin:8px 0">${state}</div>
        <p class="sub" style="margin:0">
          Press the hotkey anywhere to type this macro on this computer, even with the allkeebs
          window closed (it stays in the tray). Nothing is sent to the keyboard, and it works with
          any keyboard. Text is typed as written, on any layout.
        </p>
      </div>`;
  },
  bind(el, ctx) {
    const setBtn = el.querySelector('[data-hk="set"]');
    if (setBtn)
      setBtn.onclick = async () => {
        setBtn.textContent = "Press a shortcut… (Esc to cancel)";
        const shortcut = await captureShortcut();
        if (!shortcut) return refresh(el, ctx);
        const source = sourceOf(ctx);
        const clash = bindings.find((x) => x.shortcut === shortcut && x.source !== source);
        if (clash) {
          toast(`${pretty(shortcut)} already plays “${clash.name}”`, "bad");
          return refresh(el, ctx);
        }
        const next = [
          ...bindings.filter((x) => x.source !== source),
          { source, name: ctx.name, shortcut, steps: cleanSteps(ctx.steps) },
        ];
        const refused = await save(next).catch((e) => (toast(e.message || String(e), "bad"), null));
        if (refused && !refused.length) toast(`${pretty(shortcut)} now types “${ctx.name}”`);
        refresh(el, ctx);
      };
    const rm = el.querySelector('[data-hk="remove"]');
    if (rm)
      rm.onclick = async () => {
        await save(bindings.filter((x) => x.source !== sourceOf(ctx))).catch(() => {});
        refresh(el, ctx);
      };
  },
};

// Re-render just this block after a change, without touching the editor around it.
function refresh(el, ctx) {
  const block = el.querySelector("[data-hk-block]");
  if (!block) return;
  const tmp = document.createElement("div");
  tmp.innerHTML = hotkeyPanel.html(ctx);
  block.replaceWith(tmp.firstElementChild);
  hotkeyPanel.bind(el, ctx);
}

export const hotkeysReady = loaded;
