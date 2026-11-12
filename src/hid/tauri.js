// The desktop app's transport: HID through the Rust backend (src-tauri/src/hid.rs, hidapi) over
// Tauri IPC, since desktop webviews have no WebHID. Each device path gets one handle, built with
// createHidHandle() and given WebHID-style collections from its report descriptor.
//
// Like the browser, the app only sees keyboards the user has picked once. Picks are remembered
// in this webview's storage, so allowed keyboards reconnect on their own when plugged back in.
import { createHidHandle } from "./adapter.js";
import { parseReportDescriptor, reportLength, usesReportIds } from "./descriptor.js";
import { pickDevices } from "./picker.js";

const tauri = () => window.__TAURI__;
const invoke = (cmd, args) => tauri().core.invoke(cmd, args);

const GRANTS = "allkeebs.desktop.granted";
const readGrants = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(GRANTS) || "[]"));
  } catch {
    return new Set();
  }
};
const saveGrants = (set) => {
  try {
    localStorage.setItem(GRANTS, JSON.stringify([...set]));
  } catch {
    /* storage blocked */
  }
};
// Paths can change between plugs, so a grant is the device's identity, not its path.
const grantKey = (info) =>
  [info.vendorId, info.productId, info.usagePage, info.usage, info.serial || info.productName].join(
    ":",
  );

const handles = new Map(); // path -> handle
const inputs = new Map(); // path -> onInput
const subscribers = { connect: new Set(), disconnect: new Set() };
let started = null;

function start() {
  started ||= (async () => {
    const { listen } = tauri().event;
    await listen("hid-input", ({ payload }) => inputs.get(payload.path)?.(payload.data));
    await listen("hid-connect", async ({ payload }) => {
      if (!readGrants().has(grantKey(payload))) return;
      const handle = await handleFor(payload);
      for (const fn of subscribers.connect) fn(handle);
    });
    await listen("hid-disconnect", ({ payload }) => {
      const handle = handles.get(payload.path);
      if (!handle) return;
      handles.delete(payload.path);
      inputs.delete(payload.path);
      handle.opened = false;
      for (const fn of subscribers.disconnect) fn(handle);
    });
  })();
  return started;
}

async function handleFor(info) {
  const known = handles.get(info.path);
  if (known) return known;
  let collections = [];
  try {
    collections = parseReportDescriptor(await invoke("hid_descriptor", { path: info.path }));
  } catch {
    /* some devices won't share it; fall back to the usage hidapi reports */
  }
  if (!collections.length)
    collections = [
      {
        usagePage: info.usagePage,
        usage: info.usage,
        type: 1,
        children: [],
        inputReports: [],
        outputReports: [],
        featureReports: [],
      },
    ];
  const numbered = usesReportIds(collections);
  const path = info.path;
  const handle = createHidHandle(
    { ...info, collections },
    {
      async connect(onInput) {
        inputs.set(path, (data) => {
          const bytes = Uint8Array.from(data);
          if (numbered) onInput(bytes[0], bytes.subarray(1));
          else onInput(0, bytes);
        });
        await invoke("hid_open", { path });
      },
      async disconnect() {
        inputs.delete(path);
        await invoke("hid_close", { path }).catch(() => {});
      },
      send: (reportId, bytes) => invoke("hid_write", { path, data: [reportId, ...bytes] }),
      sendFeature: (reportId, bytes) =>
        invoke("hid_send_feature", { path, data: [reportId, ...bytes] }),
      async receiveFeature(reportId) {
        const length = reportLength(collections, "featureReports", reportId) || 64;
        const got = Uint8Array.from(await invoke("hid_get_feature", { path, reportId, length }));
        // Like Chrome: the id byte stays at the front only for numbered reports.
        return reportId === 0 ? got.subarray(1) : got;
      },
    },
  );
  handles.set(path, handle);
  return handle;
}

// WebHID filter semantics: a device matches when any filter matches all of its given fields.
const matches = (info, filters) =>
  !filters.length ||
  filters.some(
    (f) =>
      (f.vendorId == null || f.vendorId === info.vendorId) &&
      (f.productId == null || f.productId === info.productId) &&
      (f.usagePage == null || f.usagePage === info.usagePage) &&
      (f.usage == null || f.usage === info.usage),
  );

export const tauriTransport = {
  name: "tauri",
  support: () => (tauri()?.core?.invoke ? "ok" : "missing"),
  async request(filters) {
    await start();
    const list = (await invoke("hid_devices")).filter((d) => matches(d, filters));
    const chosen = await pickDevices(list);
    const grants = readGrants();
    for (const d of chosen) grants.add(grantKey(d));
    saveGrants(grants);
    return Promise.all(chosen.map(handleFor));
  },
  async granted() {
    await start();
    const grants = readGrants();
    const list = (await invoke("hid_devices")).filter((d) => grants.has(grantKey(d)));
    return Promise.all(list.map(handleFor));
  },
  on(type, fn) {
    start();
    subscribers[type]?.add(fn);
    return () => subscribers[type]?.delete(fn);
  },
};
