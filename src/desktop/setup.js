// Desktop app setup, run before the app starts: HID through Tauri instead of WebHID, and the
// hotkey-macro panel in the macro editor.
import { setTransport } from "../hid/transport.js";
import { tauriTransport } from "../hid/tauri.js";
import { macroPanels, prefPanels } from "../ui/extensions.js";
import { hotkeyPanel } from "./hotkeys.js";
import { startupPanel } from "./startup.js";

setTransport(tauriTransport);
macroPanels.push(hotkeyPanel);
prefPanels.push(startupPanel);
