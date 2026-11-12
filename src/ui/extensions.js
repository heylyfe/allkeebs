// Optional add-ons a build can register. The website registers none; the desktop app adds
// hotkey macros (src/desktop/hotkeys.js).

/**
 * Extra blocks under the macro editor. Each is { html(ctx) -> string, bind(el, ctx) }, where
 * ctx = { kb, slot, steps, name } for the macro being edited.
 */
export const macroPanels = [];
