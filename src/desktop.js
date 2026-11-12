// allkeebs desktop app entry (npm run build:desktop): the website's app, with HID through the
// Rust backend and hotkey macros. setup.js must run before app.js starts the UI.
import "./desktop/setup.js";
import "./app.js";
