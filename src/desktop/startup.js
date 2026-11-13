// Desktop app: "Start with Windows" on the Preferences page. Off until the user turns it on;
// when on, allkeebs starts in the tray (so hotkey macros work) without opening its window.
import { toast } from "../ui/dom.js";

const invoke = (cmd, args) => window.__TAURI__.core.invoke(cmd, args);

let enabled = false;
invoke("autostart_get")
  .then((on) => (enabled = on))
  .catch(() => {});

export const startupPanel = {
  html: () => `
    <div class="panel">
      <h2>Desktop app</h2>
      <div class="row">
        <span>Start with Windows. allkeebs opens in the tray, so hotkey macros work right away</span>
        <span><label class="switch"><input type="checkbox" id="pfAutostart" ${
          enabled ? "checked" : ""
        }><i></i></label></span>
      </div>
    </div>`,
  bind(page) {
    const box = page.querySelector("#pfAutostart");
    if (!box) return;
    box.onchange = async () => {
      try {
        enabled = await invoke("autostart_set", { on: box.checked });
      } catch (e) {
        toast(`Couldn’t change this: ${e}`, "bad");
      }
      box.checked = enabled;
    };
  },
};
