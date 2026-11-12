// The one place allkeebs reaches the system's HID layer. Everything else (the drivers, the
// Vial reader, the UI) works with the device handles a transport hands out.
//
// A transport is:
//   name                      short label for the activity log ("webhid", "tauri", ...)
//   support()                 "ok" | "missing" | "blocked"
//   request(filters)          Promise<handle[]>: ask the user to pick devices (WebHID filters)
//   granted()                 Promise<handle[]>: devices the user already allowed
//   on(type, fn)              type "connect" | "disconnect"; fn(handle); returns an unsubscribe
//
// A handle has the HIDDevice members the drivers use: vendorId, productId, productName,
// collections, opened, open(), close(), sendReport(), sendFeatureReport(),
// receiveFeatureReport(), and "inputreport" events whose `device` is the handle itself. A
// transport must hand out the same handle object for the same device every time, because the
// app matches unplug events and repeated grants by identity. WebHID's HIDDevice already is
// such a handle; other backends build one with createHidHandle() from ./adapter.js.
import { webHidTransport } from "./webhid.js";

let current = webHidTransport;

/** The active transport. The web build always uses WebHID. */
export const transport = () => current;

/** Swap the transport, e.g. the desktop app's Tauri IPC backend. Call before the app starts. */
export function setTransport(next) {
  for (const k of ["support", "request", "granted", "on"])
    if (typeof next?.[k] !== "function") throw new Error(`HID transport is missing ${k}()`);
  current = next;
}
