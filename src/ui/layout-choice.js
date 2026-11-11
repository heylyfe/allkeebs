// Which physical layout to draw for a keyboard: exact when we know it, otherwise a best guess
// from its name, unless the user picked one by hand.

import { store } from "../devices.js";
import { guessFromName, presetLayout } from "../layouts.js";
import { state } from "./state.js";

export function autoLayout(kb) {
  if (kb.exactLayout)
    return {
      layout: kb.exactLayout,
      exact: true,
      why:
        kb.family === "keychron"
          ? "Keychron Launcher’s layout for this model"
          : {
              file: "the VIA file you loaded",
              vial: "the definition stored on the keyboard",
              usevia: "usevia.app",
              cache: "the saved copy from usevia.app",
            }[kb.definitionSource] || "the keyboard database",
    };
  if (kb.layoutHint)
    return { layout: presetLayout(kb.layoutHint), why: kb.layoutWhy || "the demo board’s layout" };
  for (const n of [kb.name, kb.device?.productName, kb.status?.layout]) {
    const g = guessFromName(n);
    if (g) return { layout: presetLayout(g.id), why: g.why };
  }
  return { layout: presetLayout("100"), why: null };
}

export const overrideOf = (kb) => store.get("layout." + kb.key, "auto");

export function layoutFor(kb) {
  const o = overrideOf(kb);
  return o === "auto" ? autoLayout(kb).layout : presetLayout(o);
}

export function heroLayout() {
  const kb = state.cur;
  if (!kb) return presetLayout(state.keytestLayout);
  if (state.tab === "keymap" && kb.keymap) return kb.exactLayout || layoutFor(kb);
  return layoutFor(kb);
}
